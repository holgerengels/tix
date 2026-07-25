const request = require('supertest');
const app = require('../../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');
const { loadBots } = require('../../src/bots');
const Ticket = require('../../src/models/ticket');

// Stateful mock for CalDAV
const mockEvents = {
    'Raum 318 (Konferenz)': [],
    'personal': []
};

jest.mock('../../src/caldav', () => ({
    _mockEvents: mockEvents,
    addEvent: jest.fn().mockImplementation(async (calendarName, ticketId, targetDate, startHHMM, endHHMM, description, attendees = [], ownerEmail = null) => {
        const cal = calendarName || 'personal';
        if (!mockEvents[cal]) mockEvents[cal] = [];
        mockEvents[cal].push({ id: ticketId, targetDate, startHHMM, endHHMM, attendees, ownerEmail });
        return true;
    }),
    deleteEvent: jest.fn().mockImplementation(async (calendarName, ticketId, ownerEmail = null) => {
        const cal = calendarName || 'personal';
        if (mockEvents[cal]) {
            mockEvents[cal] = mockEvents[cal].filter(e => e.id !== ticketId);
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
        { name: 'Raum 318 (Konferenz)', href: '/r318' },
        { name: 'personal', href: '/personal' }
    ]),
    getAllAvailability: jest.fn().mockResolvedValue({}),
    getEventAttendees: jest.fn().mockImplementation(async (calendarName, ticketId, ownerEmail = null) => {
        const cal = calendarName || 'personal';
        const event = (mockEvents[cal] || []).find(e => e.id === ticketId);
        return event ? event.attendees || [] : [];
    })
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
    mockEvents['Raum 318 (Konferenz)'] = [];
    mockEvents['personal'] = [];
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Konferenz', () => {

    it('should create a Konferenz without automatic sub-tickets', async () => {
        // Create a Konferenz ticket (room/catering fields have been removed)
        const ticketPayload = {
            type: 'Konferenz',
            title: 'Gesamtkonferenz Q3',
            date: new Date().toISOString().split('T')[0],
            timeStart: '14:00',
            timeEnd: '16:00',
            participants: [
                { name: 'lehrer1', status: 'eingeladen' },
                { name: 'lehrer2', status: 'eingeladen' }
            ]
        };

        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const knf = res.body;

        // The "eintragen" bot runs and sets state to offen.eingetragen
        expect(knf.state).toBe('offen.eingetragen');

        // Wait for async bot processing
        await new Promise(resolve => setTimeout(resolve, 500));

        // No sub-tickets should be created automatically
        const subTickets = await Ticket.find({ parentTicket: knf.id });
        expect(subTickets.length).toBe(0);

        // CalDAV should only have been called for personal calendar
        expect(caldav.addEvent).toHaveBeenCalledTimes(1);
        expect(caldav.addEvent).toHaveBeenCalledWith(
            'personal',
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(String),
            expect.any(Array),
            expect.any(String)
        );
    });

    it('should handle mixed participants: internal user, external email, attendance-only', async () => {
        const ticketPayload = {
            type: 'Konferenz',
            title: 'Gemischte Teilnehmer',
            date: new Date().toISOString().split('T')[0],
            timeStart: '14:00',
            timeEnd: '16:00',
            participants: [
                { name: 'lehrer1', email: 'lehrer1@valckenburgschule.de', status: 'eingeladen' },
                { email: 'gast@extern.de', status: 'eingeladen' },
                { name: 'Herr Müller', status: 'eingeladen' }
            ]
        };

        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        expect(res.body.state).toBe('offen.eingetragen');

        // CalDAV should be called with attendees from participants with email
        // lehrer1 has direct email, gast has direct email, Herr Müller has no email (skipped)
        const attendeesArg = caldav.addEvent.mock.calls[0][6];
        expect(attendeesArg).toBeDefined();
        expect(attendeesArg.length).toBe(2);
        expect(attendeesArg.find(a => a.email === 'lehrer1@valckenburgschule.de')).toBeTruthy();
        expect(attendeesArg.find(a => a.email === 'gast@extern.de')).toBeTruthy();
    });

    it('should cascade stornierung to sub-tickets', async () => {
        // Create Konferenz
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({
                type: 'Konferenz',
                title: 'Storno-Test',
                date: new Date().toISOString().split('T')[0],
                timeStart: '09:00',
                timeEnd: '10:00',
                participants: [{ name: 'lehrer1', status: 'eingeladen' }]
            });

        expect(res.status).toBe(201);
        const knf = res.body;

        await new Promise(resolve => setTimeout(resolve, 500));

        // Manually create a Raumreservierung sub-ticket
        const subRes = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({
                type: 'Raumreservierung',
                title: 'Storno-Test Raum',
                date: knf.date || new Date().toISOString().split('T')[0],
                termin: { room: 'Raum 318 (Konferenz)', start: '09:00', end: '10:00' },
                parentTicket: knf.id
            });

        expect(subRes.status).toBe(201);

        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify sub-ticket exists and is eingetragen
        const subsBefore = await Ticket.find({ parentTicket: knf.id });
        expect(subsBefore.length).toBe(1);
        expect(subsBefore[0].state).toBe('offen.eingetragen');

        // --- Stornieren ---
        const stornoRes = await request(app)
            .post(`/api/tickets/${knf._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({ actionName: 'stornieren' });

        expect(stornoRes.status).toBe(200);
        expect(stornoRes.body.state).toBe('geschlossen.storniert');

        // Wait for cascading bots
        await new Promise(resolve => setTimeout(resolve, 500));

        // Sub-ticket should also be cancelled
        const subsAfter = await Ticket.find({ parentTicket: knf.id });
        expect(subsAfter[0].state).toBe('geschlossen.storniert');

        // CalDAV event should have been deleted
        expect(caldav.deleteEvent).toHaveBeenCalled();
    });

    it('should allow protokollieren action with attendance data', async () => {
        // Create simple Konferenz
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({
                type: 'Konferenz',
                title: 'Protokoll-Test',
                date: new Date().toISOString().split('T')[0],
                timeStart: '14:00',
                timeEnd: '15:00',
                participants: [
                    { name: 'lehrer1', status: 'eingeladen' },
                    { name: 'lehrer2', status: 'eingeladen' }
                ]
            });

        expect(res.status).toBe(201);
        const knf = res.body;
        expect(knf.state).toBe('offen.eingetragen');

        // --- Protokollieren ---
        const protoRes = await request(app)
            .post(`/api/tickets/${knf._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({
                actionName: 'protokollieren',
                formButtonName: 'Konferenz abschließen',
                formData: {
                    participants: [
                        { name: 'lehrer1', status: 'anwesend' },
                        { name: 'lehrer2', status: 'entschuldigt' }
                    ],
                    protocol: '<p>Tagesordnung besprochen. Nächste Sitzung am Montag.</p>'
                }
            });

        expect(protoRes.status).toBe(200);
        expect(protoRes.body.state).toBe('geschlossen.ok');

        // Verify attendance data was saved
        const updated = await Ticket.findById(knf._id);
        expect(updated.get('participants')).toEqual([
            { name: 'lehrer1', status: 'anwesend' },
            { name: 'lehrer2', status: 'entschuldigt' }
        ]);
        expect(updated.get('protocol')).toContain('Tagesordnung besprochen');
    });

    it('should reject creation of a Konferenz by a non-Schulleitung user', async () => {
        const ticketPayload = {
            type: 'Konferenz',
            title: 'Unauthorized Test',
            date: new Date().toISOString().split('T')[0],
            timeStart: '15:00',
            timeEnd: '15:00',
            participants: [{ name: 'lehrer1', status: 'eingeladen' }]
        };

        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(403);
    });

    it('should query participant responses from CalDAV and update ticket', async () => {
        // Create mock users in DB with employeeId so they can be resolved
        const User = require('../../src/models/user');
        await User.findOneAndUpdate({ username: 'lehrer1' }, { username: 'lehrer1', displayName: 'Max Mustermann', employeeId: 'm.mustermann' }, { upsert: true });
        await User.findOneAndUpdate({ username: 'lehrer2' }, { username: 'lehrer2', displayName: 'Sabine Keller', employeeId: 's.keller' }, { upsert: true });
        await User.findOneAndUpdate({ username: 'schulleiter' }, { username: 'schulleiter', displayName: 'Thomas Braun', employeeId: 't.braun' }, { upsert: true });

        // --- 1. Create Konferenz ticket ---
        const ticketPayload = {
            type: 'Konferenz',
            title: 'Responsetest Konferenz',
            date: new Date().toISOString().split('T')[0],
            timeStart: '14:00',
            timeEnd: '16:00',
            participants: [
                { name: 'lehrer1', status: 'eingeladen' },
                { name: 'lehrer2', status: 'eingeladen' }
            ]
        };

        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const knf = res.body;

        // Wait for async bot to create the personal calendar event
        await new Promise(resolve => setTimeout(resolve, 500));

        // --- 2. Simulate responses in mock CalDAV event on creator's personal calendar ---
        const event = mockEvents['personal'].find(e => e.id === knf.id);
        expect(event).toBeTruthy();
        // Since mock users have employeeId, the emails will use employeeId
        event.attendees = [
            { email: 'm.mustermann@valckenburgschule.de', cn: 'Max Mustermann', partstat: 'ACCEPTED' },
            { email: 's.keller@valckenburgschule.de', cn: 'Sabine Keller', partstat: 'DECLINED' }
        ];

        // --- 3. Trigger checkResponses bot ---
        const parentTicket = await Ticket.findById(knf._id);
        const { runBotsForTicket } = require('../../src/bots');
        await runBotsForTicket(parentTicket);

        // Wait for async bot processing
        await new Promise(resolve => setTimeout(resolve, 500));

        // --- 4. Verify participant status was updated ---
        const updated = await Ticket.findById(knf._id);
        const participants = updated.get('participants');
        
        const p1 = participants.find(p => p.name === 'lehrer1');
        const p2 = participants.find(p => p.name === 'lehrer2');

        expect(p1.status).toBe('anwesend');
        expect(p2.status).toBe('entschuldigt');
    });
});
