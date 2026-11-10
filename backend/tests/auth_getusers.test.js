const { EventEmitter } = require('events');

const mockBind = jest.fn((dn, pw, cb) => cb(null));
const mockSearch = jest.fn();
const mockUnbind = jest.fn();
const mockUserFind = jest.fn();

jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        readFileSync: (file, encoding) => {
            if (typeof file === 'string' && file.endsWith('settings.json')) {
                return JSON.stringify({
                    devmode: false,
                    server: {
                        ldap: {
                            url: 'ldap://mock-ldap-host:389',
                            binddn: 'CN=binduser',
                            bindpw: 'password',
                            basedn: 'DC=domain,DC=local',
                            userfilter: '(&(objectclass=person))',
                            groupprefix: 'W_'
                        }
                    }
                });
            }
            return originalFs.readFileSync(file, encoding);
        },
        existsSync: (file) => {
            if (typeof file === 'string' && file.endsWith('settings.json')) {
                return true;
            }
            return originalFs.existsSync(file);
        }
    };
});

jest.mock('ldapjs', () => ({
    createClient: jest.fn(() => ({
        on: jest.fn(),
        bind: mockBind,
        search: mockSearch,
        unbind: mockUnbind
    }))
}));

jest.mock('../src/models/user', () => ({
    find: mockUserFind,
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn()
}));

function setupLdapEntries(entries) {
    mockSearch.mockImplementation((baseDn, opts, cb) => {
        const res = new EventEmitter();
        cb(null, res);
        process.nextTick(() => {
            entries.forEach(entry => res.emit('searchEntry', { object: entry }));
            res.emit('end', { status: 0 });
        });
    });
}

