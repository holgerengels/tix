const fs = require('fs');
const path = require('path');
const connectDB = require('../src/db');
const User = require('../src/models/user');
const mongoose = require('mongoose');
const ldap = require('ldapjs');

function loadSettings() {
    const candidates = [
        path.join(__dirname, '../../config/settings.json'),
        path.join(__dirname, '../config/settings.json'),
        path.join(__dirname, '../../settings.json'),
        '/config/settings.json',
        '/app/config/settings.json'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    }
    throw new Error(`Settings file not found in candidates: ${candidates.join(', ')}`);
}

function escapeLDAP(str) {
    if (!str) return '';
    return str.replace(/[\\*\\(\\)\\\\\\0]/g, function (char) {
        switch (char) {
            case '*': return '\\2a';
            case '(': return '\\28';
            case ')': return '\\29';
            case '\\': return '\\5c';
            case '\0': return '\\00';
            default: return char;
        }
    });
}

function extractAttr(entry, attrName) {
    if (!entry) return '';
    const val = entry[attrName] || entry[attrName.toLowerCase()];
    if (!val) return '';
    if (Array.isArray(val)) return val[0] ? String(val[0]).trim() : '';
    return String(val).trim();
}

function extractEmployeeId(entry) {
    return extractAttr(entry, 'employeeID');
}

function fetchAllLdapUsers(client, ldapConfig) {
    return new Promise((resolve, reject) => {
        const opts = {
            filter: ldapConfig.userfilter,
            scope: 'sub',
            attributes: ['sAMAccountName', 'employeeID', 'displayName']
        };
        client.search(ldapConfig.basedn, opts, (err, searchRes) => {
            if (err) return reject(err);
            const users = [];
            searchRes.on('searchEntry', entry => {
                let userObj = entry.object;
                if (!userObj && entry.attributes) {
                    userObj = {};
                    entry.attributes.forEach(attr => {
                        userObj[attr.type] = attr.values;
                    });
                }
                if (userObj) {
                    users.push(userObj);
                }
            });
            searchRes.on('end', () => resolve(users));
            searchRes.on('error', searchErr => reject(searchErr));
        });
    });
}

function searchUserLdap(client, ldapConfig, username) {
    return new Promise((resolve, reject) => {
        const escapedUsername = escapeLDAP(username);
        const filter = `(&${ldapConfig.userfilter}(sAMAccountName=${escapedUsername}))`;
        const opts = {
            filter: filter,
            scope: 'sub',
            attributes: ['sAMAccountName', 'employeeID']
        };
        client.search(ldapConfig.basedn, opts, (err, searchRes) => {
            if (err) return reject(err);
            let userEntry = null;
            searchRes.on('searchEntry', entry => {
                userEntry = entry.object;
                if (!userEntry && entry.attributes) {
                    userEntry = {};
                    entry.attributes.forEach(attr => {
                        userEntry[attr.type] = attr.values;
                    });
                }
            });
            searchRes.on('end', result => {
                if (result.status !== 0) {
                    console.warn(`[LDAP] Search returned status ${result.status} for ${username}.`);
                }
                resolve(userEntry);
            });
            searchRes.on('error', searchErr => reject(searchErr));
        });
    });
}

