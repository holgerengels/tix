const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const User = require('../src/models/user');
const Subscription = require('../src/models/subscription');
const PushSubscription = require('../src/models/pushSubscription');
const { login, getUserSettings, updateUserSettings, getUsers } = require('../src/auth');
const { runUserPruningCheck } = require('../src/userPruningWorker');

let tokens;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    tokens = getTokens();
});

beforeEach(async () => {
    await clearDatabase();
    await User.deleteMany({});
});

afterAll(async () => {
    await closeDatabase();
});

describe('User Persistence & Pruning', () => {

    describe('Auto-creation & Settings', () => {
        it('should automatically create User document in MongoDB upon successful mock login', async () => {
            const username = 'admin';
            const initialUser = await User.findOne({ username });
            expect(initialUser).toBeNull();

            // Run login (triggers mock check in devmode)
            const result = await login(username, 'password');
            expect(result).not.toBeNull();

            const savedUser = await User.findOne({ username });
            expect(savedUser).not.toBeNull();
            expect(savedUser.username).toBe(username);
            expect(savedUser.displayName).toBe('Holger Engels');
            expect(savedUser.groups).toContain('Administration');
        });

        it('should get and update user notification settings in MongoDB', async () => {
            const username = 'lehrer1';
            
            // Initial settings should be empty
            const initialSettings = await getUserSettings(username);
            expect(initialSettings.notificationUri).toBe('');

            // Update settings
            await updateUserSettings(username, { notificationUri: 'mailto:lehrer1@example.com' });

            const updatedSettings = await getUserSettings(username);
            expect(updatedSettings.notificationUri).toBe('mailto:lehrer1@example.com');

            // Verify in MongoDB
            const dbUser = await User.findOne({ username });
            expect(dbUser).not.toBeNull();
            expect(dbUser.notificationUri).toBe('mailto:lehrer1@example.com');
        });
    });

    describe('API Saved Filters Routes', () => {
        it('should fetch and update saved filters via API routes', async () => {
            const testFilters = {
                my: [{ name: 'Test Filter', type: ['Raumreservierung'] }]
            };

            // 1. Fetch initially empty filters
            let getRes = await request(app)
                .get('/api/settings/filters')
                .set('Authorization', `Bearer ${tokens.lehrer1}`);
            expect(getRes.status).toBe(200);
            expect(getRes.body).toEqual({});

            // 2. Post filters
            const postRes = await request(app)
                .post('/api/settings/filters')
                .set('Authorization', `Bearer ${tokens.lehrer1}`)
                .send(testFilters);
            expect(postRes.status).toBe(200);

            // 3. Fetch again and confirm saved
            getRes = await request(app)
                .get('/api/settings/filters')
                .set('Authorization', `Bearer ${tokens.lehrer1}`);
            expect(getRes.status).toBe(200);
            expect(getRes.body.my).toBeDefined();
            expect(getRes.body.my[0].name).toBe('Test Filter');
        });
    });

    describe('API Users Route', () => {
        it('should return only users in the requested groups', async () => {
            const getRes = await request(app)
                .get('/api/users?groups=Netzwerkteam')
                .set('Authorization', `Bearer ${tokens.admin}`);

            expect(getRes.status).toBe(200);
            const users = getRes.body;
            expect(users.every(u => u.groups.includes('Netzwerkteam'))).toBe(true);
            expect(users.some(u => u.username === 'netzwerker')).toBe(true);
            expect(users.some(u => u.username === 'hausmeister')).toBe(false);
        });
    });

    describe('LDAP Pruning background job', () => {
        let authModule;

        beforeEach(() => {
            authModule = require('../src/auth');
        });

        it('should update lastSeenInLdap for active users, prune expired users and delete their subscriptions', async () => {
            // Mock isDevMode to return false so pruner runs
            const originalIsDevMode = authModule.isDevMode;
            authModule.isDevMode = () => false;

            // Mock getUsers to return only 'admin' (meaning 'lehrer1' is missing in LDAP)
            const originalGetUsers = authModule.getUsers;
            authModule.getUsers = jest.fn().mockResolvedValue([
                { username: 'admin', displayName: 'Holger Engels', groups: ['Administration'] }
            ]);

            // Create users in MongoDB with an old lastSeenInLdap date
            const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago (past 30 days threshold)

            const activeUser = await User.create({
                username: 'admin',
                displayName: 'Holger Engels',
                lastSeenInLdap: oldDate
            });

            const deletedUser = await User.create({
                username: 'lehrer1',
                displayName: 'Max Mustermann',
                lastSeenInLdap: oldDate
            });

            // Create subscriptions for both users
            await Subscription.create({ userId: 'admin', name: 'S1', filter: {} });
            await Subscription.create({ userId: 'lehrer1', name: 'S2', filter: {} });
            await PushSubscription.create({ userId: 'lehrer1', subscription: {} });

            // Run pruner
            await runUserPruningCheck();

            // Verify active user is kept and lastSeenInLdap updated
            const checkActive = await User.findOne({ username: 'admin' });
            expect(checkActive).not.toBeNull();
            expect(checkActive.lastSeenInLdap.getTime()).toBeGreaterThan(oldDate.getTime());

            const activeSubs = await Subscription.find({ userId: 'admin' });
            expect(activeSubs.length).toBe(1);

            // Verify missing expired user is pruned, along with their subscriptions
            const checkPruned = await User.findOne({ username: 'lehrer1' });
            expect(checkPruned).toBeNull();

            const prunedSubs = await Subscription.find({ userId: 'lehrer1' });
            expect(prunedSubs.length).toBe(0);

            const prunedPush = await PushSubscription.find({ userId: 'lehrer1' });
            expect(prunedPush.length).toBe(0);

            // Restore mocks
            authModule.isDevMode = originalIsDevMode;
            authModule.getUsers = originalGetUsers;
        });

        it('should abort pruning and not delete anyone if LDAP returns empty list', async () => {
            const originalIsDevMode = authModule.isDevMode;
            authModule.isDevMode = () => false;

            const originalGetUsers = authModule.getUsers;
            authModule.getUsers = jest.fn().mockResolvedValue([]); // LDAP returns empty (safety trigger)

            const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
            await User.create({
                username: 'lehrer1',
                displayName: 'Max Mustermann',
                lastSeenInLdap: oldDate
            });

            // Run pruner
            await runUserPruningCheck();

            // Verify user is NOT pruned due to empty LDAP search safeguard
            const checkUser = await User.findOne({ username: 'lehrer1' });
            expect(checkUser).not.toBeNull();

            authModule.isDevMode = originalIsDevMode;
            authModule.getUsers = originalGetUsers;
        });
    });
});
