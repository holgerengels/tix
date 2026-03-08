const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');
const { loadBots } = require('../../src/bots');
const Ticket = require('../../src/models/ticket');

// Stateful mock for CalDAV
const mockEvents = {
    'Raum 101': [],
    'Raum 318 (Konferenz)': []
};

jest.mock('../../src/caldav', () => ({
    _mockEvents: mockEvents,
    addEvent: jest.fn().mockImplementation(async (calendarName, ticketId, targetDate, startHHMM, endHHMM, description) => {
        if (!mockEvents[calendarName]) mockEvents[calendarName] = [];
        mockEvents[calendarName].push({ id: ticketId, targetDate, startHHMM, endHHMM });
        return true;
    }),
    deleteEvent: jest.fn().mockImplementation(async (calendarName, ticketId) => {
        if (mockEvents[calendarName]) {
            mockEvents[calendarName] = mockEvents[calendarName].filter(e => e.id !== ticketId);
        }
        return true;
    }),
    deleteEventByTicketId: jest.fn().mockImplementation(async (ticketId) => {
        Object.keys(mockEvents).forEach(cal => {
            mockEvents[cal] = mockEvents[cal].filter(e => e.id !== ticketId);
        });
        return true;
    }),
    getCalendars: jest.fn().mockResolvedValue([
        { name: 'Raum 101', href: '/r101' },
        { name: 'Raum 318 (Konferenz)', href: '/r318' }
    ]),
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
    // clear calendar state
    mockEvents['Raum 101'] = [];
    mockEvents['Raum 318 (Konferenz)'] = [];
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
            t1.id,
            ticketPayload.date,
            '14:00',
            '15:00',
            ticketPayload.description
        );

        // Verify the event is in the simulated calendar server
        expect(caldav._mockEvents['Raum 101'].length).toBe(1);
        expect(caldav._mockEvents['Raum 101'][0].id).toBe(t1.id);
        expect(caldav._mockEvents['Raum 101'][0].startHHMM).toBe('14:00');
        expect(caldav._mockEvents['Raum 101'][0].endHHMM).toBe('15:00');

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
            t1.id,
            ticketPayload.date,
            '15:00',
            '16:00',
            ticketPayload.description
        );

        // Verify that the old event was deleted during verschieben using the new ID-based method
        expect(caldav.deleteEventByTicketId).toHaveBeenCalledTimes(1);
        expect(caldav.deleteEventByTicketId).toHaveBeenCalledWith(t1.id);
        // Normal deleteEvent is not called yet
        expect(caldav.deleteEvent).toHaveBeenCalledTimes(0);

        // TEST SAYS: check kalender-server to see if the ticket is in the correct room-calendar and has the correct time
        expect(caldav._mockEvents['Raum 101'].length).toBe(0); // completely removed from old room
        expect(caldav._mockEvents['Raum 318 (Konferenz)'].length).toBe(1); // placed securely in the new room
        const movedEvent = caldav._mockEvents['Raum 318 (Konferenz)'][0];
        expect(movedEvent.id).toBe(t1.id);
        expect(movedEvent.startHHMM).toBe('15:00');
        expect(movedEvent.endHHMM).toBe('16:00');

        // --- 3. lehrer1 storniert (cancels) the reservation ---
        const resStorno = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });

        expect(resStorno.status).toBe(200);

        // The action sets state to 'offen.storniert'. The bot then runs "stornieren" function.
        // It calls caldav.deleteEvent, and then sets state to 'geschlossen.storniert'.
        expect(resStorno.body.state).toBe('geschlossen.storniert');
        // deleteEvent is called once during stornieren
        expect(caldav.deleteEvent).toHaveBeenCalledTimes(1);
        expect(caldav.deleteEvent).toHaveBeenCalledWith('Raum 318 (Konferenz)', t1.id);

        // Verify it was cleared out of the simulated calendar server entirely
        expect(caldav._mockEvents['Raum 318 (Konferenz)'].length).toBe(0);
    });
});
