const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');
const { loadBots } = require('../../src/bots');
const Ticket = require('../../src/models/ticket');

// Mock CalDAV module to avoid real network traffic during tests
jest.mock('../../src/caldav', () => ({
    addEvent: jest.fn().mockResolvedValue(true),
    deleteEvent: jest.fn().mockResolvedValue(true),
    getCalendars: jest.fn().mockResolvedValue([{ name: 'Raum 101', href: '/r101' }]),
    getAllAvailability: jest.fn().mockResolvedValue({})
}));

const caldav = require('../../src/caldav');

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
    jest.clearAllMocks();
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Raumreservierung', () => {

    it('should complete the full lifecycle of a Raumreservierung including calendar sync', async () => {
        // --- 1. lehrer1 creates Raumreservierung ticket ---
        const ticketPayload = {
            type: 'Raumreservierung',
            title: 'Klassenausflug Planung',
            description: 'Besprechung im kleinen Kreis',
            date: new Date().toISOString().split('T')[0], // Today
            termin: {
                room: 'Raum 101',
                start: '14:00',
                end: '15:00'
            }
        };

        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;

        // The "eintragen" bot runs immediately on 'offen.neu', calling caldav.addEvent, then sets to 'offen.eingetragen'.
        expect(t1.state).toBe('offen.eingetragen');
        expect(caldav.addEvent).toHaveBeenCalledTimes(1);
        expect(caldav.addEvent).toHaveBeenCalledWith(
            'Raum 101',
            t1._id.toString(),
            ticketPayload.date,
            '14:00',
            '15:00',
            ticketPayload.description
        );

        // --- 2. lehrer1 verschiebt (reschedules) the reservation ---
        const resVerschieben = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                actionName: 'verschieben',
                formButtonName: 'verschieben',
                formData: {
                    'termin.room': 'Raum 318 (Konferenz)',
                    'termin.start': '15:00',
                    'termin.end': '16:00'
                }
            });

        expect(resVerschieben.status).toBe(200);

        // The action sets state to 'offen.verschoben', which triggers the 'verschieben' bot.
        // The bot then calls caldav.addEvent again with the new details and sets state to 'offen.eingetragen'.
        // Wait briefly for the async bot to process 'offen.verschoben'
        await new Promise(resolve => setTimeout(resolve, 300));

        // Fetch the updated ticket from the database since the bot updates it in the background
        const updatedT1 = await Ticket.findById(t1._id);

        expect(updatedT1.state).toBe('offen.eingetragen');
        expect(caldav.addEvent).toHaveBeenCalledTimes(2);
        expect(caldav.addEvent).toHaveBeenCalledWith(
            'Raum 318 (Konferenz)',
            t1._id.toString(),
            ticketPayload.date,
            '15:00',
            '16:00',
            ticketPayload.description
        );

        // Verify that the old event was deleted during verschieben
        expect(caldav.deleteEvent).toHaveBeenCalledTimes(1);
        expect(caldav.deleteEvent).toHaveBeenCalledWith('Raum 101', t1._id.toString());

        // --- 3. lehrer1 storniert (cancels) the reservation ---
        const resStorno = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });

        expect(resStorno.status).toBe(200);

        // The action sets state to 'offen.storniert'. The bot then runs "stornieren" function.
        // It calls caldav.deleteEvent, and then sets state to 'geschlossen.storniert'.
        expect(resStorno.body.state).toBe('geschlossen.storniert');
        // deleteEvent was called once during verschieben and once during stornieren
        expect(caldav.deleteEvent).toHaveBeenCalledTimes(2);
        expect(caldav.deleteEvent).toHaveBeenCalledWith('Raum 318 (Konferenz)', t1._id.toString());
    });
});
