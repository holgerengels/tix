const request = require('supertest');
const app = require('../../src/server'); // This will start connecting to DB asynchronously
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');

const { updateUserSettings } = require('../../src/auth');
const Subscription = require('../../src/models/subscription');
const { runSubscriptionCheck } = require('../../src/subscriptionWorker');
const { checkUnpublishedLogs, getTestNotifications, clearTestNotifications } = require('../../src/publisher');
const { loadBots } = require('../../src/bots');
const Log = require('../../src/models/log');

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
        location: 'Raum 101 (Textilarbeit / Werken)',
        description: 'Testticket'
    };

    it('should complete the direct lifecycle of a Hausmeisterauftrag (neu -> in Arbeit -> erledigt)', async () => {
        // --- 1. lehrer1 creates ticket ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;
        expect(t1.state).toBe('offen.neu');

        // Verify sub check: hausmeister sees 1 ticket in "Mir Zugewiesen"
        await runSubscriptionCheck();
        let notifs = getTestNotifications();
        expect(notifs.some(n => n.targetUser === 'hausmeister' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        clearTestNotifications();

        // --- 2. Hausmeister sets to in Arbeit ---
        const resInArbeit = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'in Arbeit',
                formData: { badges: [] }
            });

        expect(resInArbeit.status).toBe(200);
        expect(resInArbeit.body.state).toBe('offen.inArbeit');

        // --- 3. Hausmeister completes the ticket ---
        const resDone = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: { badges: [] }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('geschlossen.erledigt');
    });

    it('should complete approval lifecycle (neu -> Freigabe anfordern -> Schulleitung genehmigt -> erledigt)', async () => {
        // --- 1. lehrer1 creates ticket ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;
        expect(t1.state).toBe('offen.neu');

        // --- 2. Hausmeister requests approval ---
        const resFreigabe = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'Freigabe anfordern',
                formData: { badges: [] }
            });

        expect(resFreigabe.status).toBe(200);
        expect(resFreigabe.body.state).toBe('offen.freigabe');

        // --- 3. Schulleitung approves ticket ---
        const resApprove = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({
                actionName: 'genehmigen'
            });

        expect(resApprove.status).toBe(200);
        expect(resApprove.body.state).toBe('offen.genehmigt');

        // --- 4. Hausmeister finishes ticket from genehmigt ---
        const resDone = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: { badges: [] }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('geschlossen.erledigt');
    });
});
