const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');
const Ticket = require('../src/models/ticket');
const Subscription = require('../src/models/subscription');
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

describe('API Routes', () => {

    describe('User Routes', () => {
        it('should get all users', async () => {
            const res = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        it('should get specific user by username', async () => {
            const res = await request(app)
                .get('/api/users/lehrer1')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            expect(res.body.username).toBe('lehrer1');
        });
    });

    describe('Config Routes', () => {
        it('should get config/workflows', async () => {
            const res = await request(app)
                .get('/api/config')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            expect(typeof res.body).toBe('object');
        });

        it('should get config status', async () => {
            const res = await request(app)
                .get('/api/config/status')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('devmode');
        });

        it('should get user settings', async () => {
            const res = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            expect(res.body).toBeInstanceOf(Object);
        });

        it('should update user settings', async () => {
            const res = await request(app)
                .post('/api/settings')
                .set('Authorization', `Bearer ${tokens.admin}`)
                .send({ dummySetting: true });
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Settings saved');
        });

        it('should get config doc for a type', async () => {
            const res = await request(app)
                .get('/api/config/Krankmeldung/doc')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
        });
    });

    describe('Tickets Routes', () => {
        let ticketId;

        beforeEach(async () => {
            // Create a test ticket
            const t = await request(app)
                .post('/api/tickets')
                .set('Authorization', `Bearer ${tokens.lehrer1}`)
                .send({
                    type: 'IT-Ticket',
                    title: 'Test',
                    description: 'Test',
                    category: 'Hardware',
                    location: 'Raum 100 (Textilarbeit / Werken)',
                    device: 'PC'
                });
            if (t.status !== 201) {
                console.error('Failed to create ticket', t.status, t.body);
            }
            expect(t.status).toBe(201);
            if (t.body && t.body._id) {
                ticketId = t.body._id;
            }
        });

        it('should list tickets with various filters', async () => {
            const res = await request(app)
                .get('/api/tickets?type=IT-Ticket')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            const tickets = res.body.tickets || res.body; 
            expect(Array.isArray(tickets)).toBe(true);
        });

        it('should compute summary from template on creation', async () => {
            const ticket = await Ticket.findById(ticketId);
            // IT-Ticket template: "{{location}} {{ticket.category}}"
            // location: 'Raum 100 (Textilarbeit / Werken)', category: 'Hardware'
            expect(ticket.summary).toBe('Raum 100 (Textilarbeit / Werken) Hardware');
        });

        it('should add comment to ticket', async () => {
            const res = await request(app)
                .post(`/api/tickets/${ticketId}/comments`)
                .set('Authorization', `Bearer ${tokens.lehrer1}`)
                .send({ text: 'A test comment' });
            expect(res.status).toBe(201);
            expect(res.body.text).toBe('A test comment');
        });

        it('should get ticket comments', async () => {
            const res = await request(app)
                .get(`/api/tickets/${ticketId}/comments`)
                .set('Authorization', `Bearer ${tokens.lehrer1}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('Subscriptions and Notifications', () => {
        it('should manage subscriptions', async () => {
            // Get empty subscriptions
            let res = await request(app)
                .get(`/api/settings/subscriptions`)
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);

            // Create a subscription
            res = await request(app)
                .post(`/api/settings/subscriptions`)
                .set('Authorization', `Bearer ${tokens.admin}`)
                .send({
                    name: 'Test Sub',
                    filter: { type: 'IT-Ticket' }
                });
            expect(res.status).toBe(201);
            const subId = res.body._id;

            // Delete subscription
            res = await request(app)
                .delete(`/api/settings/subscriptions/${subId}`)
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
        });

        it('should list user logs', async () => {
            // Make a log for admin
            const testTicket = await Ticket.create({ type: 'IT-Ticket', title: 'temp', creator: 'admin' });
            
            await Log.create({
                targetUser: 'admin',
                editor: 'lehrer1',
                ticket: testTicket._id,
                action: 'created',
                changes: [],
                timestamp: new Date()
            });

            // Get logs
            let res = await request(app)
                .get('/api/logs')
                .set('Authorization', `Bearer ${tokens.admin}`);
            expect(res.status).toBe(200);
            const logs = res.body.logs || res.body; 
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
        });
    });
});
