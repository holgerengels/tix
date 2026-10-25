const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const Ticket = require('../src/models/ticket');

/*
 * starredBy is a mere bookmark: it must never grant read access.
 * Krankmeldung read access: @creator, Schulleitung, Vertretungsplanung (+ Administration).
 */

let tokens;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    tokens = getTokens();
});

beforeEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const createSickNote = (extra = {}) => Ticket.create({
    type: 'Krankmeldung',
    id: 'KRANK-1',
    title: 'Krankmeldung Mustermann',
    creator: 'lehrer1',
    state: 'offen.neu',
    ...extra
});

const listIds = (res) => (res.body.tickets || res.body).map(t => t._id.toString());

describe('starredBy grants no read access', () => {
    it('does not allow bookmarking unreadable tickets', async () => {
        const ticket = await createSickNote();

        const res = await request(app).post(`/api/tickets/${ticket._id}/star`).set(auth(tokens.lehrer2));
        expect(res.status).toBe(403);
        expect((await Ticket.findById(ticket._id)).starredBy).not.toContain('lehrer2');

        // also by human readable id
        const res2 = await request(app).post('/api/tickets/KRANK-1/star').set(auth(tokens.lehrer2));
        expect(res2.status).toBe(403);
    });

    it('allows bookmarking readable tickets', async () => {
        const ticket = await createSickNote();

        for (const token of [tokens.lehrer1, tokens.schulleiter, tokens.adminOnly]) {
            const res = await request(app).post(`/api/tickets/${ticket._id}/star`).set(auth(token));
            expect(res.status).toBe(200);
        }
    });

    it('ignores existing starredBy entries for list, comments and logs', async () => {
        const ticket = await createSickNote({ starredBy: ['lehrer2'] });

        const starred = await request(app).get('/api/tickets?filter=starred').set(auth(tokens.lehrer2));
        expect(starred.status).toBe(200);
        expect(listIds(starred)).not.toContain(ticket._id.toString());

        const byId = await request(app).get('/api/tickets?id=KRANK-1').set(auth(tokens.lehrer2));
        expect(listIds(byId)).not.toContain(ticket._id.toString());

        const comments = await request(app).get(`/api/tickets/${ticket._id}/comments`).set(auth(tokens.lehrer2));
        expect(comments.status).toBe(403);

        const logs = await request(app).get(`/api/tickets/${ticket._id}/logs`).set(auth(tokens.lehrer2));
        expect(logs.status).toBe(403);
    });

    it('still lists bookmarked tickets the user may read', async () => {
        const ticket = await createSickNote({ starredBy: ['schulleiter'] });

        const starred = await request(app).get('/api/tickets?filter=starred').set(auth(tokens.schulleiter));
        expect(listIds(starred)).toContain(ticket._id.toString());
    });
});
