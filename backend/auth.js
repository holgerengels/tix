const jwt = require('jsonwebtoken');
const ldap = require('ldapjs');
const fs = require('fs');
const path = require('path');

// Load Settings
let settings = {};
try {
    const settingsPath = path.join(__dirname, '../config/settings.json');
    if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
} catch (e) {
    console.error('Error loading settings.json:', e);
}
console.log(`[Auth] Settings loaded. DevMode: ${settings.devmode}`);

const MOCK_USERS = [
    { username: 'admin', password: 'password', groups: ['Administration', 'Schulleitung', 'Stundenplanung'] },
    { username: 'lehrer1', password: 'password', groups: ['Lehrkräfte'] },
    { username: 'lehrer2', password: 'password', groups: ['Lehrkräfte'] },
    { username: 'schulleiter', password: 'password', groups: ['Schulleitung', 'Lehrkräfte'] },
    { username: 'abteilungsleiter', password: 'password', groups: ['Abteilungsleitung', 'Lehrkräfte'] },
    { username: 'stundenplaner', password: 'password', groups: ['Stundenplanung', 'Lehrkräfte'] },
    { username: 'hausmeister', password: 'password', groups: ['Hausmeister'] },
    { username: 'netzwerker', password: 'password', groups: ['Netzwerkteam', 'Lehrkräfte'] },
];

const SECRET_KEY = 'supersecretkey'; // In prod, use .env

const login = async (username, password) => {
    console.log(`[Auth] Attempting login for user: ${username}`);

    // 1. DevMode / Mock Check
    if (settings.devmode) {
        const user = MOCK_USERS.find(u => u.username === username && u.password === password);
        if (user) {
            console.log(`[Auth] Mock login successful for ${username}`);
            const token = jwt.sign({ username: user.username, groups: user.groups }, SECRET_KEY, { expiresIn: '8h' });
            return { token, user: { username: user.username, groups: user.groups } };
        }
    }

    // 2. LDAP Auth
    if (!settings.server || !settings.server.ldap) {
        console.error('[Auth] LDAP settings missing');
        return null;
    }

    const ldapConfig = settings.server.ldap;

    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: ldapConfig.url
        });

        client.on('error', (err) => {
            console.error('[Auth] LDAP Client Error:', err);
            resolve(null);
        });

        // A. Bind with Service Account
        client.bind(ldapConfig.binddn, ldapConfig.bindpw, (err) => {
            if (err) {
                console.error('[Auth] LDAP Bind Error:', err);
                client.unbind();
                return resolve(null);
            }

            // B. Search for User
            // Filter: (&(userfilter)(sAMAccountName=username))
            // Filter: (&(userfilter)(sAMAccountName=username))
            const filter = `(&${ldapConfig.userfilter}(sAMAccountName=${username}))`;
            const opts = {
                filter: filter,
                scope: 'sub',
                attributes: ['dn', 'memberOf']
            };

            client.search(ldapConfig.basedn, opts, (err, searchRes) => {
                if (err) {
                    console.error('[Auth] LDAP Search Error:', err);
                    client.unbind();
                    return resolve(null);
                }

                let userEntry = null;

                searchRes.on('searchEntry', (entry) => {
                    if (entry.object) {
                        userEntry = entry.object;
                    } else {
                        // Fallback: Parse attributes manually
                        userEntry = { dn: entry.objectName.toString() };
                        if (entry.attributes) {
                            entry.attributes.forEach(attr => {
                                // attr.type is the name
                                const values = attr.values;
                                userEntry[attr.type] = values;
                                if (attr.type === 'distinguishedName') {
                                    userEntry.dn = Array.isArray(values) ? values[0] : values;
                                }
                            });
                        }
                    }
                });

                searchRes.on('end', (result) => {
                    if (result.status !== 0) {
                        console.error('[Auth] LDAP Search Status:', result.status);
                        client.unbind();
                        return resolve(null);
                    }

                    if (!userEntry) {
                        console.log(`[Auth] User ${username} not found in LDAP`);
                        client.unbind();
                        return resolve(null);
                    }

                    // C. Verify Password (Bind as User)
                    const userClient = ldap.createClient({ url: ldapConfig.url });

                    userClient.bind(userEntry.dn, password, (err) => {
                        if (err) {
                            console.log(`[Auth] Password check failed for ${username}`);
                            userClient.unbind();
                            client.unbind();
                            return resolve(null);
                        }

                        // Success! Process Groups
                        userClient.unbind();
                        client.unbind();

                        const groups = [];
                        const rawGroups = Array.isArray(userEntry.memberOf) ? userEntry.memberOf : [userEntry.memberOf];

                        // memberOf format: CN=Groupname,OU=...,DC=...
                        // We need to parse CN, check prefix, and strip it.
                        const prefix = ldapConfig.groupprefix || '';

                        if (rawGroups) {
                            rawGroups.forEach(groupDn => {
                                if (!groupDn) return;
                                // Extract CN
                                const match = groupDn.match(/^CN=([^,]+)/i);
                                if (match) {
                                    const cn = match[1];
                                    if (cn.startsWith(prefix)) {
                                        groups.push(cn.substring(prefix.length));
                                    }
                                }
                            });
                        }

                        console.log(`[Auth] LDAP Login successful for ${username}. Groups: ${groups.join(', ')}`);

                        const token = jwt.sign({ username: username, groups: groups }, SECRET_KEY, { expiresIn: '8h' });
                        resolve({ token, user: { username: username, groups: groups } });
                    });
                });

                searchRes.on('error', (err) => {
                    console.error('[Auth] LDAP Search Event Error:', err);
                    client.unbind();
                    resolve(null);
                });
            });
        });
    });
};

