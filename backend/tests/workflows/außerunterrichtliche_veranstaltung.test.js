const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');

const { updateUserSettings } = require('../../src/auth');
const Subscription = require('../../src/models/subscription');
const { runSubscriptionCheck } = require('../../src/subscriptionWorker');
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

    await updateUserSettings('lehrer1', { notificationUri: 'test:lehrer1@local' });
    await updateUserSettings('abteilungsleiter', { notificationUri: 'test:abteilungsleiter@local' });
    await updateUserSettings('stundenplaner', { notificationUri: 'test:stundenplaner@local' });
});

beforeEach(async () => {
    await clearDatabase();

    await Subscription.create([
        { userId: 'lehrer1', name: 'Meine Tickets', filter: { creator: 'lehrer1' }, lastMatchingTickets: [] },
        { userId: 'abteilungsleiter', name: 'Mir Zugewiesen', filter: { assignee: 'abteilungsleiter' }, lastMatchingTickets: [] }
    ]);
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Außerunterrichtliche Veranstaltung', () => {

    const ticketPayload = {
        type: 'Außerunterrichtliche Veranstaltung',
        title: 'Exkursion Museum',
        dateFrom: '2026-10-20',
        lessonFrom: '1',
        dateUntil: '2026-10-20',
        lessonUntil: '6',
        location: 'Stadtmuseum',
        assignee: 'abteilungsleiter',
        colleaguesAgree: true,
        acrossDepartments: false,
        description: 'Testticket für Exkursion'
    };

    it('should complete the full lifecycle with manual approval and processing', async () => {
        // --- 1. lehrer1 creates ticket ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ ...ticketPayload, typ: 'Außerunterrichtliche Veranstaltung' });

        expect(res.status).toBe(201);
        const t1 = res.body;

        expect(t1.state).toBe('offen.neu');

        // --- 2. Abteilungsleitung approves the ticket ---
        const resApprove = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.abteilungsleiter}`)
            .send({ actionName: 'genehmigen' });

        expect(resApprove.status).toBe(200);
        expect(resApprove.body.state).toBe('offen.genehmigt');

        // --- 3. Stundenplanung processes the ticket ---
        const resDone = await request(app)
            .post(`/api/tickets/${resApprove.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {
                    badges: []
                }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('geschlossen.erledigt');
    });

    it('should allow Abteilungsleitung to reject the ticket', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ ...ticketPayload, typ: 'Außerunterrichtliche Veranstaltung' });

        const t1 = res.body;

        const resReject = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.abteilungsleiter}`)
            .send({ actionName: 'ablehnen', comment: 'Bitte anderes Datum wählen.' });

        expect(resReject.status).toBe(200);
        expect(resReject.body.state).toBe('geschlossen.abgelehnt');
    });
});
