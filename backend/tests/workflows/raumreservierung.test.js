const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');
const { loadBots } = require('../../src/bots');

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

        // --- 2. lehrer1 storniert (cancels) the reservation ---
        const resStorno = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });

        expect(resStorno.status).toBe(200);

        // The action sets state to 'offen.storniert'. The bot then runs "stornieren" function.
        // It calls caldav.deleteEvent, and then sets state to 'geschlossen.storniert'.
        expect(resStorno.body.state).toBe('geschlossen.storniert');
        expect(caldav.deleteEvent).toHaveBeenCalledTimes(1);
        expect(caldav.deleteEvent).toHaveBeenCalledWith('Raum 101', t1._id.toString());
    });
});
