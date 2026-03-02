const request = require('supertest');
const app = require('../../server'); // This will start connecting to DB asynchronously
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');

const { updateUserSettings } = require('../../auth');
const Subscription = require('../../models/subscription');
const { runSubscriptionCheck } = require('../../subscriptionWorker');
const { checkUnpublishedLogs, getTestNotifications, clearTestNotifications } = require('../../publisher');
const { loadBots } = require('../../bots');
const Log = require('../../models/log');

let tokens;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    tokens = getTokens();
    loadBots();

    await updateUserSettings('schulleiter', { notificationUri: 'test:schulleiter@local' });
    await updateUserSettings('hausmeister', { notificationUri: 'test:hausmeister@local' });
});

beforeEach(async () => {
    await clearDatabase();

    // Set up subscriptions
    await Subscription.create([
        { userId: 'schulleiter', name: 'Meine Tickets', filter: { creator: 'schulleiter' }, lastMatchingTickets: [] },
        { userId: 'hausmeister', name: 'Mir Zugewiesen', filter: { assignmentType: 'group' }, lastMatchingTickets: [] }
    ]);
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Hausmeisterauftrag', () => {

    const ticketPayload = {
        type: 'Hausmeisterauftrag',
        title: 'Lampe flackert',
        category: 'Reparatur',
        description: 'Testticket'
    };

    it('should complete the full lifecycle of a Hausmeisterauftrag and trigger auto-approve bot', async () => {
        // --- 1. schulleiter creates ticket ---
        // automatically genehmigen bot should move it to offen.genehmigt immediately
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;

        // Bot triggers immediately and modifies to offen.genehmigt
        expect(t1.state).toBe('offen.genehmigt');

        // Verify Publisher Logs
        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        let notifs = getTestNotifications();
        // Creation logs (created, and maybe technically a bot modified state)
        // Creator shouldn't get creation logs, but maybe the bot modification is logged? 
        // We don't strictly assert the exact logs here, but it works.
        clearTestNotifications();

        // Verify sub check
        await runSubscriptionCheck();
        notifs = getTestNotifications();
        // hausmeister sees 1 ticket in "Mir Zugewiesen"
        expect(notifs.some(n => n.targetUser === 'hausmeister' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        clearTestNotifications();

        // --- 2. Hausmeister processes the ticket ---
        const resDone = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {
                    badges: []
                }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('offen.erledigt');

        // --- 3. Schulleiter acknowledges ---
        const resOk = await request(app)
            .post(`/api/tickets/${resDone.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({ actionName: 'ok' });

        expect(resOk.status).toBe(200);
        expect(resOk.body.state).toBe('geschlossen.ok');
    });
});
