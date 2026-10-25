const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');
const Ticket = require('../src/models/ticket');
const Log = require('../src/models/log');

/*
 * Undo rules (IT-Ticket):
 *   access 'undo':  Schulleitung, Netzwerkteam (+ Administration)
 *   'ablehnen':     Schulleitung, Netzwerkteam
 *   'zuweisen':     Netzwerkteam, IT-Support
 * A user may undo the latest unpublished log entry if they have undo access AND
 * either executed the action themselves, could have executed it, or are admin.
 * Ticket creation and the reopen entry can never be undone.
 */

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

const IT_TICKET = {
    type: 'IT-Ticket',
    title: 'Beamer defekt',
    description: 'Beamer in R101 geht nicht',
    category: 'Hardware',
    location: 'R101'
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const createTicket = async () => {
    const res = await request(app).post('/api/tickets').set(auth(tokens.lehrer1)).send(IT_TICKET);
    expect(res.status).toBe(201);
    return res.body;
};

const runAction = async (ticket, token, body) => {
    const res = await request(app).post(`/api/tickets/${ticket._id}/action`).set(auth(token)).send(body);
    expect(res.status).toBe(200);
    return res.body;
};

const undoable = (ticket, token) => request(app).get(`/api/tickets/${ticket._id}/undoable`).set(auth(token));
const undo = (ticket, token) => request(app).post(`/api/tickets/${ticket._id}/undo`).set(auth(token));

describe('Undo', () => {
    it('lets users undo their own action', async () => {
        const ticket = await createTicket();
        await runAction(ticket, tokens.netzwerker, { actionName: 'ablehnen' });

        const check = await undoable(ticket, tokens.netzwerker);
        expect(check.status).toBe(200);
        expect(check.body).not.toBeNull();
        expect(check.body.action).toMatch(/^ablehnen/);

        const res = await undo(ticket, tokens.netzwerker);
        expect(res.status).toBe(200);
        expect((await Ticket.findById(ticket._id)).state).toBe('offen.neu');
    });

    it('lets users undo foreign actions they could have executed themselves', async () => {
        const ticket = await createTicket();
        await runAction(ticket, tokens.netzwerker, { actionName: 'ablehnen' });

        // schulleiter: undo access and in the groups of 'ablehnen'
        const check = await undoable(ticket, tokens.schulleiter);
        expect(check.body).not.toBeNull();

        const res = await undo(ticket, tokens.schulleiter);
        expect(res.status).toBe(200);
        expect((await Ticket.findById(ticket._id)).state).toBe('offen.neu');
    });

    it('denies undoing foreign actions the user could not have executed', async () => {
        const ticket = await createTicket();
        await runAction(ticket, tokens.netzwerker, { actionName: 'zuweisen', formData: { assignee: 'netzwerker' } });

        // schulleiter has undo access, but is not in the groups of 'zuweisen'
        const check = await undoable(ticket, tokens.schulleiter);
        expect(check.status).toBe(200);
        expect(check.body).toBeNull();

        const res = await undo(ticket, tokens.schulleiter);
        expect(res.status).toBe(403);
    });

    it('denies undo without undo access', async () => {
        const ticket = await createTicket();
        await runAction(ticket, tokens.netzwerker, { actionName: 'ablehnen' });

        // lehrer1 is the creator, but has no undo access
        const check = await undoable(ticket, tokens.lehrer1);
        expect(check.body).toBeNull();

        const res = await undo(ticket, tokens.lehrer1);
        expect(res.status).toBe(403);
        expect((await Ticket.findById(ticket._id)).state).toBe('geschlossen.abgelehnt');
    });

    it('lets admins undo any action', async () => {
        const ticket = await createTicket();
        await runAction(ticket, tokens.netzwerker, { actionName: 'zuweisen', formData: { assignee: 'netzwerker' } });

        const check = await undoable(ticket, tokens.adminOnly);
        expect(check.body).not.toBeNull();

        const res = await undo(ticket, tokens.adminOnly);
        expect(res.status).toBe(200);
        expect((await Ticket.findById(ticket._id)).assignee).toBeUndefined();
    });

    it('never allows undoing the ticket creation, not even for admins', async () => {
        const ticket = await createTicket();

        for (const token of [tokens.netzwerker, tokens.adminOnly]) {
            const check = await undoable(ticket, token);
            expect(check.body).toBeNull();
            const res = await undo(ticket, token);
            expect(res.status).toBe(400);
        }
        expect(await Ticket.findById(ticket._id)).not.toBeNull();
    });

    it('does not allow undoing published actions', async () => {
        const ticket = await createTicket();
        await runAction(ticket, tokens.netzwerker, { actionName: 'ablehnen' });
        await Log.updateMany({ ticket: ticket._id }, { published: new Date() });

        const check = await undoable(ticket, tokens.netzwerker);
        expect(check.body).toBeNull();

        const res = await undo(ticket, tokens.netzwerker);
        expect(res.status).toBe(400);
    });

    it('returns 404 for invalid or unknown ticket ids', async () => {
        for (const id of ['undefined', new mongoose.Types.ObjectId().toString()]) {
            const check = await request(app).get(`/api/tickets/${id}/undoable`).set(auth(tokens.netzwerker));
            expect(check.status).toBe(404);
            const res = await request(app).post(`/api/tickets/${id}/undo`).set(auth(tokens.netzwerker));
            expect(res.status).toBe(404);
        }
    });
});