async function run() {
    const isCommit = process.argv.includes('--commit');
    console.log('=== Migration: Benachrichtigungskanäle anpassen ===');
    console.log(`Modus: ${isCommit ? 'COMMIT (Änderungen werden in MongoDB gespeichert)' : 'DRY-RUN (Nur Lesezugriff, Simulation)'}`);
    console.log('Regeln:');
    console.log('  1. mailto: bleibt unverändert erhalten');
    console.log('  2. E-Mail ohne mailto: Präfix wird korrigiert');
    console.log('  3. Leere Kanäle werden mit nctalk:<employeeID> aus LDAP befüllt');
    console.log('  4. Bestehende nctalk: Kanäle bleiben erhalten\n');

    let settings;
    try {
        settings = loadSettings();
    } catch (e) {
        console.error('Fehler beim Laden der Konfiguration:', e.message);
        process.exit(1);
    }

    const ldapConfig = settings.server && settings.server.ldap;
    if (!ldapConfig) {
        console.error('Keine LDAP-Konfiguration in settings.json gefunden.');
        process.exit(1);
    }

    await connectDB();

    const client = ldap.createClient({ url: ldapConfig.url });
    client.on('error', err => {
        console.error('[LDAP] Client-Fehler:', err.message);
    });

    await new Promise((resolve, reject) => {
        client.bind(ldapConfig.binddn, ldapConfig.bindpw, err => {
            if (err) return reject(err);
            resolve();
        });
    });
    console.log('Mit LDAP verbunden.');

    // Pre-fetch all LDAP users into a Map for fast lookup
    const ldapMap = new Map();
    try {
        const allEntries = await fetchAllLdapUsers(client, ldapConfig);
        for (const entry of allEntries) {
            const sam = extractAttr(entry, 'sAMAccountName');
            if (sam) {
                ldapMap.set(sam.toLowerCase(), entry);
            }
        }
        console.log(`LDAP: ${ldapMap.size} Konten geladen.`);
    } catch (err) {
        console.warn('[LDAP] Batch-Abfrage fehlgeschlagen, wechsle zu Einzelsuche:', err.message);
    }

    const mongoUsers = await User.find({}).sort({ username: 1 });
    console.log(`MongoDB: ${mongoUsers.length} Benutzer gefunden.\n`);

    const toFixEmail = [];
    const toFillNctalk = [];
    const skippedNoEmpId = [];
    const skippedNotFoundInLdap = [];
    let countKeepMailto = 0;
    let countKeepNctalk = 0;

    for (const user of mongoUsers) {
        const uname = user.username.toLowerCase();
        const currentUri = (user.notificationUri || '').trim();

        // LDAP-Eintrag für Nutzer ermitteln (für employeeId Sync)
        let ldapUser = ldapMap.get(uname);
        if (!ldapUser) {
            try {
                ldapUser = await searchUserLdap(client, ldapConfig, uname);
            } catch (e) {
                // ignore
            }
        }
        const empId = extractEmployeeId(ldapUser);

        // Regel 1: mailto: bleibt unverändert
        if (currentUri.startsWith('mailto:')) {
            countKeepMailto++;
            if (empId && !user.employeeId && isCommit) {
                await User.updateOne({ _id: user._id }, { $set: { employeeId: empId } });
            }
            continue;
        }

        // Regel 2: E-Mail ohne mailto: Präfix wird korrigiert
        if (!currentUri.includes(':') && currentUri.includes('@')) {
            const correctedUri = `mailto:${currentUri.toLowerCase()}`;
            toFixEmail.push({
                id: user._id,
                username: user.username,
                current: currentUri,
                target: correctedUri,
                empId
            });
            continue;
        }

        // Regel 4: Bestehendes nctalk bleibt erhalten
        if (currentUri.startsWith('nctalk:')) {
            countKeepNctalk++;
            if (empId && !user.employeeId && isCommit) {
                await User.updateOne({ _id: user._id }, { $set: { employeeId: empId } });
            }
            continue;
        }

        // Regel 3: Leere Kanäle mit nctalk:<employeeID> aus LDAP befüllen
        if (!currentUri) {
            if (!ldapUser) {
                skippedNotFoundInLdap.push(user.username);
                continue;
            }

            if (!empId) {
                skippedNoEmpId.push(user.username);
                continue;
            }

            toFillNctalk.push({
                id: user._id,
                username: user.username,
                target: `nctalk:${empId}`,
                empId
            });
            continue;
        }

        console.warn(`[UNBEKANNT] ${user.username}: '${currentUri}' entspricht keinem bekannten Muster`);
    }

    client.unbind();

    // 1. Liste: E-Mails ohne mailto: Präfix
    console.log(`\n======================================================`);
    console.log(`1. E-Mail-Adressen ohne mailto: Präfix korrigieren (${toFixEmail.length}):`);
    console.log(`======================================================`);
    if (toFixEmail.length === 0) {
        console.log('  (keine)');
    } else {
        for (const item of toFixEmail) {
            console.log(`  - ${item.username}: '${item.current}' → '${item.target}'`);
            if (isCommit) {
                const updateFields = { notificationUri: item.target };
                if (item.empId) updateFields.employeeId = item.empId;
                await User.updateOne({ _id: item.id }, { $set: updateFields });
            }
        }
    }

    // 2. Liste: Leere Kanäle mit nctalk befüllen
    console.log(`\n======================================================`);
    console.log(`2. Leere Kanäle mit nctalk aus LDAP befüllen (${toFillNctalk.length}):`);
    console.log(`======================================================`);
    if (toFillNctalk.length === 0) {
        console.log('  (keine)');
    } else {
        for (const item of toFillNctalk) {
            console.log(`  - ${item.username} → '${item.target}'`);
            if (isCommit) {
                await User.updateOne(
                    { _id: item.id },
                    { $set: { notificationUri: item.target, employeeId: item.empId } }
                );
            }
        }
    }

    // 3. Übersprungene Benutzer
    if (skippedNoEmpId.length > 0 || skippedNotFoundInLdap.length > 0) {
        console.log(`\n======================================================`);
        console.log(`Übersprungene Benutzer:`);
        console.log(`======================================================`);
        if (skippedNoEmpId.length > 0) {
            console.log(`  Ohne employeeID im LDAP (${skippedNoEmpId.length}):`);
            skippedNoEmpId.forEach(u => console.log(`    - ${u}`));
        }
        if (skippedNotFoundInLdap.length > 0) {
            console.log(`  Nicht im LDAP gefunden (${skippedNotFoundInLdap.length}):`);
            skippedNotFoundInLdap.forEach(u => console.log(`    - ${u}`));
        }
    }

    // Zusammenfassung
    const totalChanges = toFixEmail.length + toFillNctalk.length;
    console.log(`\n=== Zusammenfassung ===`);
    console.log(`Benutzer gesamt in MongoDB: ${mongoUsers.length}`);
    console.log(`Unverändert mailto:         ${countKeepMailto}`);
    console.log(`Unverändert nctalk:         ${countKeepNctalk}`);
    console.log(`${isCommit ? 'Korrigiert (mailto: ergänzt):' : 'Zu korrigieren (mailto:):   '} ${toFixEmail.length}`);
    console.log(`${isCommit ? 'Befüllt (nctalk aus LDAP):  ' : 'Zu befüllen (nctalk):       '} ${toFillNctalk.length}`);
    console.log(`Änderungen gesamt:          ${totalChanges}`);
    console.log(`Übersprungen:               ${skippedNoEmpId.length + skippedNotFoundInLdap.length}`);

    if (isCommit) {
        console.log(`\n✅ Alle ${totalChanges} Änderungen wurden erfolgreich in MongoDB gespeichert.`);
    } else if (totalChanges > 0) {
        console.log(`\nHinweis: Das war ein reiner DRY-RUN (Simulation, keine DB-Änderungen).`);
        console.log(`Zum Anwenden bitte mit '--commit' ausführen:`);
        console.log(`  node scripts/sync_notification_channels.js --commit`);
    }

    if (require.main === module) {
        await mongoose.connection.close();
        process.exit(0);
    }
}

module.exports = {
    run,
    loadSettings,
    escapeLDAP,
    extractAttr,
    extractEmployeeId,
    searchUserLdap,
    fetchAllLdapUsers
};

if (require.main === module) {
    run().catch(err => {
        console.error('Migration fehlgeschlagen:', err);
        process.exit(1);
    });
}
