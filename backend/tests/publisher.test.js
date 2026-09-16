const { checkUnpublishedLogs, sendMail, nextcloud, getTestNotifications, clearTestNotifications } = require('../src/publisher');
const Log = require('../src/models/log');
const Ticket = require('../src/models/ticket');
const PushSubscription = require('../src/models/pushSubscription');
const mongoose = require('mongoose');
const app = require('../src/server');
const { clearDatabase, closeDatabase } = require('./setup');
const axios = require('axios');
const auth = require('../src/auth');

jest.mock('axios');
jest.mock('../src/auth', () => ({
    ...jest.requireActual('../src/auth'),
    getUserSettings: jest.fn()
}));
jest.mock('../src/utils/push', () => ({
    webpush: {
        sendNotification: jest.fn()
    }
}));

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
});

beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
    clearTestNotifications();
});

afterAll(async () => {
    await closeDatabase();
});

describe('Publisher Service', () => {

    describe('checkUnpublishedLogs', () => {
        it('should publish old unpublished logs and call correct notification handlers', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Test Ticket',
                creator: 'lehrer1'
            });

            // Create a log older than DELAY (1 min)
            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            
            const log = await Log.create({
                ticket: ticket._id,
                targetUser: 'lehrer1',
                editor: 'admin',
                action: 'state_changed',
                published: null,
                timestamp: oldDate
            });

            auth.getUserSettings.mockResolvedValue({ notificationUri: 'test:lehrer1@example.com' });

            await checkUnpublishedLogs();

            const updatedLog = await Log.findById(log._id);
            expect(updatedLog.published).toBeTruthy();

            const testNotifs = getTestNotifications();
            expect(testNotifs.length).toBe(1);
            expect(testNotifs[0].targetUser).toBe('lehrer1');
        });

        it('should skip notifications for own edits', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Test Ticket',
                creator: 'lehrer1'
            });

            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            
            await Log.create({
                ticket: ticket._id,
                targetUser: 'lehrer1',
                editor: 'lehrer1', // Same as creator
                action: 'state_changed',
                published: null,
                timestamp: oldDate
            });

            await checkUnpublishedLogs();

            const testNotifs = getTestNotifications();
            expect(testNotifs.length).toBe(0); // Should be skipped
        });

        it('should notify both creator and assignee when a third party edits the ticket', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Assigned Ticket',
                creator: 'lehrer1',
                assignee: 'netzwerker'
            });

            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            await Log.create({
                ticket: ticket._id,
                editor: 'admin', // Third party
                action: 'state_changed',
                published: null,
                timestamp: oldDate
            });

            auth.getUserSettings.mockImplementation(async (user) => ({
                notificationUri: `test:${user}@example.com`
            }));

            await checkUnpublishedLogs();

            const testNotifs = getTestNotifications();
            expect(testNotifs.length).toBe(2);
            expect(testNotifs.some(n => n.targetUser === 'lehrer1')).toBe(true);
            expect(testNotifs.some(n => n.targetUser === 'netzwerker')).toBe(true);
        });

        it('should notify only the assignee when creator edits the ticket', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Assigned Ticket 2',
                creator: 'lehrer1',
                assignee: 'netzwerker'
            });

            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            await Log.create({
                ticket: ticket._id,
                editor: 'lehrer1', // Creator edited
                action: 'Kommentar hinzugefügt',
                published: null,
                timestamp: oldDate
            });

            auth.getUserSettings.mockImplementation(async (user) => ({
                notificationUri: `test:${user}@example.com`
            }));

            await checkUnpublishedLogs();

            const testNotifs = getTestNotifications();
            expect(testNotifs.length).toBe(1);
            expect(testNotifs[0].targetUser).toBe('netzwerker');
        });

        it('should notify only the creator when assignee edits the ticket', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Assigned Ticket 3',
                creator: 'lehrer1',
                assignee: 'netzwerker'
            });

            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            await Log.create({
                ticket: ticket._id,
                editor: 'netzwerker', // Assignee edited
                action: 'state_changed',
                published: null,
                timestamp: oldDate
            });

            auth.getUserSettings.mockImplementation(async (user) => ({
                notificationUri: `test:${user}@example.com`
            }));

            await checkUnpublishedLogs();

            const testNotifs = getTestNotifications();
            expect(testNotifs.length).toBe(1);
            expect(testNotifs[0].targetUser).toBe('lehrer1');
        });
        
        it('should notify users who starred the ticket', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Starred Ticket',
                creator: 'lehrer1',
                assignee: 'netzwerker',
                starredBy: ['fanUser1', 'fanUser2', 'lehrer1']
            });

            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            await Log.create({
                ticket: ticket._id,
                editor: 'admin',
                action: 'Kommentar hinzugefügt',
                published: null,
                timestamp: oldDate
            });

            auth.getUserSettings.mockImplementation(async (user) => ({
                notificationUri: `test:${user}@example.com`
            }));

            await checkUnpublishedLogs();

            const testNotifs = getTestNotifications();
            const recipientUsers = testNotifs.map(n => n.targetUser).sort();
            expect(recipientUsers).toEqual(['fanUser1', 'fanUser2', 'lehrer1', 'netzwerker'].sort());
        });

        it('should send web push notifications', async () => {
            const ticket = await Ticket.create({
                type: 'IT-Ticket',
                title: 'Push Ticket',
                creator: 'lehrer1'
            });

            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            
            await Log.create({
                ticket: ticket._id,
                targetUser: 'lehrer1',
                editor: 'admin',
                action: 'state_changed',
                published: null,
                timestamp: oldDate
            });

            await PushSubscription.create({
                userId: 'lehrer1',
                subscription: { endpoint: 'https://test.push', keys: {} }
            });

            auth.getUserSettings.mockResolvedValue({}); // No notificationUri, but has web push
            
            await checkUnpublishedLogs();

            const { webpush } = require('../src/utils/push');
            expect(webpush.sendNotification).toHaveBeenCalled();
        });

        it('should bundle multiple edits on the same ticket into a single notification', async () => {
            const ticket = await Ticket.create({
                id: 'IT-99',
                type: 'IT-Ticket',
                title: 'Bundling Test Ticket',
                creator: 'lehrer1'
            });

            const oldDate1 = new Date(Date.now() - 3 * 60 * 1000);
            const oldDate2 = new Date(Date.now() - 2 * 60 * 1000);

            await Log.create({
                ticket: ticket._id,
                editor: 'admin',
                action: 'Status auf in Bearbeitung gesetzt',
                published: null,
                timestamp: oldDate1
            });

            await Log.create({
                ticket: ticket._id,
                editor: 'admin',
                action: 'Kommentar hinzugefügt',
                published: null,
                timestamp: oldDate2
            });

            auth.getUserSettings.mockResolvedValue({ notificationUri: 'test:lehrer1@example.com' });

            await checkUnpublishedLogs();

            const testNotifs = getTestNotifications();
            // Exactly 1 bundled notification should be received
            expect(testNotifs.length).toBe(1);
            expect(testNotifs[0].targetUser).toBe('lehrer1');
            expect(testNotifs[0].message).toContain('2 Änderungen von admin');
            expect(testNotifs[0].message).toContain('Status auf in Bearbeitung gesetzt');
            expect(testNotifs[0].message).toContain('Kommentar hinzugefügt');

            // All logs should now be published
            const remaining = await Log.find({ ticket: ticket._id, published: null });
            expect(remaining.length).toBe(0);
        });

        it('should debounce publication if a recent edit occurred within the delay window', async () => {
            const ticket = await Ticket.create({
                id: 'IT-100',
                type: 'IT-Ticket',
                title: 'Debounce Test Ticket',
                creator: 'lehrer1'
            });

            // Log 1 is 2 minutes old
            const oldDate = new Date(Date.now() - 2 * 60 * 1000);
            await Log.create({
                ticket: ticket._id,
                editor: 'admin',
                action: 'Änderung 1',
                published: null,
                timestamp: oldDate
            });

            // Log 2 is brand new (5 seconds ago), within the 1-min DELAY window
            const recentDate = new Date(Date.now() - 5 * 1000);
            await Log.create({
                ticket: ticket._id,
                editor: 'admin',
                action: 'Änderung 2',
                published: null,
                timestamp: recentDate
            });

            auth.getUserSettings.mockResolvedValue({ notificationUri: 'test:lehrer1@example.com' });

            // First run: should debounce because recentDate is < DELAY
            const nextRun = await checkUnpublishedLogs();
            expect(getTestNotifications().length).toBe(0);
            expect(nextRun).toBeGreaterThan(0);
            expect(nextRun).toBeLessThanOrEqual(60 * 1000);

            // Both logs should still be unpublished
            const stillUnpublished = await Log.find({ ticket: ticket._id, published: null });
            expect(stillUnpublished.length).toBe(2);

            // Advance time / simulate both logs being older than DELAY
            await Log.updateMany({ ticket: ticket._id }, { timestamp: new Date(Date.now() - 3 * 60 * 1000) });

            // Second run: now both should be published bundled
            await checkUnpublishedLogs();
            const notifsAfterWait = getTestNotifications();
            expect(notifsAfterWait.length).toBe(1);
            expect(notifsAfterWait[0].message).toContain('2 Änderungen von admin');
            expect(notifsAfterWait[0].message).toContain('Änderung 1');
            expect(notifsAfterWait[0].message).toContain('Änderung 2');
        });
    });

    describe('nextcloud', () => {
        it('should send message via nextcloud talk API', async () => {
            axios.post.mockResolvedValueOnce({
                data: { ocs: { data: { token: 'mockToken123' } } }
            }).mockResolvedValueOnce({});

            await nextcloud('user1', 'Hello world');

            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(axios.post.mock.calls[0][0]).toContain('/room');
            expect(axios.post.mock.calls[1][0]).toContain('/chat/mockToken123');
        });

        it('should handle nextcloud api errors gracefully', async () => {
            axios.post.mockRejectedValueOnce({
                response: { status: 500, data: { msg: 'error' } }
            });

            // Try shouldn't throw
            await nextcloud('user1', 'Hello');
            expect(axios.post).toHaveBeenCalledTimes(1);
        });
    });
});
