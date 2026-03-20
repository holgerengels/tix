const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');
const { loadBots } = require('../../src/bots');
const { format, addDays } = require('date-fns');

let tokens;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    tokens = getTokens();
    loadBots();
});

beforeEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Vertretungsplan-Ticket', () => {

    const futureDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    const ticketPayload = {
        type: 'Vertretungsplan-Ticket',
        title: 'Vertretung für Mathe',
        description: 'Herr Schmidt fällt aus',
        dateFrom: futureDate,
        lessonFrom: '3',
        dateUntil: futureDate,
        lessonUntil: '6'
    };

    it('should complete the full lifecycle of a Vertretungsplan-Ticket', async () => {
        // --- 1. lehrer1 creates ticket (Lehrkräfte can create) ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;
        expect(t1.state).toBe('offen.neu');
        expect(t1.id).toMatch(/^VRP-/);
        expect(t1.badges || []).toContain('dringend');

        // --- 2. stundenplaner processes via form bearbeiten ---
        const resAssign = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'in Arbeit',
                formData: { assignee: 'stundenplaner' }
            });

        expect(resAssign.status).toBe(200);
        expect(resAssign.body.state).toBe('offen.inArbeit');

        // --- 3. stundenplaner marks as erledigt ---
        const resErledigt = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt'
            });

        expect(resErledigt.status).toBe(200);
        expect(resErledigt.body.state).toBe('offen.erledigt');

        // --- 4. lehrer1 (creator) acknowledges ---
        const resOk = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'ok' });

        expect(resOk.status).toBe(200);
        expect(resOk.body.state).toBe('geschlossen.ok');
    });

    it('should allow creator to cancel their ticket', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);

        const resCancel = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });

        expect(resCancel.status).toBe(200);
        expect(resCancel.body.state).toBe('geschlossen.storniert');
    });

    it('should allow stundenplaner to reject a ticket', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);

        const resReject = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'ablehnen' });

        expect(resReject.status).toBe(200);
        expect(resReject.body.state).toBe('offen.abgelehnt');
    });

    it('should deny actions by unauthorized users', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);

        // hausmeister tries to bearbeiten (not authorized)
        const resAction = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({ actionName: 'bearbeiten' });

        expect(resAction.status).toBe(403);
    });

    it('should deny creation by unauthorized groups', async () => {
        // hausmeister should NOT be able to create Vertretungsplan-Tickets
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send(ticketPayload);

        expect(res.status).toBe(403);
    });
});
