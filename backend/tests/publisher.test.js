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
