const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');
const Ticket = require('../src/models/ticket');
const Log = require('../src/models/log');

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

const createItTicket = async (token = tokens.lehrer1) => {
    const res = await request(app).post('/api/tickets').set('Authorization', `Bearer ${token}`).send(IT_TICKET);
    expect(res.status).toBe(201);
    return res.body;
};

const rejectTicket = async (ticket) => {
    const res = await request(app)
        .post(`/api/tickets/${ticket._id}/action`)
        .set('Authorization', `Bearer ${tokens.netzwerker}`)
        .send({ actionName: 'ablehnen' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('geschlossen.abgelehnt');
    return res.body;
};

const reopen = (ticket, token, overrides = {}) => request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({ ...IT_TICKET, description: 'Problem tritt wieder auf', ...overrides, reopenOf: ticket.id });

describe('Comments on closed tickets', () => {
    it('allows commenting open tickets but rejects closed ones with 409', async () => {
        const ticket = await createItTicket();

        const openRes = await request(app)
            .post(`/api/tickets/${ticket._id}/comments`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ text: 'Noch offen' });
        expect(openRes.status).toBe(201);

        await rejectTicket(ticket);

        const closedRes = await request(app)
            .post(`/api/tickets/${ticket._id}/comments`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ text: 'Zu spät' });
        expect(closedRes.status).toBe(409);

        // Existing comments stay readable
        const listRes = await request(app)
            .get(`/api/tickets/${ticket._id}/comments`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        expect(listRes.status).toBe(200);
        expect(listRes.body.map(c => c.text)).toEqual(['Noch offen']);
    });

    it('lets readers without comment permission read comments', async () => {
        const ticket = await createItTicket();
        // lehrer2 is in 'Lehrkräfte' (read) but not in 'comment' groups of IT-Ticket
        const res = await request(app)
            .get(`/api/tickets/${ticket._id}/comments`)
            .set('Authorization', `Bearer ${tokens.lehrer2}`);
        expect(res.status).toBe(200);
    });

    it('denies reading comments without read access', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ type: 'Stundenplan-Ticket', title: 'Elternzeit', description: 'ab 1.2.', day: 'Montag', lessons: [1, 2] });
        expect(res.status).toBe(201);

        // Stundenplan-Ticket is readable by @creator, Stundenplanung, Schulleitung only
        const readRes = await request(app)
            .get(`/api/tickets/${res.body._id}/comments`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        expect(readRes.status).toBe(403);
    });
});

describe('Reopen', () => {
    it('creates a linked copy, keeps the creator and closes the predecessor as wiedereröffnet', async () => {
        const original = await createItTicket();
        await rejectTicket(original);

        const res = await reopen(original, tokens.netzwerker, { assignee: 'netzwerker' });
        expect(res.status).toBe(201);

        const copy = res.body;
        expect(copy.id).not.toBe(original.id);
        expect(copy.state).toBe('offen.neu');
        expect(copy.creator).toBe('lehrer1');
        expect(copy.reopenedBy).toBe('netzwerker');
        expect(copy.starredBy).toEqual(['netzwerker']);
        expect(copy.assignee).toBeUndefined();
        expect(copy.links).toHaveLength(1);
        expect(copy.links[0]).toMatchObject({ type: 'follows', ticket: original.id, creator: 'netzwerker' });

        const predecessor = await Ticket.findById(original._id);
        expect(predecessor.state).toBe('geschlossen.wiedereröffnet');

        const predecessorLog = await Log.findOne({ ticket: original._id }).sort({ timestamp: -1 });
        expect(predecessorLog.action).toBe(`Wiedereröffnet als ${copy.id}`);
        expect(predecessorLog.editor).toBe('netzwerker');

        const copyLog = await Log.findOne({ ticket: copy._id });
        expect(copyLog.action).toBe(`Ticket erstellt (Wiedereröffnung von ${original.id})`);
    });

    it('does not star the copy when the creator reopens it himself', async () => {
        const original = await createItTicket();
        await rejectTicket(original);

        const res = await reopen(original, tokens.lehrer1);
        expect(res.status).toBe(201);
        expect(res.body.creator).toBe('lehrer1');
        expect(res.body.starredBy).toEqual([]);
    });

    it('prevents reopening the same ticket twice', async () => {
        const original = await createItTicket();
        await rejectTicket(original);

        expect((await reopen(original, tokens.netzwerker)).status).toBe(201);
        const second = await reopen(original, tokens.lehrer1);
        expect(second.status).toBe(409);
        expect(await Ticket.countDocuments({ type: 'IT-Ticket' })).toBe(2);
    });

    it('rejects users that are not allowed by the reopen action', async () => {
        const original = await createItTicket();
        await rejectTicket(original);

        // lehrer2 is neither creator nor in Netzwerkteam / IT-Support
        const res = await reopen(original, tokens.lehrer2);
        expect(res.status).toBe(403);
        const predecessor = await Ticket.findById(original._id);
        expect(predecessor.state).toBe('geschlossen.abgelehnt');
    });

    it('rejects reopening tickets in states without reopen action', async () => {
        const original = await createItTicket();
        // open ticket
        expect((await reopen(original, tokens.lehrer1)).status).toBe(409);

        // cancelled ticket
        const cancelRes = await request(app)
            .post(`/api/tickets/${original._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });
        expect(cancelRes.status).toBe(200);
        expect((await reopen(original, tokens.lehrer1)).status).toBe(409);
    });

    it('rejects a different type than the predecessor', async () => {
        const original = await createItTicket();
        await rejectTicket(original);
        const res = await reopen(original, tokens.lehrer1, { type: 'Hausmeisterauftrag' });
        expect(res.status).toBe(400);
    });

    it('cannot be executed as a regular action', async () => {
        const original = await createItTicket();
        await rejectTicket(original);
        const res = await request(app)
            .post(`/api/tickets/${original._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'wiedereröffnen' });
        expect(res.status).toBe(400);
    });

    it('exposes the link in both directions as relatedTickets', async () => {
        const original = await createItTicket();
        await rejectTicket(original);
        const copy = (await reopen(original, tokens.netzwerker)).body;

        const copyRes = await request(app)
            .get(`/api/tickets?id=${copy.id}`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        expect(copyRes.body[0].relatedTickets).toEqual([
            expect.objectContaining({ id: original.id, linkType: 'follows', direction: 'out', state: 'geschlossen.wiedereröffnet' })
        ]);

        const originalRes = await request(app)
            .get(`/api/tickets?id=${original.id}`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        expect(originalRes.body[0].relatedTickets).toEqual([
            expect.objectContaining({ id: copy.id, linkType: 'follows', direction: 'in', state: 'offen.neu' })
        ]);
    });

    it('does not allow undoing the reopen on the predecessor', async () => {
        const original = await createItTicket();
        await rejectTicket(original);
        await reopen(original, tokens.netzwerker);

        const undoable = await request(app)
            .get(`/api/tickets/${original._id}/undoable`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(undoable.status).toBe(200);
        expect(undoable.body).toBeNull();

        const undo = await request(app)
            .post(`/api/tickets/${original._id}/undo`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(undo.status).toBe(400);
    });

    it('ignores client supplied link and ownership fields on regular creation', async () => {
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ ...IT_TICKET, links: [{ type: 'duplicates', ticket: 'ITT-99' }], starredBy: ['admin'], reopenedBy: 'admin' });
        expect(res.status).toBe(201);
        expect(res.body.links).toBeUndefined();
        expect(res.body.starredBy).toEqual([]);
        expect(res.body.reopenedBy).toBeUndefined();
    });
});
