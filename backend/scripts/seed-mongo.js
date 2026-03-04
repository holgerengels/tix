const mongoose = require('mongoose');
const Ticket = require('../src/models/ticket');
const Counter = require('../src/models/counter');

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
    // Abwesenheit
    {
        id: 'ABW-1',
        title: 'Fortbildung Digitalisierung',
        description: 'Teilnahme an der Landesfortbildung.',
        type: 'Abwesenheit',
        state: 'offen.neu',
        creator: 'lehrer1',
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

    // Krankmeldung
    {
        id: 'KRM-1',
        title: 'Krankmeldung Max Mustermann',
        description: 'Starke Erkältung.',
        type: 'Krankmeldung',
        state: 'offen.neu',
        creator: 'lehrer1',
        dateFrom: '2024-06-01',
        badges: ['dringend'],
        created: new Date('2024-06-01T07:00:00'),
        log: [{ editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-06-01T07:00:00') }]
    },
    {
        id: 'KRM-2',
        title: 'Krankmeldung Anna Admin',
        description: 'Grippe.',
        type: 'Krankmeldung',
        state: 'offen.inArbeit',
        creator: 'admin',
        dateFrom: '2024-05-20',
        dateReturn: '2024-05-25',
        badges: [],
        created: new Date('2024-05-20T07:00:00'),
        log: [{ editor: 'admin', text: 'Ticket erstellt', edited: new Date('2024-05-20T07:00:00') }]
    },

    // IT-Ticket
    {
        id: 'ITT-1',
        title: 'WLAN im Lehrerzimmer geht nicht',
        description: 'Ständige Abbrüche.',
        type: 'IT-Ticket',
        state: 'offen.neu',
        creator: 'lehrer2',
        category: 'Netzwerk',
        location: 'Lehrerzimmer',
        badges: ['wichtig'],
        created: new Date('2024-06-02T08:30:00'),
        log: [{ editor: 'lehrer2', text: 'Ticket erstellt', edited: new Date('2024-06-02T08:30:00') }]
    },
    {
        id: 'ITT-2',
        title: 'Drucker druckt streifig',
        description: 'Der Drucker in Raum 202 druckt nur noch mit Streifen.',
        type: 'IT-Ticket',
        state: 'offen.inArbeit',
        creator: 'lehrer1',
        assignee: 'netzwerker',
        category: 'Hardware',
        location: 'Raum 202',
        badges: [],
        created: new Date('2024-06-01T10:00:00'),
        log: [
            { editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-06-01T10:00:00') },
            { editor: 'netzwerker', text: 'In Arbeit', edited: new Date('2024-06-01T10:30:00') }
        ]
    },
    {
        id: 'ITT-3',
        title: 'Beamer Birne kaputt',
        description: 'Beamer geht nicht mehr an.',
        type: 'IT-Ticket',
        state: 'offen.erledigt',
        creator: 'lehrer1',
        assignee: 'netzwerker',
        category: 'Medien',
        location: 'Raum 303',
        badges: [],
        created: new Date('2024-05-28T09:00:00'),
        log: [
            { editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-05-28T09:00:00') },
            { editor: 'netzwerker', text: 'Erledigt', edited: new Date('2024-05-29T11:00:00') }
        ]
    },

    // Hausmeisterauftrag
    {
        id: 'HMA-1',
        title: 'Tischbein defekt',
        description: 'Schülertisch wackelt stark.',
        type: 'Hausmeisterauftrag',
        state: 'offen.neu',
        creator: 'lehrer2',
        location: 'Raum 105',
        badges: [],
        created: new Date('2024-06-02T11:00:00'),
        log: [{ editor: 'lehrer2', text: 'Ticket erstellt', edited: new Date('2024-06-02T11:00:00') }]
    },
    {
        id: 'HMA-2',
        title: 'Fenster klemmt',
        description: 'Lässt sich nicht mehr schließen.',
        type: 'Hausmeisterauftrag',
        state: 'offen.inArbeit',
        creator: 'lehrer1',
        assignee: 'hausmeister',
        location: 'Raum 210',
        badges: ['wichtig'],
        created: new Date('2024-06-01T12:00:00'),
        log: [
            { editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date('2024-06-01T12:00:00') },
            { editor: 'hausmeister', text: 'In Arbeit', edited: new Date('2024-06-01T13:00:00') }
        ]
    }
];

const Log = require('../src/models/log');

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
            { _id: 'ABW', seq: 2 },
            { _id: 'KRM', seq: 2 },
            { _id: 'ITT', seq: 3 },
            { _id: 'HMA', seq: 2 }
        ]);
        console.log('Counters initialized');

    } catch (err) {
        console.error('Error seeding tickets:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedTickets();
