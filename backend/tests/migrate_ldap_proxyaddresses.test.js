const mongoose = require('mongoose');
const app = require('../src/server');
const { clearDatabase, closeDatabase } = require('./setup');
const User = require('../src/models/user');
const ldap = require('ldapjs');
const { run, extractNotificationUris } = require('../scripts/migrate_ldap_proxyaddresses');

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

describe('migrate_ldap_proxyaddresses.js unit tests', () => {
    describe('extractNotificationUris helper', () => {
        it('should extract valid notification URIs, map smtp to mailto, and de-duplicate', () => {
            const entry = {
                proxyAddresses: [
                    'SMTP:john.doe@example.com',
                    'mailto:john.doe@example.com',
                    'nctalk:john_doe',
                    'invalid:protocol',
                    'test:test-address'
                ]
            };
            const result = extractNotificationUris(entry);
            expect(result).toBe('mailto:john.doe@example.com, nctalk:john_doe, test:test-address');
        });

        it('should handle lowercase proxyaddresses attribute name', () => {
            const entry = {
                proxyaddresses: 'smtp:jane.doe@example.com'
            };
            const result = extractNotificationUris(entry);
            expect(result).toBe('mailto:jane.doe@example.com');
        });

        it('should handle undefined / empty attributes gracefully', () => {
            const entry = {};
            const result = extractNotificationUris(entry);
            expect(result).toBe('');
        });
    });

    describe('run migration', () => {
        it('should migrate users with no settings and skip users with existing settings', async () => {
            // Create user with no notificationUri
            await User.create({ username: 'user1', notificationUri: '' });
            // Create user with existing notificationUri
            await User.create({ username: 'user2', notificationUri: 'mailto:existing@example.com' });
            // Create user with undefined/null notificationUri
            await User.create({ username: 'user3' });

            // Setup LDAP mock responses
            mockSearch.mockImplementation((basedn, opts, cb) => {
                const searchRes = {
                    on: jest.fn((event, handler) => {
                        if (event === 'searchEntry') {
                            if (opts.filter.includes('user1')) {
                                handler({
                                    object: {
                                        sAMAccountName: 'user1',
                                        proxyAddresses: ['smtp:user1@example.com', 'nctalk:user1_talk']
                                    }
                                });
                            } else if (opts.filter.includes('user3')) {
                                handler({
                                    object: {
                                        sAMAccountName: 'user3',
                                        proxyAddresses: 'mailto:user3@example.com'
                                    }
                                });
                            }
                        } else if (event === 'end') {
                            handler({ status: 0 });
                        }
                    })
                };
                cb(null, searchRes);
            });

            // Mock process.exit to prevent test runner from exiting
            const originalExit = process.exit;
            process.exit = jest.fn();

            // Mock console.log/error to keep test output clean
            const originalLog = console.log;
            const originalError = console.error;
            console.log = jest.fn();
            console.error = jest.fn();

            // Enable commit mode for this test
            process.argv.push('--commit');

            try {
                await run();

                // Verify DB updates
                const u1 = await User.findOne({ username: 'user1' });
                expect(u1.notificationUri).toBe('mailto:user1@example.com, nctalk:user1_talk');

                const u2 = await User.findOne({ username: 'user2' });
                expect(u2.notificationUri).toBe('mailto:existing@example.com'); // should not be changed

                const u3 = await User.findOne({ username: 'user3' });
                expect(u3.notificationUri).toBe('mailto:user3@example.com');
            } finally {
                // Remove --commit from argv
                const idx = process.argv.indexOf('--commit');
                if (idx > -1) process.argv.splice(idx, 1);
                process.exit = originalExit;
                console.log = originalLog;
                console.error = originalError;
            }
        });
    });
});
