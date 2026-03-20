const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');
const { loadBots } = require('../../src/bots');

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

describe('Workflow: Stundenplan-Ticket', () => {

    const ticketPayload = {
        type: 'Stundenplan-Ticket',
        title: 'Raumtausch Physik/Chemie',
        description: 'Freitags Raum 322 statt 321',
        day: 'Freitag',
        dateFrom: new Date().toISOString().split('T')[0],
        lessons: { min: 3, max: 4 }
    };

    it('should complete the full lifecycle of a Stundenplan-Ticket', async () => {
        // --- 1. stundenplaner creates ticket (only Stundenplanung can create) ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;
        expect(t1.state).toBe('offen.neu');
        expect(t1.id).toMatch(/^STP-/);
        // dringend bot should run on offen.neu
        expect(t1.badges || []).toContain('dringend');

        // --- 2. stundenplaner assigns to self and processes ---
        const resBearbeiten = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'in Arbeit',
                formData: { assignee: 'stundenplaner' }
            });

        expect(resBearbeiten.status).toBe(200);
        expect(resBearbeiten.body.state).toBe('offen.inArbeit');
        expect(resBearbeiten.body.assignee).toBe('stundenplaner');

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

        // --- 4. creator acknowledges ---
        const resOk = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'ok' });

        expect(resOk.status).toBe(200);
        expect(resOk.body.state).toBe('geschlossen.ok');
    });

    it('should allow stundenplaner to reject a ticket', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);

        const resReject = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'ablehnen' });

        expect(resReject.status).toBe(200);
        expect(resReject.body.state).toBe('offen.abgelehnt');

        // Creator acknowledges rejection
        const resOk = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'ok' });

        expect(resOk.status).toBe(200);
        expect(resOk.body.state).toBe('geschlossen.ok');
    });

    it('should deny creation by unauthorized groups', async () => {
        // lehrer1 (Lehrkräfte) should NOT be able to create Stundenplan-Tickets
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(403);
    });

    it('should deny actions by unauthorized users', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);

        // lehrer1 tries to bearbeiten (not in Stundenplanung or Schulleitung)
        const resAction = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'bearbeiten' });

        expect(resAction.status).toBe(403);
    });

    it('should allow cancellation by creator', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);

        const resCancel = await request(app)
            .post(`/api/tickets/${res.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'stornieren' });

        expect(resCancel.status).toBe(200);
        expect(resCancel.body.state).toBe('geschlossen.storniert');
    });
});
