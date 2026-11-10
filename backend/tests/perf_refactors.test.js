const express = require('express');
const request = require('supertest');

function createChainableQuery(result) {
    const query = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(result),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };
    return query;
}

describe('settings.js central loader', () => {
    afterEach(() => {
        jest.resetModules();
        jest.dontMock('fs');
    });

    it('loads valid settings.json at module initialization and via loadSettings()', () => {
        jest.resetModules();
        const mockConfig = { devmode: true, server: { url: 'https://tickets.example.org' } };
        jest.doMock('fs', () => {
            const actualFs = jest.requireActual('fs');
            return {
                ...actualFs,
                existsSync: jest.fn((p) => String(p).endsWith('settings.json') ? true : actualFs.existsSync(p)),
                readFileSync: jest.fn((p, enc) => String(p).endsWith('settings.json')
                    ? JSON.stringify(mockConfig)
                    : actualFs.readFileSync(p, enc))
            };
        });

        const { settings, loadSettings } = require('../src/settings');
        expect(settings).toEqual(mockConfig);
        expect(loadSettings()).toEqual(mockConfig);
    });

    it('falls back to empty object when settings.json is missing or invalid JSON', () => {
        jest.resetModules();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.doMock('fs', () => {
            const actualFs = jest.requireActual('fs');
            return {
                ...actualFs,
                existsSync: jest.fn((p) => String(p).endsWith('settings.json') ? false : actualFs.existsSync(p)),
                readFileSync: jest.fn((p, enc) => actualFs.readFileSync(p, enc))
            };
        });

        const missingMod = require('../src/settings');
        expect(missingMod.settings).toEqual({});
        expect(missingMod.loadSettings()).toEqual({});

        jest.resetModules();
        jest.doMock('fs', () => {
            const actualFs = jest.requireActual('fs');
            return {
                ...actualFs,
                existsSync: jest.fn((p) => String(p).endsWith('settings.json') ? true : actualFs.existsSync(p)),
                readFileSync: jest.fn((p, enc) => String(p).endsWith('settings.json')
                    ? '{ invalid json'
                    : actualFs.readFileSync(p, enc))
            };
        });

        const invalidMod = require('../src/settings');
        expect(invalidMod.settings).toEqual({});
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

describe('workflow.js script compilation cache', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('caches compiled workflow JS exports per file and clears cache on loadWorkflows()', () => {
        jest.resetModules();
        const fs = require('fs');
        const readSpy = jest.spyOn(fs, 'readFileSync');
        const workflow = require('../src/workflow');

        readSpy.mockClear();

        const wf = {
            file: 'datenpflege.json',
            template: 'Eintrag {{ ticket.title }}'
        };

        const exports1 = workflow.getWorkflowScriptExports(wf);
        const exports2 = workflow.getWorkflowScriptExports(wf);

        expect(exports1).toBe(exports2);
        expect(typeof exports1.convert).toBe('function');

        const jsReadsBeforeReload = readSpy.mock.calls.filter(([filePath]) =>
            String(filePath).endsWith('datenpflege.js')
        ).length;
        expect(jsReadsBeforeReload).toBe(1);

        const ticket = { title: 'Test', description: 'Alt' };
        exports1.convert(ticket);
        expect(ticket.type).toBe('Vertretungsplan-Ticket');
        expect(ticket.description).toContain('Aus Stundenplan-Ticket: Eintrag Test');

        workflow.loadWorkflows();
        const exports3 = workflow.getWorkflowScriptExports(wf);
        expect(exports3).not.toBe(exports1);

        const jsReadsAfterReload = readSpy.mock.calls.filter(([filePath]) =>
            String(filePath).endsWith('datenpflege.js')
        ).length;
        expect(jsReadsAfterReload).toBe(2);
    });

    it('returns empty object when workflow has no matching script file', () => {
        jest.resetModules();
        const workflow = require('../src/workflow');
        expect(workflow.getWorkflowScriptExports(null)).toEqual({});
        expect(workflow.getWorkflowScriptExports({ file: 'does-not-exist-xyz.json' })).toEqual({});
    });
});

describe('publisher.js batched starredBy user lookup', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    it('batches starredBy user lookups with a single User.find({ username: { $in } }) instead of findOne loop', async () => {
        jest.resetModules();

        const saveMock = jest.fn().mockResolvedValue(true);
        const oldTimestamp = new Date(Date.now() - 5 * 60 * 1000);
        const mockLog = {
            _id: 'log1',
            ticket: {
                _id: 't1',
                id: 'ITT-1',
                type: 'IT-Ticket',
                title: 'Batch Check',
                creator: 'creator1',
                state: 'offen.neu',
                starredBy: ['star_alice', 'star_bob', 'star_charlie'],
                links: []
            },
            targetUser: 'creator1',
            editor: 'admin',
            action: 'state_changed',
            details: { newState: 'in_arbeit' },
            published: null,
            timestamp: oldTimestamp,
            save: saveMock
        };

        const mockLogModel = {
            find: jest.fn(() => createChainableQuery([mockLog])),
            updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 })
        };
        const mockUserModel = {
            find: jest.fn(() => createChainableQuery([
                { username: 'star_alice', groups: ['Administration'] },
                { username: 'star_bob', groups: [] },
                { username: 'star_charlie', groups: ['Netzwerkteam'] }
            ])),
            findOne: jest.fn()
        };
        const mockPushSubscription = {
            find: jest.fn(() => createChainableQuery([]))
        };
        const mockTicketModel = {
            findOne: jest.fn(() => createChainableQuery(null)),
            find: jest.fn(() => createChainableQuery([]))
        };

        jest.doMock('../src/models/log', () => mockLogModel);
        jest.doMock('../src/models/user', () => mockUserModel);
        jest.doMock('../src/models/ticket', () => mockTicketModel);
        jest.doMock('../src/models/pushSubscription', () => mockPushSubscription);
        jest.doMock('../src/auth', () => ({
            getUserSettings: jest.fn(async (username) => ({
                notificationUri: `test:${username}@example.com`
            }))
        }));
        jest.doMock('../src/settings', () => ({
            settings: {
                server: { url: 'https://tickets.example.org' },
                publisher: { delay: 1, nextcloud: {} }
            }
        }));
        jest.doMock('../src/utils/push', () => ({
            webpush: { sendNotification: jest.fn() }
        }));

        const publisher = require('../src/publisher');
        publisher.clearTestNotifications();
        await publisher.checkUnpublishedLogs();

        expect(mockUserModel.findOne).not.toHaveBeenCalled();
        expect(mockUserModel.find).toHaveBeenCalledTimes(1);
        expect(mockUserModel.find).toHaveBeenCalledWith({
            username: { $in: expect.arrayContaining(['star_alice', 'star_bob', 'star_charlie']) }
        });

        const notifs = publisher.getTestNotifications();
        const notifiedTargets = notifs.map((n) => n.targetUser);
        expect(notifiedTargets).toEqual(
            expect.arrayContaining(['creator1', 'star_alice', 'star_charlie'])
        );
        expect(notifiedTargets).not.toContain('star_bob');
        expect(mockLogModel.updateMany).toHaveBeenCalledTimes(1);
    });
});

