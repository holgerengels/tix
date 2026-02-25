const connectDB = require('./db');
const Ticket = require('./models/ticket');
const { startBots } = require('./bots');

async function test() {
    console.log('connecting to DB...');
    await connectDB();
    console.log('DB Connected');

    const ticket = new Ticket({
        type: 'Abwesenheitsantrag',
        state: 'offen.neu',
        title: 'Test Dringend VM',
        creator: 'automated_test',
        // Make it urgent (today)
        dateFrom: new Date().toISOString()
    });

    // Ensure badges is empty
    ticket.set('badges', []);

    await ticket.save();
    console.log('Created test ticket:', ticket.id, ticket._id);

    console.log('Starting bots...');
    startBots();

    console.log('Waiting 5 seconds for bots to run...');
    setTimeout(async () => {
        try {
            console.log('Checking ticket...');
            const updatedTicket = await Ticket.findById(ticket._id);
            console.log('Updated ticket badges:', updatedTicket.badges);

            if (updatedTicket.badges && updatedTicket.badges.includes('dringend')) {
                console.log('SUCCESS: Bot updated the ticket with "dringend" badge.');
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
