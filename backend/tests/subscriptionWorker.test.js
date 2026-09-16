const app = require('../src/server');
const mongoose = require('mongoose');
const { clearDatabase, closeDatabase } = require('./setup');
const Subscription = require('../src/models/subscription');
const Ticket = require('../src/models/ticket');
const { updateUserSettings } = require('../src/auth');
const { runSubscriptionCheck } = require('../src/subscriptionWorker');
const { getTestNotifications, clearTestNotifications } = require('../src/publisher');
const { loadBots } = require('../src/bots');

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    loadBots();

    await updateUserSettings('testuser', { notificationUri: 'test:testuser@local' });
});

beforeEach(async () => {
    await clearDatabase();
    clearTestNotifications();
});

afterAll(async () => {
    await closeDatabase();
});

describe('SubscriptionWorker - only notify on newly added tickets', () => {
    it('should notify only when tickets are added, not when tickets are removed or change state', async () => {
        // Create a subscription for open IT-Tickets
        const sub = await Subscription.create({
            userId: 'testuser',
            name: 'Offene IT Tickets',
            filter: { type: 'IT-Ticket', states: ['offen'] },
            lastMatchingTickets: []
        });

        // 1. Initial state: create ticket T1 (offen.neu)
        const t1 = await Ticket.create({
            id: 'IT-1',
            type: 'IT-Ticket',
            title: 'Drucker defekt',
            state: 'offen.neu',
            creator: 'lehrer1'
        });

        // First check -> T1 is newly added -> notification expected
        await runSubscriptionCheck();
        let notifs = getTestNotifications();
        expect(notifs.length).toBe(1);
        expect(notifs[0].targetUser).toBe('testuser');
        expect(notifs[0].message).toContain('Offene IT Tickets');
        expect(notifs[0].message).toContain('IT-1');
        clearTestNotifications();

        // 2. Second check without any changes -> no notification
        await runSubscriptionCheck();
        expect(getTestNotifications().length).toBe(0);

        // 3. Ticket T1 changes state from offen.neu to offen.inArbeit (still matches filter)
        await Ticket.updateOne({ id: 'IT-1' }, { state: 'offen.inArbeit' });
        await runSubscriptionCheck();
        // NO new ticket arrived -> no notification!
        expect(getTestNotifications().length).toBe(0);

        // Check that snapshot was updated in DB
        const subAfterStateChange = await Subscription.findById(sub._id);
        expect(subAfterStateChange.lastMatchingTickets.length).toBe(1);
        expect(subAfterStateChange.lastMatchingTickets[0].state).toBe('offen.inArbeit');

        // 4. Ticket T1 is closed -> leaves the filter
        await Ticket.updateOne({ id: 'IT-1' }, { state: 'geschlossen.erledigt' });
        await runSubscriptionCheck();
        // Ticket removed -> NO notification!
        expect(getTestNotifications().length).toBe(0);

        // Check that snapshot is now empty
        const subAfterRemoval = await Subscription.findById(sub._id);
        expect(subAfterRemoval.lastMatchingTickets.length).toBe(0);

        // 5. Another new ticket T2 is created
        const t2 = await Ticket.create({
            id: 'IT-2',
            type: 'IT-Ticket',
            title: 'WLAN weg',
            state: 'offen.neu',
            creator: 'lehrer2'
        });

        await runSubscriptionCheck();
        notifs = getTestNotifications();
        expect(notifs.length).toBe(1);
        expect(notifs[0].message).toContain('IT-2');
        clearTestNotifications();

        // 6. Ticket T1 is reopened -> enters filter again -> it is newly added compared to current snapshot [IT-2]
        await Ticket.updateOne({ id: 'IT-1' }, { state: 'offen.neu' });
        await runSubscriptionCheck();
        notifs = getTestNotifications();
        expect(notifs.length).toBe(1);
        expect(notifs[0].message).toContain('IT-1');
        clearTestNotifications();
    });
});