describe('routes.js deduplicated getUsers() and workflow-backed availability', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        jest.resetModules();
        jest.clearAllMocks();
    });

    function buildTestApp({ mockAuth, mockTicketModel, mockWorkflow, mockCaldav }) {
        jest.doMock('../src/auth', () => mockAuth);
        jest.doMock('../src/models/ticket', () => mockTicketModel);
        jest.doMock('../src/models/log', () => ({
            find: jest.fn(() => createChainableQuery([])),
            create: jest.fn()
        }));
        jest.doMock('../src/models/user', () => ({
            find: jest.fn(() => createChainableQuery([])),
            findOne: jest.fn()
        }));
        jest.doMock('../src/models/subscription', () => ({
            find: jest.fn(() => createChainableQuery([])),
            findOne: jest.fn()
        }));
        jest.doMock('../src/models/pushSubscription', () => ({
            find: jest.fn(() => createChainableQuery([]))
        }));
        jest.doMock('../src/workflow', () => mockWorkflow);
        jest.doMock('../src/caldav', () => mockCaldav);
        jest.doMock('../src/bots', () => ({
            getBots: jest.fn(() => ({})),
            loadBots: jest.fn()
        }));
        jest.doMock('../src/ki', () => ({
            processText: jest.fn()
        }));
        jest.doMock('../src/publisher', () => ({
            notifyMentionedUser: jest.fn(),
            notifyUser: jest.fn(),
            checkUnpublishedLogs: jest.fn()
        }));

        const routes = require('../src/routes');
        const app = express();
        app.use(express.json());
        app.use('/api', routes);
        return app;
    }

    it('calls auth.getUsers() only once per GET /api/tickets request with creator, assignee and search', async () => {
        jest.resetModules();

        const getUsersMock = jest.fn().mockResolvedValue([
            { username: 'alice', displayName: 'Alice Teacher' },
            { username: 'bob', displayName: 'Bob Admin' },
            { username: 'charlie', displayName: 'Charlie Staff' }
        ]);
        const mockAuth = {
            verifyToken: (req, res, next) => {
                req.user = { username: 'admin', groups: ['Administration'] };
                next();
            },
            getUsers: getUsersMock,
            getGroups: jest.fn().mockResolvedValue(['Administration']),
            getUser: jest.fn(),
            getUserSettings: jest.fn().mockResolvedValue({}),
            saveUserSettings: jest.fn()
        };
        const mockTicketModel = {
            find: jest.fn(() => createChainableQuery([]))
        };
        const mockWorkflow = {
            getWorkflows: jest.fn(() => ({})),
            getWorkflowForType: jest.fn(),
            getVisibleTicketTypes: jest.fn(() => ['IT-Ticket']),
            loadWorkflows: jest.fn()
        };
        const mockCaldav = {
            getAllAvailability: jest.fn().mockResolvedValue({})
        };

        const app = buildTestApp({ mockAuth, mockTicketModel, mockWorkflow, mockCaldav });

        const res = await request(app)
            .get('/api/tickets?creator=Alice&assignee=Bob&search=Charlie');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
        expect(getUsersMock).toHaveBeenCalledTimes(1);
        expect(mockTicketModel.find).toHaveBeenCalledTimes(1);
    });

    it('uses workflowEngine.getWorkflowForType("Raumreservierung") instead of fs.readFileSync in GET /api/caldav/availability', async () => {
        jest.resetModules();
        const fs = require('fs');
        const readSpy = jest.spyOn(fs, 'readFileSync');

        const mockAuth = {
            verifyToken: (req, res, next) => {
                req.user = { username: 'lehrer1', groups: ['Lehrkräfte'] };
                next();
            },
            getUsers: jest.fn().mockResolvedValue([]),
            getGroups: jest.fn().mockResolvedValue([]),
            getUser: jest.fn(),
            getUserSettings: jest.fn().mockResolvedValue({}),
            saveUserSettings: jest.fn()
        };
        const mockTicketModel = {
            find: jest.fn(() => createChainableQuery([]))
        };
        const mockWorkflow = {
            getWorkflows: jest.fn(() => ({})),
            getWorkflowForType: jest.fn((type) => type === 'Raumreservierung' ? {
                type: 'Raumreservierung',
                fields: [
                    { name: 'date', type: 'Date' },
                    { name: 'termin', type: 'Termin', rooms: ['Raum 101', 'Raum 202'] }
                ]
            } : undefined),
            getVisibleTicketTypes: jest.fn(() => ['Raumreservierung']),
            loadWorkflows: jest.fn()
        };
        const mockCaldav = {
            getAllAvailability: jest.fn().mockResolvedValue({
                'Raum 101': [],
                'Raum 202': []
            })
        };

        const app = buildTestApp({ mockAuth, mockTicketModel, mockWorkflow, mockCaldav });
        readSpy.mockClear();

        const res = await request(app)
            .get('/api/caldav/availability?date=2026-11-10');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ 'Raum 101': [], 'Raum 202': [] });
        expect(mockWorkflow.getWorkflowForType).toHaveBeenCalledWith('Raumreservierung');
        expect(mockCaldav.getAllAvailability).toHaveBeenCalledWith('2026-11-10', ['Raum 101', 'Raum 202']);

        const readRaumJson = readSpy.mock.calls.some(([p]) => String(p).endsWith('raumreservierung.json'));
        expect(readRaumJson).toBe(false);
    });
});

