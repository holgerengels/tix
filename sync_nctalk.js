const fs = require('fs');
const ldap = require('./backend/node_modules/ldapjs');
const path = require('path');

const isCommit = process.argv.includes('--commit');

function loadConf(filename) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
}

async function bindLdap(config) {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: config.url });
        client.on('error', err => reject(err));
        client.bind(config.binddn, config.bindpw, (err) => {
            if (err) return reject(err);
            resolve(client);
        });
    });
}

async function searchLdap(client, basedn, filter, attributes) {
    return new Promise((resolve, reject) => {
        const opts = { scope: 'sub', filter, attributes };
        client.search(basedn, opts, (err, searchRes) => {
            if (err) return reject(err);
            const entries = [];
            
            searchRes.on('searchEntry', (entry) => {
                let obj = entry.object;
                if (!obj) {
                    obj = { dn: entry.objectName ? entry.objectName.toString() : '' };
                    if (entry.attributes) {
                        entry.attributes.forEach(attr => {
                            obj[attr.type] = attr.values;
                        });
                    }
                }
                entries.push(obj);
            });
            
            searchRes.on('error', err => reject(err));
            searchRes.on('end', () => resolve(entries));
        });
    });
}

function extractAttr(obj, attrName) {
    let raw = obj[attrName] || obj[attrName.toLowerCase()];
    if (Array.isArray(raw)) return raw[0];
    return raw;
}

async function modifyLdap(client, dn, attr, newValue) {
    return new Promise((resolve, reject) => {
        const modification = new ldap.Change({
            operation: 'replace',
            modification: {
                type: attr,
                values: [newValue]
            }
        });
        client.modify(dn, modification, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function run() {
    console.log("=== LDAP nctalk Sync Script ===");
    console.log(`Modus: ${isCommit ? 'COMMIT (Alle Änderungen werden in LDAP geschrieben)' : 'DRY-RUN (Nur Lesezugriff)'}\n`);

    let settings;
    let paedmlConf;
    
    try {
        settings = loadConf('config/settings.json');
        paedmlConf = loadConf('paedml.json');
    } catch(e) {
        console.error("Fehler beim Laden der Konfigurationen:", e.message);
        process.exit(1);
    }
    
    const adminConfig = settings.server.ldap;

    console.log("Verbinde zu PaedML LDAP...");
    let paedmlClient;
    try {
        paedmlClient = await bindLdap(paedmlConf);
    } catch(e) {
        console.error("Fehler beim Verbinden mit PaedML LDAP:", e.message);
        process.exit(1);
    }

    console.log("Lese PaedML Nutzer...");
    let paedmlUsers = [];
    try {
        paedmlUsers = await searchLdap(
            paedmlClient, 
            paedmlConf.basedn, 
            '(&(objectclass=person)(initials=*))', 
            ['uid', 'sAMAccountName', 'initials', 'cn']
        );
    } catch(e) {
        console.error("Fehler beim Suchen in PaedML:", e.message);
        process.exit(1);
    }
    
    const paedmlMap = new Map();
    for (const entry of paedmlUsers) {
        let username = extractAttr(entry, 'uid') || extractAttr(entry, 'sAMAccountName') || extractAttr(entry, 'cn');
        let initials = extractAttr(entry, 'initials');
        if (username && initials) {
            paedmlMap.set(initials.toLowerCase(), username);
        }
    }
    console.log(`${paedmlMap.size} Nutzer mit 'initials' im PaedML gefunden.\n`);
    paedmlClient.unbind();


    console.log("Verbinde zu Verwaltungs-LDAP...");
    let adminClient;
    try {
        adminClient = await bindLdap(adminConfig);
    } catch(e) {
        console.error("Fehler beim Verbinden mit Admin LDAP:", e.message);
        process.exit(1);
    }

    console.log("Lese Verwaltungs-Nutzer...");
    let adminUsers = [];
    try {
        const baseFilter = adminConfig.userfilter.replace(/^[\(]+|[\)]+$/g, '');
        const finalFilter = `(&(${baseFilter})(initials=*)(sAMAccountName=*_*))`;
        
        adminUsers = await searchLdap(
            adminClient, 
            adminConfig.basedn, 
            finalFilter, 
            ['sAMAccountName', 'initials', 'otherMailbox', 'dn']
        );
    } catch(e) {
        console.error("Fehler beim Suchen in Admin LDAP:", e.message);
        process.exit(1);
    }

    console.log(`Gefundene Lehrer im Verwaltungsnetz: ${adminUsers.length}\n`);

    let changesCount = 0;
    
    for (const entry of adminUsers) {
        const sAMAccountName = extractAttr(entry, 'sAMAccountName');
        const initials = extractAttr(entry, 'initials');
        const currentOtherBox = extractAttr(entry, 'otherMailbox');
        const dn = entry.dn || extractAttr(entry, 'dn');
        
        if (!initials || !dn) continue;
        
        const inKey = initials.trim().toLowerCase();
        
        if (paedmlMap.has(inKey)) {
            const paedmlUser = paedmlMap.get(inKey);
            const newValue = `nctalk:${paedmlUser}`;
            
            if (currentOtherBox !== newValue) {
                if (!isCommit) {
                    console.log(`[DRY RUN] Würde aktualisieren: ${sAMAccountName} (Kürzel: ${initials}) -> ${newValue} (aktuell: ${currentOtherBox || 'nicht gesetzt'})`);
                    changesCount++;
                } else {
                    try {
                        await modifyLdap(adminClient, dn, 'otherMailbox', newValue);
                        console.log(`[SUCCESS] Aktualisiert: ${sAMAccountName} (Kürzel: ${initials}) -> ${newValue}`);
                        changesCount++;
                    } catch(e) {
                        console.error(`[ERROR] Fehler beim Aktualisieren von ${sAMAccountName}:`, e.message);
                    }
                }
            } else {
                console.log(`[SKIP] ${sAMAccountName} hat bereits den korrekten Wert: ${newValue}`);
            }
        } else {
            console.log(`[NOT FOUND] Kein Mapping für Kürzel '${initials}' des Nutzers '${sAMAccountName}' im PaedML gefunden.`);
        }
    }
    
    console.log(`\nFertig. ${changesCount} Datensätze ${isCommit ? 'wurden modifiziert' : 'würden modifiziert werden'}.`);
    
    if (!isCommit && changesCount > 0) {
        console.log("Hinweis: Rufe das Skript mit 'node sync_nctalk.js --commit' auf, um die Änderungen endgültig in das LDAP zu übertragen.");
    }
    
    adminClient.unbind();
}

run();
