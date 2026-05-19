const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');

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

describe('Security and Authorization', () => {
    let ticketId;

    beforeEach(async () => {
        // Create a Stundenplan-Ticket as stundenplaner
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                type: 'Stundenplan-Ticket',
                title: 'Security Test Ticket',
                description: 'Testticket',
                day: 'Montag',
                dateFrom: '2025-01-01',
                lessons: { min: 1, max: 2 }
            });
        
        expect(res.status).toBe(201);
        ticketId = res.body._id;
    });

    it('should prevent reading and writing tickets for unauthorized users', async () => {
        // First verify that authorized user (stundenplaner) CAN read the ticket in the list.
        const readAuthorizedRes = await request(app)
            .get(`/api/tickets`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`);
        expect(readAuthorizedRes.status).toBe(200);
        const authorizedTickets = readAuthorizedRes.body.tickets || readAuthorizedRes.body;
        expect(authorizedTickets.some(t => t._id === ticketId)).toBe(true);

        // A Stundenplan-Ticket created by stundenplaner shouldn't be accessible by hausmeister
        // Test reading the ticket in the list
        const readRes = await request(app)
            .get(`/api/tickets`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`);
        
        expect(readRes.status).toBe(200);
        const unauthorizedTickets = readRes.body.tickets || readRes.body;
        expect(unauthorizedTickets.some(t => t._id === ticketId)).toBe(false);

        // Test writing a comment to the ticket
        const writeRes = await request(app)
            .post(`/api/tickets/${ticketId}/comments`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({ text: 'Unauthorized comment' });
            
        expect(writeRes.status).toBe(403);
    });

    it('should prevent performing unauthorized actions on tickets', async () => {
        // To process (bearbeiten) a Stundenplan-Ticket, the user must be in Stundenplanung
        // hausmeister shouldn't be able to process it
        const actionRes = await request(app)
            .post(`/api/tickets/${ticketId}/action`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`)
            .send({
                actionName: 'bearbeiten',
                formData: { assignee: 'stundenplaner' }
            });
            
        expect(actionRes.status).toBe(403);

        // verify that stundenplaner can process it
        const actionAuthorizedRes = await request(app)
            .post(`/api/tickets/${ticketId}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formData: { assignee: 'stundenplaner' }
            });
            
        expect(actionAuthorizedRes.status).toBe(200);
    });
});
