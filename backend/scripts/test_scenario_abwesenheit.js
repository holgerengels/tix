const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

const users = {
    lehrer1: { username: 'lehrer1', password: 'password' },
    schulleiter: { username: 'schulleiter', password: 'password' },
    stundenplaner: { username: 'stundenplaner', password: 'password' },
};

let tokens = {};

async function login(userKey) {
    try {
        const res = await axios.post(`${API_URL}/login`, users[userKey]);
        tokens[userKey] = res.data.token;
        console.log(`Logged in as ${userKey}`);
    } catch (error) {
        console.error(`Login failed for ${userKey}:`, error.response?.data || error.message);
        process.exit(1);
    }
}

async function createTicket(userKey, data) {
    const token = tokens[userKey];
    try {
        const res = await axios.post(`${API_URL}/tickets`, data, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`Ticket created by ${userKey}: ${res.data.title} (${res.data._id})`);
        return res.data;
    } catch (error) {
        console.error(`Create ticket failed for ${userKey}:`, error.response?.data || error.message);
    }
}

async function getTickets(userKey, filter = 'all') {
    const token = tokens[userKey];
    try {
        const res = await axios.get(`${API_URL}/tickets?filter=${filter}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    } catch (error) {
        console.error(`Get tickets failed for ${userKey}:`, error.response?.data || error.message);
    }
}

async function performAction(userKey, ticketId, actionName, formData = {}, buttonName = null) {
    const token = tokens[userKey];
    const payload = {
        actionName: actionName,
        formData: formData
    };
    if (buttonName) payload.formButtonName = buttonName;

    try {
        const res = await axios.post(`${API_URL}/tickets/${ticketId}/action`, payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log(`Action '${actionName}' performed by ${userKey} on ticket ${ticketId}. New State: ${res.data.state}`);
        return res.data;
    } catch (error) {
        console.error(`Action '${actionName}' failed for ${userKey} on ticket ${ticketId}:`, error.response?.data || error.message);
    }
}

async function runScenario() {
    console.log('--- Starting Scenario ---');

    // 1. Logins
    await login('lehrer1');
    await login('schulleiter');
    await login('stundenplaner');

    // 2. Lehrer1 creates 2 tickets
    const ticket1Data = {
        type: 'Abwesenheit',
        title: 'Fortbildung Berlin',
        description: 'Eine wichtige Fortbildung',
        'Datum-von': '2025-05-20',
        'Zeit-von': '08:00',
        'Datum-bis': '2025-05-21',
        'Zeit-bis': '16:00',
        'Grund': 'Fortbildung'
    };
    const ticket2Data = {
        type: 'Abwesenheit',
        title: 'Arzttermin',
        description: 'Routineuntersuchung',
        'Datum-von': '2025-06-01',
        'Zeit-von': '09:00',
        'Datum-bis': '2025-06-01',
        'Zeit-bis': '11:00',
        'Grund': 'Dienstgeschäft' // Naja, passt nicht ganz, aber ist Auswahloption
    };

    const ticketA = await createTicket('lehrer1', ticket1Data); // Becomes Approved
    const ticketB = await createTicket('lehrer1', ticket2Data); // Becomes Rejected

    if (!ticketA || !ticketB) {
        console.error('Failed to create tickets');
        return;
    }

    // 3. Schulleiter processes tickets
    // Approve Ticket A
    console.log('\n--- Schulleiter Actions ---');
    await performAction('schulleiter', ticketA._id, 'genehmigen');
    // Reject Ticket B
    await performAction('schulleiter', ticketB._id, 'ablehnen');

    // 4. Stundenplaner processes Ticket A
    console.log('\n--- Stundenplaner Actions ---');
    // Verify visibility first
    const spTickets = await getTickets('stundenplaner', 'assigned');
    const foundA = spTickets.find(t => t._id === ticketA._id);
    if (foundA) {
        console.log('Stundenplaner sees Ticket A:', foundA.state);
        // Action: bearbeiten -> form: abwesenheit.bearbeiten -> button: fertig
        await performAction('stundenplaner', ticketA._id, 'bearbeiten', {}, 'fertig');
    } else {
        console.error('Stundenplaner CANNOT see Ticket A!');
    }

    // 5. Lehrer1 finalizes
    console.log('\n--- Lehrer1 Actions ---');
    const l1Tickets = await getTickets('lehrer1', 'my');

    // Check Ticket A (should be offen.bearbeitet)
    const finalA = l1Tickets.find(t => t._id === ticketA._id);
    console.log(`Ticket A state for Lehrer1: ${finalA?.state}`);
    if (finalA && finalA.state === 'offen.bearbeitet') {
        await performAction('lehrer1', finalA._id, 'ok');
    }

    // Check Ticket B (should be offen.abgelehnt)
    const finalB = l1Tickets.find(t => t._id === ticketB._id);
    console.log(`Ticket B state for Lehrer1: ${finalB?.state}`);
    if (finalB && (finalB.state === 'offen.abgelehnt' || finalB.state === 'geschlossen.abgelehnt')) {
        // Note: config says 'offen.abgelehnt' and action 'ok' -> 'geschlossen.ok'
        // Wait, config says: 
        // { state: ["offen.bearbeitet", "offen.abgelehnt"], actions: [{ name: "ok", script: "ticket.state = 'geschlossen.ok'" }] }
        await performAction('lehrer1', finalB._id, 'ok');
    }

    console.log('\n--- Final Check ---');
    const finalCheck = await getTickets('lehrer1', 'my');
    console.log('Final Ticket States:');
    finalCheck.filter(t => t._id === ticketA._id || t._id === ticketB._id).forEach(t => {
        console.log(`${t.title}: ${t.state}`);
    });
}

runScenario();
