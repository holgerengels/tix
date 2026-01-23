const mongoose = require('mongoose');
const Ticket = require('../models/ticket');

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
    {
        title: 'Beispiel Ticket 1',
        type: 'Abwesenheit',
        state: 'offen.neu',
        creator: 'lehrer1',
        created: new Date(),
        data: {},
        log: [{ editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date() }]
    },
    {
        title: 'Beispiel Ticket 2',
        type: 'Abwesenheit',
        state: 'offen.genehmigt',
        creator: 'lehrer2',
        created: new Date(),
        data: {},
        log: [
            { editor: 'lehrer2', text: 'Ticket erstellt', edited: new Date() },
            { editor: 'schulleiter', text: 'Ticket genehmigt', edited: new Date() }
        ]
    }
];

const seedTickets = async () => {
    await connectDB();

    try {
        // We don't delete everything if the user just wants these added, 
        // but usually seeding implies a fresh start or ensure they exist.
        // Here I'll clear and add to be clean.
        await Ticket.deleteMany({});
        console.log('Old tickets removed');

        await Ticket.insertMany(mockTickets);
        console.log('Mock tickets from routes.js created successfully in MongoDB');
    } catch (err) {
        console.error('Error seeding tickets:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedTickets();
