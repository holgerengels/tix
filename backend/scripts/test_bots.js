console.log("Script starting...");
const connectDB = require('../db');
console.log("DB module loaded");
const Ticket = require('../models/ticket');
console.log("Ticket module loaded");
const { startBots } = require('../bots');
console.log("Bots module loaded");

async function test() {
    console.log('connecting to DB...');
    await connectDB();
    console.log('DB Connected');

    // Create a test ticket
    const ticket = new Ticket({
        type: 'Abwesenheit',
        state: 'offen.neu',
        title: 'Test Dringend',
        creator: 'automated_test'
    });
    await ticket.save();
    console.log('Created test ticket:', ticket.id, ticket._id);

    console.log('Starting bots...');
    startBots();

    console.log('Waiting 5 seconds for bots to run...');
    setTimeout(async () => {
        try {
            console.log('Checking ticket...');
            const updatedTicket = await Ticket.findById(ticket._id);
            console.log('Updated ticket title:', updatedTicket.title);

            if (updatedTicket.title.includes('[URGENT]')) {
                console.log('SUCCESS: Bot updated the ticket.');
            } else {
                console.error('FAILURE: Bot did not update the ticket.');
                console.log('Ticket state:', updatedTicket.state);
                console.log('Ticket type:', updatedTicket.type);
            }
        } catch (error) {
            console.error('Error checking ticket:', error);
        } finally {
            // Cleanup
            await Ticket.deleteOne({ _id: ticket._id });
            console.log('Cleaned up.');
            process.exit(0);
        }
    }, 5000);
}

test();