const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No token provided' });

    jwt.verify(token.split(' ')[1], SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Failed to authenticate token' });
        req.user = decoded;
        next();
    });
};

const getUsers = async (filterGroups = []) => {
    let users = [];

    // 1. DevMode: Start with mock users
    if (settings.devmode) {
        users = MOCK_USERS.map(({ password, ...u }) => u);
    }

    // 2. LDAP
    if (settings.server && settings.server.ldap) {
        const ldapConfig = settings.server.ldap;

        try {
            const ldapUsers = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: ldapConfig.url });

                client.on('error', (err) => {
                    console.error('[Auth] LDAP Client Error (getUsers):', err);
                    resolve([]);
                });

                client.bind(ldapConfig.binddn, ldapConfig.bindpw, (err) => {
                    if (err) {
                        client.unbind();
                        console.error('[Auth] LDAP Bind Error (getUsers):', err);
                        return resolve([]); // Gracefully return empty list on bind error
                    }

                    // Search for all users
                    const opts = {
                        filter: ldapConfig.userfilter, // e.g. (&(objectclass=person))
                        scope: 'sub',
                        attributes: ['sAMAccountName', 'memberOf']
                    };

                    client.search(ldapConfig.basedn, opts, (err, searchRes) => {
                        if (err) {
                            client.unbind();
                            console.error('[Auth] LDAP Search Error (getUsers):', err);
                            return resolve([]);
                        }

                        const foundUsers = [];
                        console.log(`[Auth] LDAP Search started. Base: ${ldapConfig.basedn}, Filter: ${opts.filter}`);

                        searchRes.on('searchEntry', (entry) => {
                            let username = '';
                            let groups = [];

                            // console.log('[Auth] LDAP Entry found:', entry.objectName.toString());

                            let userAttributes = entry.object;

                            if (!userAttributes) {
                                // Fallback: Parse attributes manually if entry.object is missing
                                userAttributes = {};
                                if (entry.attributes) {
                                    entry.attributes.forEach(attr => {
                                        const values = attr.values;
                                        // Handle single value vs array? ldapjs usually gives array in values
                                        userAttributes[attr.type] = Array.isArray(values) && values.length === 1 ? values[0] : values;
                                        // Ensure sAMAccountName is accessible as property even if array?
                                        if (attr.type === 'sAMAccountName' && Array.isArray(values) && values.length > 0) {
                                            userAttributes.sAMAccountName = values[0];
                                        }
                                    });
                                }
                            }

                            if (userAttributes) {
                                // Normalize username
                                username = userAttributes.sAMAccountName || userAttributes.samaccountname;
                                if (Array.isArray(username)) username = username[0];

                                // Normalize memberOf
                                let rawGroups = userAttributes.memberOf || userAttributes.memberof;
                                if (rawGroups) {
                                    if (!Array.isArray(rawGroups)) rawGroups = [rawGroups];

                                    const prefix = ldapConfig.groupprefix || '';
                                    rawGroups.forEach(groupDn => {
                                        const match = groupDn.match(/^CN=([^,]+)/i);
                                        if (match) {
                                            const cn = match[1];
                                            if (cn.startsWith(prefix)) {
                                                groups.push(cn.substring(prefix.length));
                                            }
                                        }
                                    });
                                }
                            }

                            if (username) {
                                foundUsers.push({ username, groups });
                            }
                        });

                        searchRes.on('end', () => {
                            console.log(`[Auth] LDAP Search finished. Found ${foundUsers.length} users.`);
                            client.unbind();
                            resolve(foundUsers);
                        });

                        searchRes.on('error', (err) => {
                            client.unbind();
                            console.error('[Auth] LDAP Search Stream Error:', err);
                            resolve([]);
                        });
                    });
                });
            });

            // Merge users avoiding duplicates (LDAP users appended if not exist)
            for (const lUser of ldapUsers) {
                if (!users.find(u => u.username === lUser.username)) {
                    users.push(lUser);
                }
            }
        } catch (err) {
            console.error('[Auth] General Error in getUsers:', err);
        }
    }

    // 3. Filter by groups if provided
    if (filterGroups && filterGroups.length > 0) {
        users = users.filter(u => u.groups && u.groups.some(g => filterGroups.includes(g)));
    }

    return users;
};


