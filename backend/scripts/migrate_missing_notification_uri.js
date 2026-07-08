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

function extractEmployeeId(entry) {
    const val = entry.employeeID;
    if (!val) return '';
    if (Array.isArray(val)) return val[0];
    return val;
}

async function run() {
    const isCommit = process.argv.includes('--commit');
    console.log('=== Migration: Add missing notificationUri (nctalk) ===');
    console.log(`Mode: ${isCommit ? 'COMMIT' : 'DRY‑RUN'}\n`);

    let settings;
    try {
        settings = loadSettings();
    } catch (e) {
        console.error('Failed to load configuration:', e.message);
        process.exit(1);
    }

    const ldapConfig = settings.server && settings.server.ldap;
    if (!ldapConfig) {
        console.error('LDAP configuration missing in settings.json.');
        process.exit(1);
    }

    await connectDB();

    const users = await User.find({
        $or: [
            { notificationUri: { $exists: false } },
            { notificationUri: null },
            { notificationUri: '' }
        ]
    });
    console.log(`Found ${users.length} users without notificationUri.`);

    if (users.length === 0) {
        console.log('Nothing to migrate.');
        await mongoose.connection.close();
        process.exit(0);
    }

    const client = ldap.createClient({ url: ldapConfig.url });
    client.on('error', err => {
        console.error('[LDAP] Client error:', err.message);
    });

    await new Promise((resolve, reject) => {
        client.bind(ldapConfig.binddn, ldapConfig.bindpw, err => {
            if (err) return reject(err);
            resolve();
        });
    });
    console.log('Connected to LDAP.');

    const stats = { updated: 0, skipped: 0, notFound: 0, noEmpId: 0 };
    for (const user of users) {
        try {
            const ldapUser = await searchUserLdap(client, ldapConfig, user.username);
            if (!ldapUser) {
                console.warn(`[NOT FOUND] User '${user.username}' not found in LDAP.`);
                stats.notFound++;
                continue;
            }
            const empId = extractEmployeeId(ldapUser);
            if (!empId) {
                console.warn(`[NO EMPLOYEEID] User '${user.username}' has no employeeID in LDAP.`);
                stats.noEmpId++;
                continue;
            }
            const uri = `nctalk:${empId}`;
            if (isCommit) {
                const result = await User.updateOne(
                    { _id: user._id, $or: [{ notificationUri: { $exists: false } }, { notificationUri: null }, { notificationUri: '' }] },
                    { $set: { notificationUri: uri } }
                );
                if (result.modifiedCount > 0) {
                    console.log(`[UPDATED] ${user.username} → ${uri}`);
                    stats.updated++;
                } else {
                    console.log(`[SKIP] ${user.username} already has a value.`);
                    stats.skipped++;
                }
            } else {
                console.log(`[DRY RUN] Would set ${user.username} → ${uri}`);
                stats.updated++;
            }
        } catch (err) {
            console.error(`[ERROR] ${user.username}:`, err.message);
        }
    }

    client.unbind();

    console.log('\n=== Summary ===');
    console.log(`Processed: ${users.length}`);
    console.log(`Updated: ${stats.updated}`);
    console.log(`Skipped (already set): ${stats.skipped}`);
    console.log(`Not found in LDAP: ${stats.notFound}`);
    console.log(`Missing employeeID: ${stats.noEmpId}`);

    if (!isCommit && stats.updated > 0) {
        console.log("\nRun with '--commit' to apply these changes.");
    }

    if (require.main === module) {
        await mongoose.connection.close();
        process.exit(0);
    }
}

module.exports = { run, extractEmployeeId, escapeLDAP, searchUserLdap };
if (require.main === module) {
    run().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}