describe('validation.js evaluator cache and TTL user cache', () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.resetModules();
    });

    it('caches compiled Function and AsyncFunction evaluators without leaking ticketData, user or action', async () => {
        jest.resetModules();
        const validation = require('../src/validation');
        validation.clearValidationCaches();

        expect(validation.getEvaluatorCacheSize()).toBe(0);

        // Sync template expressions with identical ticket keys reuse the compiled function
        expect(validation.evaluateTemplate('{{ ticket.a + "-" + action + "-" + context.user }}', { a: '1' })).toBe('1-null-null');
        expect(validation.getEvaluatorCacheSize()).toBe(1);

        expect(validation.evaluateTemplate('{{ ticket.a + "-" + action + "-" + context.user }}', { a: '2' }, { username: 'alice' })).toBe('2-null-alice');
        expect(validation.getEvaluatorCacheSize()).toBe(1);

        // Passing a fresh ticket shape with extra key creates a distinct cache entry
        expect(validation.evaluateTemplate('{{ ticket.a + "-" + ticket.b }}', { a: 'x', b: 'y' })).toBe('x-y');
        expect(validation.getEvaluatorCacheSize()).toBe(2);

        // Validation with sync + action parameter
        const wf = {
            fields: [{ name: 'age', validation: { expression: 'ticket.age >= 18 || action === "draft"', message: 'Zu jung' } }]
        };
        expect(validation.validateTicket({ age: 15 }, wf, null, null, 'create').isValid).toBe(false);
        expect(validation.getEvaluatorCacheSize()).toBe(3);

        expect(validation.validateTicket({ age: 15 }, wf, null, null, 'draft').isValid).toBe(true);
        expect(validation.validateTicket({ age: 21 }, wf, null, null, 'create').isValid).toBe(true);
        expect(validation.getEvaluatorCacheSize()).toBe(3);

        // Async evaluator path is cached separately by async flag
        const asyncEval1 = validation.createSafeEvaluator('Promise.resolve(ticket.ok)', { ok: true }, null, null, true);
        const asyncEval2 = validation.createSafeEvaluator('Promise.resolve(ticket.ok)', { ok: false }, null, null, true);
        expect(validation.getEvaluatorCacheSize()).toBe(4);
        expect(await asyncEval1()).toBe(true);
        expect(await asyncEval2()).toBe(false);

        // Invalid syntax must not be cached and must still fail cleanly
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(validation.evaluateTemplate('{{ invalid && syntax!! }}', { a: '1' })).toBe('{{ invalid && syntax!! }}');
        expect(validation.getEvaluatorCacheSize()).toBe(4);
        warnSpy.mockRestore();
    });

    it('does not query User when mongoose is disconnected, preloads on connected, and expires/prunes entries after TTL', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-11-10T10:00:00Z'));
        jest.resetModules();

        const { EventEmitter } = require('events');
        const mockConnection = new EventEmitter();
        mockConnection.readyState = 0;

        let dbUsers = [
            { username: 'lehrer1', displayName: 'Max Mustermann' },
            { username: 'olduser', displayName: 'Alt Benutzer' }
        ];
        const findMock = jest.fn(() => createChainableQuery(dbUsers));
        const findOneMock = jest.fn(({ username }) => createChainableQuery(
            dbUsers.find((u) => u.username === username) || null
        ));

        jest.doMock('mongoose', () => ({ connection: mockConnection }));
        jest.doMock('../src/models/user', () => ({
            find: findMock,
            findOne: findOneMock
        }));

        const validation = require('../src/validation');

        // Disconnected at import -> no DB queries queued
        expect(findMock).not.toHaveBeenCalled();
        expect(findOneMock).not.toHaveBeenCalled();
        expect(validation.getBackendDisplayName('lehrer1')).toBe('lehrer1');
        expect(findOneMock).not.toHaveBeenCalled();

        // Simulate DB connection established -> preloads all users automatically
        const flushMicrotasks = async () => {
            for (let i = 0; i < 6; i += 1) {
                await Promise.resolve();
            }
        };

        mockConnection.readyState = 1;
        mockConnection.emit('connected');
        await flushMicrotasks();

        expect(findMock).toHaveBeenCalledTimes(1);
        expect(validation.getBackendDisplayName('lehrer1')).toBe('Max Mustermann');
        expect(validation.getUserCacheSize()).toBe(2);

        // Newly added user (not present at preload) is fetched once on demand
        dbUsers.push({ username: 'newuser', displayName: 'Neu Name' });
        expect(validation.getBackendDisplayName('newuser')).toBe('newuser');
        await flushMicrotasks();
        expect(findOneMock).toHaveBeenCalledTimes(1);
        expect(validation.getBackendDisplayName('newuser')).toBe('Neu Name');

        // Advance time beyond USER_CACHE_TTL (5 minutes) and update DB snapshot (olduser removed, lehrer1 renamed)
        dbUsers = [
            { username: 'lehrer1', displayName: 'Maxine Mustermann' }
        ];
        jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

        // Stale-while-revalidate returns previous displayName immediately without flashing raw username
        expect(validation.getBackendDisplayName('lehrer1')).toBe('Max Mustermann');
        await flushMicrotasks();

        // After refresh: lehrer1 is updated and expired olduser/newuser were pruned
        expect(validation.getBackendDisplayName('lehrer1')).toBe('Maxine Mustermann');
        expect(validation.getUserCacheSize()).toBe(1);
    });
});
