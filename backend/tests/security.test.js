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

    it('should enforce security on attachment downloads', async () => {
        // 1. Upload attachment as stundenplaner
        const uploadRes = await request(app)
            .post('/api/attachments')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .set('x-filename', encodeURIComponent('test.txt'))
            .set('x-content-type', 'text/plain')
            .set('content-length', '12')
            .send('test content');

        expect(uploadRes.status).toBe(201);
        const fileId = uploadRes.body.fileId;

        // 2. Unassociated file access checks
        // Uploader can access
        const dlUploaderRes = await request(app)
            .get(`/api/attachments/${fileId}`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`);
        expect(dlUploaderRes.status).toBe(200);
        expect(dlUploaderRes.text).toBe('test content');

        // Other non-admin user cannot access
        const dlOtherRes = await request(app)
            .get(`/api/attachments/${fileId}`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`);
        expect(dlOtherRes.status).toBe(403);

        // 3. Associate attachment with the ticket
        const Ticket = require('../src/models/ticket');
        await Ticket.findByIdAndUpdate(ticketId, {
            $push: { attachments: { fileId, filename: 'test.txt' } }
        });

        // 4. Ticket-associated file access checks
        // User who can read ticket can download attachment
        const dlAuthorizedRes = await request(app)
            .get(`/api/attachments/${fileId}`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`);
        expect(dlAuthorizedRes.status).toBe(200);
        expect(dlAuthorizedRes.text).toBe('test content');

        // User who cannot read ticket cannot download attachment
        const dlUnauthorizedRes = await request(app)
            .get(`/api/attachments/${fileId}`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`);
        expect(dlUnauthorizedRes.status).toBe(403);
    });
});