describe('auth.getUsers & auth.getGroups in LDAP mode (devmode: false)', () => {
    let auth;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockBind.mockImplementation((dn, pw, cb) => cb(null));
        mockUserFind.mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
        });
        auth = require('../src/auth');
    });

    it('queries LDAP and returns group-filtered users even when forceFetch is false', async () => {
        setupLdapEntries([
            {
                sAMAccountName: 'Netz1',
                givenName: 'Jens',
                sn: 'Schreiber',
                employeeID: 'j.schreiber',
                memberOf: ['CN=W_Netzwerkteam,OU=Groups,DC=domain,DC=local', 'CN=W_Lehrkräfte,OU=Groups,DC=domain,DC=local']
            },
            {
                sAMAccountName: 'Haus1',
                givenName: 'Max',
                sn: 'Grau',
                employeeID: 'm.grau',
                memberOf: ['CN=W_Hausmeister,OU=Groups,DC=domain,DC=local']
            },
            {
                // Entry without sAMAccountName (e.g. AD contact) must be ignored safely
                givenName: 'Kontakt',
                sn: 'OhneAccount'
            }
        ]);

        const assignees = await auth.getUsers(['Netzwerkteam', 'IT-Support'], false);
        expect(mockSearch).toHaveBeenCalledTimes(1);
        expect(assignees).toEqual([
            {
                username: 'netz1',
                displayName: 'Jens Schreiber',
                employeeId: 'j.schreiber',
                groups: ['Netzwerkteam', 'Lehrkräfte']
            }
        ]);

        // Subsequent calls for different groups or all users reuse the 5-minute LDAP cache
        const allUsers = await auth.getUsers([], false);
        expect(mockSearch).toHaveBeenCalledTimes(1);
        expect(allUsers.map(u => u.username)).toEqual(['netz1', 'haus1']);

        const groups = await auth.getGroups();
        expect(mockSearch).toHaveBeenCalledTimes(1);
        expect(groups).toEqual(['Hausmeister', 'Lehrkräfte', 'Netzwerkteam']);
    });

    it('bypasses cache when forceFetch is true and enriches missing employeeId from MongoDB', async () => {
        setupLdapEntries([
            {
                sAMAccountName: 'lehrer1',
                givenName: 'Max',
                sn: 'Mustermann',
                memberOf: ['CN=W_Lehrkräfte,OU=Groups,DC=domain,DC=local']
            }
        ]);
        mockUserFind.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { username: 'lehrer1', notificationUri: 'nctalk:m.mustermann' }
            ])
        });

        const first = await auth.getUsers(['Lehrkräfte'], false);
        expect(first[0].employeeId).toBe('m.mustermann');
        expect(mockSearch).toHaveBeenCalledTimes(1);

        const forced = await auth.getUsers([], true);
        expect(mockSearch).toHaveBeenCalledTimes(2);
        expect(forced).toHaveLength(1);
    });

    it('falls back to MongoDB when LDAP fails and forceFetch is false, and does not cache empty failure', async () => {
        mockBind.mockImplementation((dn, pw, cb) => cb(new Error('LDAP down')));
        mockUserFind.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { username: 'netz1', displayName: 'Jens Schreiber', groups: ['Netzwerkteam'], notificationUri: 'mailto:j.schreiber@valckenburgschule.de' }
            ])
        });

        const fallbackUsers = await auth.getUsers(['Netzwerkteam'], false);
        expect(fallbackUsers).toEqual([
            {
                username: 'netz1',
                displayName: 'Jens Schreiber',
                employeeId: 'j.schreiber',
                groups: ['Netzwerkteam']
            }
        ]);

        // Next call should retry LDAP rather than serving cached empty result
        mockBind.mockImplementation((dn, pw, cb) => cb(null));
        setupLdapEntries([
            {
                sAMAccountName: 'netz2',
                givenName: 'Anna',
                sn: 'Admin',
                employeeID: 'a.admin',
                memberOf: ['CN=W_Netzwerkteam,OU=Groups,DC=domain,DC=local']
            }
        ]);

        const recovered = await auth.getUsers(['Netzwerkteam'], false);
        expect(recovered.map(u => u.username)).toEqual(['netz2']);
    });

    it('returns empty array when LDAP fails and forceFetch is true (userPruningWorker safeguard)', async () => {
        mockBind.mockImplementation((dn, pw, cb) => cb(new Error('LDAP down')));
        mockUserFind.mockReturnValue({
            lean: jest.fn().mockResolvedValue([
                { username: 'netz1', displayName: 'Jens Schreiber', groups: ['Netzwerkteam'] }
            ])
        });

        const result = await auth.getUsers([], true);
        expect(result).toEqual([]);
    });

    it('deduplicates concurrent getUsers calls on cold cache and refreshes after CACHE_TTL expires', async () => {
        let searchCbRes;
        mockSearch.mockImplementation((baseDn, opts, cb) => {
            searchCbRes = new EventEmitter();
            cb(null, searchCbRes);
        });

        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        try {
            const p1 = auth.getUsers(['Netzwerkteam'], false);
            const p2 = auth.getUsers(['Hausmeister'], false);

            // Wait for bind/search setup
            await new Promise(resolve => process.nextTick(resolve));
            expect(mockSearch).toHaveBeenCalledTimes(1);

            searchCbRes.emit('searchEntry', {
                attributes: [
                    { type: 'sAMAccountName', values: ['Netz1'] },
                    { type: 'givenName', values: ['Jens'] },
                    { type: 'sn', values: ['Schreiber'] },
                    { type: 'employeeID', values: ['j.schreiber'] },
                    { type: 'memberOf', values: ['CN=W_Netzwerkteam,OU=Groups,DC=domain,DC=local'] }
                ]
            });
            searchCbRes.emit('searchEntry', {
                attributes: [
                    { type: 'sAMAccountName', values: ['Haus1'] },
                    { type: 'givenName', values: ['Max'] },
                    { type: 'sn', values: ['Grau'] },
                    { type: 'memberOf', values: ['CN=W_Hausmeister,OU=Groups,DC=domain,DC=local'] }
                ]
            });
            searchCbRes.emit('end', { status: 0 });

            const [r1, r2] = await Promise.all([p1, p2]);
            expect(r1.map(u => u.username)).toEqual(['netz1']);
            expect(r2.map(u => u.username)).toEqual(['haus1']);
            expect(r1[0].employeeId).toBe('j.schreiber');

            // Within 5-minute TTL -> served from cache
            nowSpy.mockReturnValue(1_000_000 + 4 * 60 * 1000);
            await auth.getUsers(['Netzwerkteam'], false);
            expect(mockSearch).toHaveBeenCalledTimes(1);

            // Past 5-minute TTL -> queries LDAP again
            nowSpy.mockReturnValue(1_000_000 + 6 * 60 * 1000);
            setupLdapEntries([
                {
                    sAMAccountName: 'netz1',
                    givenName: 'Jens',
                    sn: 'Schreiber',
                    memberOf: ['CN=W_Netzwerkteam,OU=Groups,DC=domain,DC=local']
                }
            ]);
            const refreshed = await auth.getUsers(['Netzwerkteam'], false);
            expect(mockSearch).toHaveBeenCalledTimes(2);
            expect(refreshed.map(u => u.username)).toEqual(['netz1']);
        } finally {
            nowSpy.mockRestore();
        }
    });
});
