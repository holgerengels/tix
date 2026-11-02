const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');
const Ticket = require('../src/models/ticket');
const Log = require('../src/models/log');
const Comment = require('../src/models/comment');

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

const createTicket = async (overrides = {}, token = tokens.lehrer1) => {
    const res = await request(app)
        .post('/api/tickets')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...IT_TICKET, ...overrides });
    expect(res.status).toBe(201);
    return res.body;
};

describe('Duplicate tickets workflow', () => {
    it('closes ticket as duplicate and links to target ticket', async () => {
        const target = await createTicket({ title: 'Original: Beamer defekt', location: 'R101' });
        const duplicate = await createTicket({ title: 'Kopie: Beamer kaputt', location: 'R101' }, tokens.lehrer2);

        const res = await request(app)
            .post(`/api/tickets/${duplicate._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`)
            .send({
                actionName: 'als Duplikat schließen',
                targetTicketId: target.id,
                comment: 'Gleiches Problem wie in ' + target.id,
                starTarget: true
            });

        expect(res.status).toBe(200);
        expect(res.body.state).toBe('geschlossen.redundant');
        expect(res.body.links).toEqual([
            expect.objectContaining({
                type: 'duplicates',
                ticket: target.id,
                creator: 'netzwerker'
            })
        ]);

        // Duplicate ticket has relatedTickets direction out
        expect(res.body.relatedTickets).toEqual([
            expect.objectContaining({
                id: target.id,
                linkType: 'duplicates',
                direction: 'out'
            })
        ]);

        // Target ticket has relatedTickets direction in
        const targetRes = await request(app)
            .get(`/api/tickets?id=${target.id}`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        expect(targetRes.status).toBe(200);
        expect(targetRes.body[0].relatedTickets).toEqual([
            expect.objectContaining({
                id: duplicate.id,
                linkType: 'duplicates',
                direction: 'in',
                state: 'geschlossen.redundant'
            })
        ]);

        // Target ticket has duplicate creator in starredBy
        expect(targetRes.body[0].starredBy).toContain('lehrer2');

        // Logs on duplicate ticket
        const dupLogs = await request(app)
            .get(`/api/tickets/${duplicate._id}/logs`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(dupLogs.body.some(l => l.action.includes('als Duplikat schließen'))).toBe(true);

        // Logs on target ticket
        const targetLogs = await request(app)
            .get(`/api/tickets/${target._id}/logs`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(targetLogs.body.some(l => l.action.includes(`${duplicate.id} als Duplikat markiert`))).toBe(true);

        // Comment created on duplicate
        const comments = await request(app)
            .get(`/api/tickets/${duplicate._id}/comments`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(comments.body.some(c => c.text.includes('Gleiches Problem'))).toBe(true);
    });

    it('rejects duplicating to self or missing target', async () => {
        const ticket = await createTicket();

        const resSelf = await request(app)
            .post(`/api/tickets/${ticket._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`)
            .send({
                actionName: 'als Duplikat schließen',
                targetTicketId: ticket.id
            });
        expect(resSelf.status).toBe(400);

        const resMissing = await request(app)
            .post(`/api/tickets/${ticket._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`)
            .send({
                actionName: 'als Duplikat schließen'
            });
        expect(resMissing.status).toBe(400);

        const resNotFound = await request(app)
            .post(`/api/tickets/${ticket._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`)
            .send({
                actionName: 'als Duplikat schließen',
                targetTicketId: 'ITT-999999'
            });
        expect(resNotFound.status).toBe(404);
    });

    it('denies access if user is not in action groups', async () => {
        const target = await createTicket();
        const duplicate = await createTicket();

        // lehrer1 is not in Netzwerker or IT-Support
        const res = await request(app)
            .post(`/api/tickets/${duplicate._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                actionName: 'als Duplikat schließen',
                targetTicketId: target.id
            });
        expect(res.status).toBe(403);
    });

    it('allows undoing duplicate action', async () => {
        const target = await createTicket();
        const duplicate = await createTicket();

        await request(app)
            .post(`/api/tickets/${duplicate._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`)
            .send({
                actionName: 'als Duplikat schließen',
                targetTicketId: target.id
            });

        // Check undoable
        const undoableRes = await request(app)
            .get(`/api/tickets/${duplicate._id}/undoable`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(undoableRes.status).toBe(200);
        expect(undoableRes.body).not.toBeNull();

        // Perform undo
        const undoRes = await request(app)
            .post(`/api/tickets/${duplicate._id}/undo`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(undoRes.status).toBe(200);
        expect(undoRes.body.ticket.state).toBe('offen.neu');
        expect(undoRes.body.ticket.links || []).toEqual([]);

        // Target ticket has no duplicate link anymore
        const targetRes = await request(app)
            .get(`/api/tickets?id=${target.id}`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`);
        expect(targetRes.body[0].relatedTickets || []).toEqual([]);
    });
});