const isDevMode = () => !!settings.devmode;


// In-memory store for devmode settings
const devSettingsStore = {};

const getUserSettings = async (username) => {
    // 2. LDAP
    if (!settings.server || !settings.server.ldap) {
        // Fallback to devstore if no LDAP
        return devSettingsStore[username] || { notificationUri: '' };
    }
    const ldapConfig = settings.server.ldap;

    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: ldapConfig.url });
        client.on('error', (err) => {
            console.error('[Auth] LDAP Client Error (getSettings):', err);
            resolve({});
        });

        client.bind(ldapConfig.binddn, ldapConfig.bindpw, (err) => {
            if (err) {
                console.error('[Auth] LDAP Bind Error (getSettings):', err);
                client.unbind();
                return resolve({});
            }

            const filter = `(&${ldapConfig.userfilter}(sAMAccountName=${username}))`;
            const opts = {
                filter: filter,
                scope: 'sub',
                attributes: ['otherMailbox']
            };

            client.search(ldapConfig.basedn, opts, (err, searchRes) => {
                if (err) {
                    client.unbind();
                    return resolve({});
                }

                let notificationUri = '';

                searchRes.on('searchEntry', (entry) => {
                    if (entry.object && entry.object.otherMailbox) {
                        notificationUri = entry.object.otherMailbox;
                    } else if (entry.attributes) {
                        const attr = entry.attributes.find(a => a.type === 'otherMailbox');
                        if (attr && attr.values && attr.values.length > 0) {
                            notificationUri = attr.values[0];
                        }
                    }
                });

                searchRes.on('end', () => {
                    client.unbind();
                    resolve({ notificationUri });
                });

                searchRes.on('error', () => {
                    client.unbind();
                    resolve({});
                });
            });
        });
    });
};

const updateUserSettings = async (username, newSettings) => {
    // 2. LDAP
    if (!settings.server || !settings.server.ldap) {
        // Fallback to devstore
        devSettingsStore[username] = { ...devSettingsStore[username], ...newSettings };
        console.log(`[Auth] No LDAP configured. DevMode Settings updated for ${username}:`, devSettingsStore[username]);
        return;
    }
    const ldapConfig = settings.server.ldap;

    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: ldapConfig.url });
        client.on('error', (err) => {
            console.error('[Auth] LDAP Client Error (updateSettings):', err);
            reject(err);
        });

        client.bind(ldapConfig.binddn, ldapConfig.bindpw, (err) => {
            if (err) {
                console.error('[Auth] LDAP Bind Error (updateSettings):', err);
                client.unbind();
                return reject(err);
            }

            // Find DN first
            const filter = `(&${ldapConfig.userfilter}(sAMAccountName=${username}))`;
            const opts = {
                filter: filter,
                scope: 'sub',
                attributes: ['dn']
            };

            client.search(ldapConfig.basedn, opts, (err, searchRes) => {
                if (err) {
                    client.unbind();
                    return reject(err);
                }

                let userDn = null;

                searchRes.on('searchEntry', (entry) => {
                    if (entry.objectName) userDn = entry.objectName.toString();
                    else if (entry.object && entry.object.dn) userDn = entry.object.dn;
                });

                searchRes.on('end', (result) => {
                    if (!userDn) {
                        client.unbind();
                        return reject(new Error('User not found'));
                    }

                    // Prepare Modification
                    // We only support notificationUri -> otherMailbox for now
                    if (newSettings.notificationUri !== undefined) {
                        const change = new ldap.Change({
                            operation: 'replace',
                            modification: {
                                type: 'otherMailbox',
                                values: [newSettings.notificationUri]
                            }
                        });

                        client.modify(userDn, change, (err) => {
                            client.unbind();
                            if (err) {
                                console.error('[Auth] LDAP Modify Error:', err);
                                return reject(err);
                            }
                            console.log(`[Auth] LDAP Settings updated for ${username}`);
                            resolve();
                        });
                    } else {
                        client.unbind();
                        resolve();
                    }
                });
            });
        });
    });
};

module.exports = { login, verifyToken, getUsers, isDevMode, getUserSettings, updateUserSettings };
