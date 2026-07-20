const fs = require('fs');
const path = require('path');
const connectDB = require('../src/db');
const User = require('../src/models/user');
const mongoose = require('mongoose');
const ldap = require('ldapjs');


function loadSettings() {
    const settingsPath = path.join(__dirname, '../../config/settings.json');
    if (!fs.existsSync(settingsPath)) {
        throw new Error(`Settings file not found at ${settingsPath}`);
    }
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function normalizeNotificationUri(uri) {
    if (!uri) return '';
    return uri.split(',')
        .map(item => {
            const trimmed = item.trim();
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) return trimmed;
            const protocol = trimmed.substring(0, colonIndex).toLowerCase();
            const address = trimmed.substring(colonIndex + 1);
            return `${protocol}:${address}`;
        })
        .join(', ');
}

// Parses and normalizes notification channels from proxyAddresses attributes
function extractNotificationUris(ldapEntry) {
    const values = [];

    // Check proxyAddresses and common case variations returned by LDAP
    const candidates = [
        ldapEntry.proxyAddresses,
        ldapEntry.proxyaddresses
    ];

    for (const val of candidates) {
        if (!val) continue;
        const arr = Array.isArray(val) ? val : [val];
        for (const addr of arr) {
            if (typeof addr !== 'string') continue;
            const trimmed = addr.trim();
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) continue;

            let protocol = trimmed.substring(0, colonIndex).toLowerCase();
            const address = trimmed.substring(colonIndex + 1).trim();

            // Map smtp to mailto
            if (protocol === 'smtp') {
                protocol = 'mailto';
            }

            if (['mailto', 'nctalk', 'test'].includes(protocol) && address) {
                values.push(`${protocol}:${address}`);
            }
        }
    }

    // De-duplicate values
    const uniqueValues = [...new Set(values)];
    return normalizeNotificationUri(uniqueValues.join(', '));
}

