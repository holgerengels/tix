

const request = require('supertest');
const app = require('../../src/server'); // This will start connecting to DB asynchronously
const mongoose = require('mongoose');

const { getTokens, clearDatabase, closeDatabase } = require('../setup');

const ki = require('../../src/ki');
const { getWorkflowForType } = require('../../src/workflow');
const { updateUserSettings } = require('../../src/auth');
const Subscription = require('../../src/models/subscription');
const Log = require('../../src/models/log');
const { checkUnpublishedLogs, getTestNotifications, clearTestNotifications } = require('../../src/publisher');
const { runSubscriptionCheck } = require('../../src/subscriptionWorker');
const { loadBots } = require('../../src/bots');

let tokens;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    // Dynamically spy on askKI
    jest.spyOn(ki, 'askKI').mockImplementation(async (prompt) => {
        console.log("KI SPY CALLED:", prompt);
        if (prompt.includes('extrem frustriert')) return 'ESKALIERT';
        if (prompt.includes('Raum oder Ort')) return 'Raum 101';
        return 'OK';
    });

    tokens = getTokens();
    loadBots();

    await updateUserSettings('lehrer1', { notificationUri: 'test:lehrer1@local' });
    await updateUserSettings('netzwerker', { notificationUri: 'test:netzwerker@local' });
});

beforeEach(async () => {
    await clearDatabase();

    // Set up subscriptions
    await Subscription.create([
        { userId: 'lehrer1', name: 'Meine Tickets', filter: { creator: 'lehrer1' }, lastMatchingTickets: [] },
        { userId: 'netzwerker', name: 'Mir Zugewiesen', filter: { assignmentType: 'group' }, lastMatchingTickets: [] },
        { userId: 'netzwerker', name: 'Persönlich', filter: { assignmentType: 'personal' }, lastMatchingTickets: [] }
    ]);
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: IT-Ticket', () => {

    const ticketPayload = {
        type: 'IT-Ticket',
        title: 'Beamer defekt',
        category: 'Medien',
        location: 'Raum 101 (Textilarbeit / Werken)',
        description: 'Zum x-ten mal defekt! Ich bin extrem frustriert und wütend über diese kaputte Technik!!!'
    };

    it('should complete the full lifecycle of an IT-Ticket', async () => {
        // --- 1. lehrer1 creates tickets to test bots ---
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        expect(res.status).toBe(201);
        const t1 = res.body;
        // Bot 'dringend' is always added for offen.neu in IT (synchronous)
        expect(t1.badges || []).toContain('dringend');

        // --- Wait for background async bots to finish modifying the ticket ---
        // Generous wait for KI and WebUntis API calls
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const Ticket = mongoose.model('Ticket');
        const updatedTicket = await Ticket.findById(t1._id);
        
        // Verify sentiment_analyse worked
        expect(updatedTicket.badges || []).toContain('eskaliert');


        // Verify sub check
        await runSubscriptionCheck();
        let notifs = getTestNotifications();
        expect(notifs.some(n => n.targetUser === 'lehrer1' && n.message.includes('Meine Tickets'))).toBe(true);
        clearTestNotifications();

        // 2. We need to assign to a specific user to test personal assignment
        // Assign to 'netzwerker'
        const assignReq = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`) // let netzwerker take it
            .send({
                actionName: 'bearbeiten',
                formData: { assignee: 'netzwerker' }
            });

        expect(assignReq.status).toBe(200);

        // Sub check to see if "Persönlich" triggered
        await runSubscriptionCheck();
        notifs = getTestNotifications();
        expect(notifs.some(n => n.targetUser === 'netzwerker' && n.message.includes('Persönlich'))).toBe(true);
        clearTestNotifications();

        // 3. Netzwerker processes the ticket
        // Note: For bearbeiten, groups are: ["@assignee", "Schulleitung", "Netzwerkteam"]
        const resDone = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.netzwerker}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {
                    badges: []
                }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('offen.erledigt');

        // 4. Lehrer1 acknowledges
        const resOk = await request(app)
            .post(`/api/tickets/${resDone.body._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'ok' });

        expect(resOk.status).toBe(200);
        expect(resOk.body.state).toBe('geschlossen.ok');
    });
});
