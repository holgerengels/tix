const request = require('supertest');
const app = require('../../src/server'); // This will start connecting to DB asynchronously
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('../setup');

const { getWorkflowForType } = require('../../src/workflow');
const { updateUserSettings } = require('../../src/auth');
const Subscription = require('../../src/models/subscription');
const Log = require('../../src/models/log');
const { format, addDays } = require('date-fns');
const { checkUnpublishedLogs, getTestNotifications, clearTestNotifications } = require('../../src/publisher');
const { runSubscriptionCheck } = require('../../src/subscriptionWorker');
const { loadBots } = require('../../src/bots');

let tokens;

const getActionsForTicket = (ticket, user, filterMode) => {
    const wf = getWorkflowForType(ticket.type);
    if (!wf) return [];
    const matchingBlocks = wf.workflow.filter(s => s.states.includes(ticket.state));
    const allActions = matchingBlocks.flatMap(block => block.actions);

    const authorizedActions = allActions.filter(action => {
        const allowedByCreator = action.groups.includes('@creator') && ticket.creator === user.username;
        const allowedByAssignee = action.groups.includes('@assignee') && ticket.assignee === user.username;
        const allowedByGroup = action.groups.some(g => (user.groups || []).includes(g));
        return allowedByCreator || allowedByAssignee || allowedByGroup;
    });

    if (filterMode === 'assigned') {
        return authorizedActions.filter(a => !a.optional);
    } else if (filterMode === 'my') {
        return authorizedActions.filter(a => a.optional === true);
    }
    return authorizedActions;
};

beforeAll(async () => {
    // Wait for DB connection
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => {
            mongoose.connection.once('connected', resolve);
        });
    }
    await new Promise(resolve => setTimeout(resolve, 500));

    tokens = getTokens();

    // Load bots for tests
    loadBots();

    // Set up test notification channels
    await updateUserSettings('lehrer1', { notificationUri: 'test:lehrer1@local' });
    await updateUserSettings('stundenplaner', { notificationUri: 'test:stundenplaner@local' });
});

beforeEach(async () => {
    await clearDatabase();

    // Set up subscriptions
    await Subscription.create([
        { userId: 'lehrer1', name: 'Meine Tickets', filter: { creator: 'lehrer1' }, lastMatchingTickets: [] },
        { userId: 'stundenplaner', name: 'Mir Zugewiesen', filter: { assignmentType: 'group' }, lastMatchingTickets: [] }
    ]);
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Krankmeldung', () => {

    const ticketPayload = {
        type: 'Krankmeldung',
        title: 'Krank',
        who: 'Ich selbst',
        exam: true,
        description: 'Testticket'
    };

    it('should complete the full lifecycle of a Krankmeldung', async () => {
        // --- 1. lehrer1 creates tickets to test bots ---
        let t1, t2;

        const dateTomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
        const dateLater = format(addDays(new Date(), 30), 'yyyy-MM-dd');

        for (let i = 0; i < 2; i++) {
            const payload = {
                ...ticketPayload,
                dateFrom: i === 0 ? dateTomorrow : dateLater,
                dateUntil: i === 0 ? dateTomorrow : dateLater
            };

            const res = await request(app)
                .post('/api/tickets')
                .set('Authorization', `Bearer ${tokens.lehrer1}`)
                .send(payload);

            expect(res.status).toBe(201);
            if (i === 0) {
                t1 = res.body;
                expect(t1.badges || []).toContain('dringend');
            }
            if (i === 1) {
                t2 = res.body;
                expect(t2.badges || []).not.toContain('dringend');
            }
        }

        // Verify Publisher Logs for Creation
        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        let notifs = getTestNotifications();
        expect(notifs.filter(n => n.targetUser === 'lehrer1').length).toBe(0);
        clearTestNotifications();

        // Verify Subscriptions
        await runSubscriptionCheck();
        notifs = getTestNotifications();
        // lehrer1 sees 2 tickets in Meine Tickets
        expect(notifs.some(n => n.targetUser === 'lehrer1' && n.message.includes('Meine Tickets'))).toBe(true);
        // stundenplaner sees 2 tickets in Mir Zugewiesen because states is offen.neu and action bearbeiten allows group Stundenplanung
        expect(notifs.some(n => n.targetUser === 'stundenplaner' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        clearTestNotifications();

        // --- 2. stundenplaner processes t1 ---
        // Verify what actions stundenplaner has via list logic
        const stundenplanerUser = { username: 'stundenplaner', groups: ['Stundenplanung'] };
        const stundenplanerActions = getActionsForTicket(t1, stundenplanerUser, 'assigned');
        expect(stundenplanerActions.map(a => a.name)).toContain('bearbeiten');

        const resDone = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {
                    badges: []
                }
            });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('geschlossen.erledigt');

        // Publisher check
        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        notifs = getTestNotifications();
        // "bearbeiten" action logged -> notifies creator lehrer1
        expect(notifs.filter(n => n.targetUser === 'lehrer1').length).toBe(1);
        clearTestNotifications();

        // Subscription check updates
        await runSubscriptionCheck();
        notifs = getTestNotifications();
        // stundenplaner no longer sees t1 (because erledigt action has no stundenplaner group assigned for next steps) -> actually wait, `offen.erledigt` has action `ok` for `@creator`. So `stundenplaner` will see -1 ticket -> notification.
        expect(notifs.some(n => n.targetUser === 'stundenplaner' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        clearTestNotifications();



        // --- 4. lehrer1 cancels t2 via "stornieren" ---
        const resCancel = await request(app)
            .post(`/api/tickets/${t2._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });

        expect(resCancel.status).toBe(200);
        expect(resCancel.body.state).toBe('geschlossen.storniert');
    });

    it('should correctly restrict access to actions according to workflow groups', async () => {
        // Create ticket as lehrer1
        const dateTomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
        const res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                ...ticketPayload,
                dateFrom: dateTomorrow,
                dateUntil: dateTomorrow
            });

        expect(res.status).toBe(201);
        const ticket = res.body;

        // Try to bearbeiten as lehrer1 (unauthorized)
        const failEdit = await request(app)
            .post(`/api/tickets/${ticket._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {}
            });

        expect(failEdit.status).toBe(403);

        // stundenplaner should be able to bearbeiten
        const successEdit = await request(app)
            .post(`/api/tickets/${ticket._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'erledigt',
                formData: {}
            });

        expect(successEdit.status).toBe(200);
    });
});