// Helper to escape LDAP search filter values
function escapeLDAP(str) {
    if (!str) return '';
    return str.replace(/[\*\(\)\\\0]/g, function (char) {
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

function searchUserLdap(client, ldapConfig, username) {
    return new Promise((resolve, reject) => {
        const escapedUsername = escapeLDAP(username);
        const filter = `(&${ldapConfig.userfilter}(sAMAccountName=${escapedUsername}))`;

        const opts = {
            filter: filter,
            scope: 'sub',
            attributes: ['sAMAccountName', 'proxyAddresses']
        };

        client.search(ldapConfig.basedn, opts, (err, searchRes) => {
            if (err) return reject(err);

            let userEntry = null;

            searchRes.on('searchEntry', (entry) => {
                userEntry = entry.object;
                if (!userEntry && entry.attributes) {
                    userEntry = {};
                    entry.attributes.forEach(attr => {
                        userEntry[attr.type] = attr.values;
                    });
                }
            });

            searchRes.on('end', (result) => {
                if (result.status !== 0) {
                    console.warn(`[LDAP] LDAP-Suche gab Status ${result.status} für ${username} zurück.`);
                }
                resolve(userEntry);
            });

            searchRes.on('error', (searchErr) => {
                reject(searchErr);
            });
        });
    });
}

async function run() {
    const isCommit = process.argv.includes('--commit');
    console.log(`=== Migration: LDAP proxyAddresses -> MongoDB User Settings ===`);
    console.log(`Modus: ${isCommit ? 'COMMIT (Änderungen werden in MongoDB geschrieben)' : 'DRY-RUN (Nur Lesezugriff)'}\n`);

    // 1. Load Settings
    let settings;
    try {
        settings = loadSettings();
    } catch (e) {
        console.error('Fehler beim Laden der Konfiguration:', e.message);
        process.exit(1);
    }

    const ldapConfig = settings.server && settings.server.ldap;
    if (!ldapConfig) {
        console.error('Keine LDAP-Konfiguration in settings.json vorhanden.');
        process.exit(1);
    }

    // 2. Connect DB
    await connectDB();

    // 3. Find users without notificationUri
    const users = await User.find({
        $or: [
            { notificationUri: { $exists: false } },
            { notificationUri: null },
            { notificationUri: '' }
        ]
    });

    console.log(`Gefunden: ${users.length} Benutzer in MongoDB ohne konfigurierten Benachrichtigungskanal.`);

    let updatedCount = 0;

    if (users.length === 0) {
        console.log('Keine Migration erforderlich.');
    } else {
        // 4. Connect to LDAP
        console.log(`Verbinde zu LDAP unter ${ldapConfig.url}...`);
        const client = ldap.createClient({ url: ldapConfig.url });

        client.on('error', (err) => {
            console.error('[LDAP] Client-Fehler:', err.message);
        });

        await new Promise((resolve, reject) => {
            client.bind(ldapConfig.binddn, ldapConfig.bindpw, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        console.log('Erfolgreich mit LDAP verbunden.\n');

        for (const user of users) {
            try {
                const ldapUser = await searchUserLdap(client, ldapConfig, user.username);
                if (!ldapUser) {
                    console.log(`[NOT FOUND] Benutzer '${user.username}' wurde im LDAP nicht gefunden.`);
                    continue;
                }

                const uris = extractNotificationUris(ldapUser);
                if (uris) {
                    if (isCommit) {
                        // Atomic update: only set notificationUri if it is still empty
                        const result = await User.updateOne(
                            {
                                _id: user._id,
                                $or: [
                                    { notificationUri: { $exists: false } },
                                    { notificationUri: null },
                                    { notificationUri: '' }
                                ]
                            },
                            { $set: { notificationUri: uris } }
                        );
                        if (result.modifiedCount > 0) {
                            console.log(`[UPDATED] Benutzer '${user.username}': '${uris}'`);
                            updatedCount++;
                        } else {
                            console.log(`[SKIP] Benutzer '${user.username}' hat inzwischen bereits einen Kanal konfiguriert.`);
                        }
                    } else {
                        console.log(`[DRY RUN] Würde aktualisieren: '${user.username}' -> '${uris}'`);
                        updatedCount++;
                    }
                } else {
                    console.log(`[EMPTY] Keine passenden proxyAddresses für Benutzer '${user.username}' im LDAP gefunden.`);
                }
            } catch (err) {
                console.error(`[ERROR] Fehler bei Benutzer '${user.username}':`, err.message);
            }
        }

        client.unbind();
        console.log(`\n${isCommit ? 'Migration' : 'Dry-Run'} abgeschlossen. ${updatedCount} von ${users.length} Benutzern ${isCommit ? 'wurden aktualisiert' : 'würden aktualisiert werden'}.`);
    }

    // 5. Query and list users who still don't have notificationUri configured
    const remainingUsers = await User.find({
        $or: [
            { notificationUri: { $exists: false } },
            { notificationUri: null },
            { notificationUri: '' }
        ]
    }, { username: 1 });

    if (remainingUsers.length > 0) {
        console.log('\nFolgende Benutzer haben nach der Migration immer noch keinen Benachrichtigungskanal konfiguriert:');
        remainingUsers.forEach(u => console.log(` - ${u.username}`));
    } else {
        console.log('\nAlle Benutzer haben nun einen Benachrichtigungskanal konfiguriert.');
    }

    if (!isCommit && updatedCount > 0) {
        console.log("\nHinweis: Rufe das Skript mit 'node migrate_ldap_proxyaddresses.js --commit' auf, um die Änderungen in die Datenbank zu schreiben.");
    }

    if (require.main === module) {
        await mongoose.connection.close();
        process.exit(0);
    }
}

module.exports = {
    run,
    normalizeNotificationUri,
    extractNotificationUris,
    escapeLDAP,
    searchUserLdap
};

if (require.main === module) {
    run().catch(err => {
        console.error('Migration fehlgeschlagen:', err);
        process.exit(1);
    });
}
