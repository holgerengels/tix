const { sendTalkMessageToUser } = require('../publisher');

async function test() {
    console.log('Testing formatted message...');
    const message = "Aufgabe: [12345](http://localhost:5173/tickets/12345/view) Test Ticket - wurde von h.engels bearbeitet";
    try {
        await sendTalkMessageToUser('h.engels', message);
        console.log('Test completed.');
    } catch (err) {
        console.error('Test failed:', err);
    }
}

test();
