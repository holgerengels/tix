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
    await updateUserSettings('hausmeister', { notificationUri: 'test:hausmeister@local' }); // We'll keep this just in case
    // NOTE: 'mensateam' is not a mock user in `auth.js` currently, so we'll test the creator/schulleiter flow 
    // or add 'mensateam' if it exists. Looking at MOCK_USERS in auth.js, we don't have a 'mensateam' user.
    // For now, let's use a user that could be in Mensateam, or just test Schulleitung approval and 
    // maybe we need to append a mock user for Mensateam in `auth.js` if we test that part.
});

beforeEach(async () => {
    await clearDatabase();

    // Set up subscriptions
    await Subscription.create([
        { userId: 'schulleiter', name: 'Meine Tickets', filter: { creator: 'schulleiter' }, lastMatchingTickets: [] }
    ]);
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Bewirtungsauftrag', () => {

    const ticketPayload = {
        type: 'Bewirtungsauftrag',
        title: 'Lehrerkonferenz',
        typeSelection: 'intern', // config mapping expects 'type' but request payload conflicts with doc 'type'. Let's rename in payload or handle it correctly.
        date: '2026-10-15',
        numberOfPersons: 20,
        room: 'Raum 101',
        description: 'Testticket für Konferenzbewirtung',
        breakfast: true,
        bfDrinksKaffee: true,
        bfFoodBrezeln: true
    };

    it('should auto-approve Bewirtungsauftrag if creator is in Schulleitung', async () => {
        // --- 1. schulleiter creates ticket ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({ ...ticketPayload, type: 'Bewirtungsauftrag', typ: 'intern' });

        expect(res.status).toBe(201);
        const t1 = res.body;

        // The automatically_genehmigen bot should move it to offen.genehmigt immediately
        expect(t1.state).toBe('offen.genehmigt');
    });

    it('should complete the full lifecycle of a Bewirtungsauftrag with manual approval', async () => {
        // --- 1. lehrer1 creates ticket ---
        // Unlike Hausmeister, there's NO automatically_genehmigen bot for Bewirtungsauftrag.
        // It should stay in "offen.neu".
        // To avoid conflicts with "type" ticket field vs "type" data field, we send type as the ticket type,
        // and the form payload fields. Wait, the API maps `req.body.type` to ticket type. 
        // We will send 'typ' for the ticket type and 'type' for the form field, or vice versa depending on the API.
        // The API actually uses `req.body.typ || req.body.type`. So if we have both, it takes `typ`.
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ ...ticketPayload, type: 'Bewirtungsauftrag', typ: 'intern' }); // Ticket type must be 'Bewirtungsauftrag'

        expect(res.status).toBe(201);
        const t1 = res.body;

        // No bot triggers, so state remains offen.neu
        expect(t1.state).toBe('offen.neu');

        // --- 2. Schulleiter approves the ticket ---
        const resApprove = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({ actionName: 'genehmigen' });

        expect(resApprove.status).toBe(200);
        expect(resApprove.body.state).toBe('offen.genehmigt');

        // --- 3. Mensateam processes the ticket ---
        const resDone = await request(app)
            .post(`/api/tickets/${resApprove.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer2}`) // lehrer2 is in Mensateam
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {
                    badges: []
                }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('offen.erledigt');

        // --- 4. Creator (lehrer1) acknowledges ---
        const resOk = await request(app)
            .post(`/api/tickets/${resDone.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'ok' });

        expect(resOk.status).toBe(200);
        expect(resOk.body.state).toBe('geschlossen.ok');
    });
});
