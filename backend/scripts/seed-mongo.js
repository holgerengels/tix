const mongoose = require('mongoose');
const Ticket = require('../models/ticket');

const connectDB = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/ticketsystem');
        console.log('MongoDB connected for seeding');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const mockTickets = [
    {
        titel: 'Beispiel Ticket 1',
        typ: 'Abwesenheit',
        status: 'offen.neu',
        ersteller: 'lehrer1',
        erstellt: new Date(),
        daten: {},
        log: [{ bearbeiter: 'lehrer1', text: 'Ticket erstellt', bearbeitet: new Date() }]
    },
    {
        titel: 'Beispiel Ticket 2',
        typ: 'Abwesenheit',
        status: 'offen.genehmigt',
        ersteller: 'lehrer2',
        erstellt: new Date(),
        daten: {},
        log: [
            { bearbeiter: 'lehrer2', text: 'Ticket erstellt', bearbeitet: new Date() },
            { bearbeiter: 'hannes_rometsch', text: 'Ticket genehmigt', bearbeitet: new Date() }
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
