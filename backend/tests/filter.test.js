const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');
const Ticket = require('../src/models/ticket');

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

describe('Ticket Filtering via Status', () => {
    beforeEach(async () => {
        // Create test tickets directly in DB to bypass workflow restrictions for testing
        await Ticket.create([
            { id: 'TEST-1', type: 'Hausmeisterauftrag', title: 'Ticket 1', creator: 'lehrer1', state: 'offen.neu' },
            { id: 'TEST-2', type: 'Hausmeisterauftrag', title: 'Ticket 2', creator: 'lehrer1', state: 'offen.inArbeit' },
            { id: 'TEST-3', type: 'IT-Ticket', title: 'Ticket 3', creator: 'lehrer1', state: 'offen.neu' },
            { id: 'TEST-4', type: 'Hausmeisterauftrag', title: 'Ticket 4', creator: 'lehrer1', state: 'geschlossen.ok' }
        ]);
    });

    it('should find all tickets starting with "offen" when no type is selected and status is "offen.*"', async () => {
        const res = await request(app)
            .get('/api/tickets?filter=admin&status=offen.*')
            .set('Authorization', `Bearer ${tokens.admin}`);
        
        expect(res.status).toBe(200);
        const tickets = res.body;
        
        // Should find Ticket 1, Ticket 2, and Ticket 3, but NOT Ticket 4
        expect(tickets.length).toBe(3);
        
        const titles = tickets.map(t => t.title);
        expect(titles).toContain('Ticket 1');
        expect(titles).toContain('Ticket 2');
        expect(titles).toContain('Ticket 3');
        expect(titles).not.toContain('Ticket 4');
    });

    it('should find only specific type tickets starting with "offen" when a type is selected and status is "offen.*"', async () => {
        const res = await request(app)
            .get('/api/tickets?filter=admin&type=Hausmeisterauftrag&status=offen.*')
            .set('Authorization', `Bearer ${tokens.admin}`);
        
        expect(res.status).toBe(200);
        const tickets = res.body;
        
        // Should find Ticket 1 and Ticket 2, but NOT Ticket 3 (wrong type) and NOT Ticket 4 (wrong status)
        expect(tickets.length).toBe(2);
        
        const titles = tickets.map(t => t.title);
        expect(titles).toContain('Ticket 1');
        expect(titles).toContain('Ticket 2');
        expect(titles).not.toContain('Ticket 3');
        expect(titles).not.toContain('Ticket 4');
    });

    it('should find exact match when status does not end with ".*"', async () => {
        const res = await request(app)
            .get('/api/tickets?filter=admin&type=Hausmeisterauftrag&status=offen.neu')
            .set('Authorization', `Bearer ${tokens.admin}`);
        
        expect(res.status).toBe(200);
        const tickets = res.body;
        
        // Should find ONLY Ticket 1 (exact match for "offen.neu")
        expect(tickets.length).toBe(1);
        expect(tickets[0].title).toBe('Ticket 1');
    });
});
