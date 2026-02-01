const mongoose = require('mongoose');
const Ticket = require('../models/ticket');
const Counter = require('../models/counter');

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://admin:password@localhost:27017/tickets?authSource=admin');
        console.log('MongoDB connected for seeding');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const mockTickets = [
    // Aufgabe: Standard (Title, Desc, Assignee) + Dynamic (Location)
    {
        id: 'AUF-1',
        title: 'Whiteboard reinigen',
        description: 'Das Whiteboard in Raum 101 ist sehr schmutzig.',
        type: 'Aufgabe',
        state: 'offen.neu',
        creator: 'lehrer1',
        assignee: 'hausmeister', // visible: true for Aufgabe
        location: 'Raum 101',
        badges: ['dringend', 'wichtig'],
        created: new Date('2024-05-20T08:00:00'),
        log: [{ editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-05-20T08:00:00') }]
    },
    {
        id: 'AUF-2',
        title: 'Netzwerkdose defekt',
        description: 'Kein Signal auf Dose 3.',
        type: 'Aufgabe',
        state: 'offen.inArbeit',
        creator: 'lehrer2',
        assignee: 'netzwerker',
        location: 'Raum 202',
        badges: ['eskaliert'],
        created: new Date('2024-05-21T09:30:00'),
        log: [
            { editor: 'lehrer2', text: 'Ticket erstellt', edited: new Date('2024-05-21T09:30:00') },
            { editor: 'netzwerker', text: 'Übernahme', edited: new Date('2024-05-21T10:00:00') }
        ]
    },
    {
        id: 'AUF-3',
        title: 'Stuhl reparieren',
        description: 'Bein wackelt.',
        type: 'Aufgabe',
        state: 'offen.erledigt',
        creator: 'lehrer1',
        assignee: 'hausmeister',
        location: 'Raum 102',
        badges: ['obsolet', 'unwichtig'],
        created: new Date('2024-05-10T11:00:00'),
        log: [
            { editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-05-10T11:00:00') },
            { editor: 'hausmeister', text: 'Erledigt', edited: new Date('2024-05-12T14:00:00') }
        ]
    },

    // Abwesenheit: Standard (Title, Desc) + Dynamic (Dates, Time, Reason) - Assignee hidden/unused
    {
        id: 'ABW-1',
        title: 'Fortbildung Digitalisierung',
        description: 'Teilnahme an der Landesfortbildung.',
        type: 'Abwesenheit',
        state: 'offen.neu',
        creator: 'lehrer1',
        // assignee not set
        dateFrom: '2024-06-10',
        timeFrom: '09:00',
        dateUntil: '2024-06-12',
        timeUntil: '17:00',
        reason: 'Fortbildung',
        badges: ['langfristig'],
        created: new Date('2024-05-25T10:00:00'),
        log: [{ editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-05-25T10:00:00') }]
    },
    {
        id: 'ABW-2',
        title: 'Dienstgeschäft Ministerium',
        description: 'Abordnung.',
        type: 'Abwesenheit',
        state: 'offen.genehmigt',
        creator: 'lehrer2',
        dateFrom: '2024-06-15',
        timeFrom: '08:00',
        dateUntil: '2024-06-15',
        timeUntil: '16:00',
        reason: 'Dienstgeschäft',
        badges: ['wichtig'],
        created: new Date('2024-05-26T08:00:00'),
        log: [
            { editor: 'lehrer2', text: 'Ticket erstellt', edited: new Date('2024-05-26T08:00:00') },
            { editor: 'schulleiter', text: 'Genehmigt', edited: new Date('2024-05-27T09:00:00') }
        ]
    },
    {
        id: 'ABW-3',
        title: 'Fortbildung Sport',
        description: 'Abgelehnt wegen Personalmangel.',
        type: 'Abwesenheit',
        state: 'offen.abgelehnt',
        creator: 'lehrer1',
        dateFrom: '2024-06-20',
        timeFrom: '08:00',
        dateUntil: '2024-06-20',
        timeUntil: '16:00',
        reason: 'Fortbildung',
        badges: ['wartet'],
        created: new Date('2024-05-28T08:00:00'),
        log: [
            { editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-05-28T08:00:00') },
            { editor: 'schulleiter', text: 'Abgelehnt', edited: new Date('2024-05-29T10:00:00') }
        ]
    }
];

const Log = require('../models/log');

const seedTickets = async () => {
    await connectDB();

    try {
        await Ticket.deleteMany({});
        await Counter.deleteMany({});
        await Log.deleteMany({});
        console.log('Old tickets, counters, and logs removed');

        for (const mockTicket of mockTickets) {
            const logs = mockTicket.log || [];
            delete mockTicket.log;

            // Fix dates (simple strings in mock to Date objects if needed, 
            // but schema handles it if passed as Date in array above. 
            // The array above uses new Date(), so it's fine).

            const ticket = new Ticket(mockTicket);
            const savedTicket = await ticket.save();

            for (const logEntry of logs) {
                await new Log({
                    ticket: savedTicket._id,
                    editor: logEntry.editor,
                    action: logEntry.text, // Mapping 'text' to 'action' based on previous schema vs new
                    timestamp: logEntry.edited,
                    dataAfter: savedTicket.toObject() // Snapshot of initial state
                    // dataBefore remains null for creation
                }).save();
            }
        }

        console.log('New mock tickets and logs created successfully');

        // Reset Counters
        await Counter.insertMany([
            { _id: 'AUF', seq: 3 },
            { _id: 'ABW', seq: 3 }
        ]);
        console.log('Counters initialized');

    } catch (err) {
        console.error('Error seeding tickets:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedTickets();
