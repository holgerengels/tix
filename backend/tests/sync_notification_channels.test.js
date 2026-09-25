const app = require('../src/server');
const mongoose = require('mongoose');
const { clearDatabase, closeDatabase } = require('./setup');
const User = require('../src/models/user');
const { run, extractEmployeeId, escapeLDAP } = require('../scripts/sync_notification_channels');

// Mock settings load inside the migration script
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs,
        readFileSync: (file, encoding) => {
            if (file.endsWith('settings.json')) {
                return JSON.stringify({
                    server: {
                        ldap: {
                            url: 'ldap://mock-ldap-host:389',
                            binddn: 'CN=binduser',
                            bindpw: 'password',
                            basedn: 'DC=domain,DC=local',
                            userfilter: '(&(objectclass=person))'
                        }
                    }
                });
            }
            return originalFs.readFileSync(file, encoding);
        },
        existsSync: (file) => {
            if (file.endsWith('settings.json')) {
                return true;
            }
            return originalFs.existsSync(file);
        }
    };
});

const mockBind = jest.fn((dn, pw, cb) => cb(null));
const mockSearch = jest.fn();
const mockUnbind = jest.fn();

jest.mock('ldapjs', () => {
    return {
        createClient: jest.fn(() => ({
            on: jest.fn(),
            bind: mockBind,
            search: mockSearch,
            unbind: mockUnbind
        }))
    };
});

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
});

beforeEach(async () => {
    await clearDatabase();
    await User.deleteMany({});
    jest.clearAllMocks();
});

afterAll(async () => {
    await closeDatabase();
});

describe('migrate_missing_notification_uri.js unit tests', () => {
    describe('helper functions', () => {
        it('extractEmployeeId should extract employeeID correctly', () => {
            expect(extractEmployeeId({ employeeID: 'h.engels' })).toBe('h.engels');
            expect(extractEmployeeId({ employeeID: ['m.mustermann'] })).toBe('m.mustermann');
            expect(extractEmployeeId({ employeeid: 's.keller' })).toBe('s.keller');
            expect(extractEmployeeId({})).toBe('');
            expect(extractEmployeeId(null)).toBe('');
        });

        it('escapeLDAP should escape special characters', () => {
            expect(escapeLDAP('test*user(1)')).toBe('test\\2auser\\281\\29');
            expect(escapeLDAP('normal')).toBe('normal');
            expect(escapeLDAP('')).toBe('');
        });
    });

    describe('run script with user rules', () => {
        function setupMockSearch(ldapEntries) {
            mockSearch.mockImplementation((basedn, opts, cb) => {
                const searchRes = {
                    on: jest.fn((event, handler) => {
                        if (event === 'searchEntry') {
                            ldapEntries.forEach(entry => {
                                handler({
                                    object: entry,
                                    attributes: Object.keys(entry).map(k => ({ type: k, values: Array.isArray(entry[k]) ? entry[k] : [entry[k]] }))
                                });
                            });
                        } else if (event === 'end') {
                            handler({ status: 0 });
                        }
                    })
                };
                cb(null, searchRes);
            });
        }

        it('dry-run mode should not modify DB', async () => {
            await User.create({ username: 'user1', notificationUri: '' });
            await User.create({ username: 'user2', notificationUri: 'raw@example.com' });

            setupMockSearch([
                { sAMAccountName: 'user1', employeeID: 'u.one' },
                { sAMAccountName: 'user2', employeeID: 'u.two' }
            ]);

            const originalExit = process.exit;
            process.exit = jest.fn();
            const originalLog = console.log;
            const originalError = console.error;
            console.log = jest.fn();
            console.error = jest.fn();

            try {
                await run();

                const u1 = await User.findOne({ username: 'user1' });
                expect(u1.notificationUri).toBe('');

                const u2 = await User.findOne({ username: 'user2' });
                expect(u2.notificationUri).toBe('raw@example.com');
            } finally {
                process.exit = originalExit;
                console.log = originalLog;
                console.error = originalError;
            }
        });

        it('commit mode: keeps mailto, fixes raw email, fills empty with nctalk', async () => {
            // 1. mailto: must remain untouched
            await User.create({ username: 'user_mailto', notificationUri: 'mailto:stay@example.com' });

            // 2. raw email without prefix must be fixed
            await User.create({ username: 'user_raw', notificationUri: 'FixMe@Example.com' });

            // 3. existing nctalk must remain
            await User.create({ username: 'user_nctalk', notificationUri: 'nctalk:existing' });

            // 4. empty notificationUri must be filled with nctalk:<employeeID>
            await User.create({ username: 'user_empty', notificationUri: '' });

            // 5. empty notificationUri with no employeeID in LDAP must be skipped
            await User.create({ username: 'user_no_empid', notificationUri: '' });

            setupMockSearch([
                { sAMAccountName: 'user_mailto', employeeID: 'u.mail' },
                { sAMAccountName: 'user_raw', employeeID: 'u.raw' },
                { sAMAccountName: 'user_nctalk', employeeID: 'existing' },
                { sAMAccountName: 'user_empty', employeeID: 'u.empty' },
                { sAMAccountName: 'user_no_empid' } // no employeeID
            ]);

            const originalExit = process.exit;
            process.exit = jest.fn();
            const originalLog = console.log;
            const originalError = console.error;
            console.log = jest.fn();
            console.error = jest.fn();

            process.argv.push('--commit');

            try {
                await run();

                // 1. mailto remains
                const uMail = await User.findOne({ username: 'user_mailto' });
                expect(uMail.notificationUri).toBe('mailto:stay@example.com');

                // 2. raw email fixed
                const uRaw = await User.findOne({ username: 'user_raw' });
                expect(uRaw.notificationUri).toBe('mailto:fixme@example.com');

                // 3. nctalk remains
                const uNctalk = await User.findOne({ username: 'user_nctalk' });
                expect(uNctalk.notificationUri).toBe('nctalk:existing');

                // 4. empty filled with nctalk:<employeeID>
                const uEmpty = await User.findOne({ username: 'user_empty' });
                expect(uEmpty.notificationUri).toBe('nctalk:u.empty');
                expect(uEmpty.employeeId).toBe('u.empty');

                // 5. empty without employeeID remains empty
                const uNoEmp = await User.findOne({ username: 'user_no_empid' });
                expect(uNoEmp.notificationUri).toBe('');
            } finally {
                const idx = process.argv.indexOf('--commit');
                if (idx > -1) process.argv.splice(idx, 1);
                process.exit = originalExit;
                console.log = originalLog;
                console.error = originalError;
            }
        });
    });
});
