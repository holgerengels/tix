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
    // Additional wait just in case
    await new Promise(resolve => setTimeout(resolve, 500));

    tokens = getTokens();

    // Load bots for tests
    loadBots();

    // Set up test notification channels
    await updateUserSettings('lehrer1', { notificationUri: 'test:lehrer1@local' });
    await updateUserSettings('schulleiter', { notificationUri: 'test:schulleiter@local' });
    await updateUserSettings('stundenplaner', { notificationUri: 'test:stundenplaner@local' });
});

beforeEach(async () => {
    await clearDatabase();

    // Set up subscriptions (must be here so clearDatabase doesn't wipe them)
    await Subscription.create([
        { userId: 'lehrer1', name: 'Meine Tickets', filter: { creator: 'lehrer1' }, lastMatchingTickets: [] },
        { userId: 'stundenplaner', name: 'Persönlich Zugewiesene', filter: { assignmentType: 'personal' }, lastMatchingTickets: [] },
        { userId: 'schulleiter', name: 'Mir Zugewiesen', filter: { assignmentType: 'group' }, lastMatchingTickets: [] },
        { userId: 'stundenplaner', name: 'Mir Zugewiesen', filter: { assignmentType: 'group' }, lastMatchingTickets: [] }
    ]);
});

afterAll(async () => {
    await closeDatabase();
});

describe('Workflow: Abwesenheit', () => {

    const ticketPayload = {
        type: 'Abwesenheitsantrag',
        title: 'Konferenz',
        dateFrom: '2030-01-01',
        lessonFrom: '1',
        dateUntil: '2030-01-01',
        lessonUntil: '6',
        reason: 'Dienstgeschäft',
        description: 'Testticket'
    };

    it('should complete the full lifecycle of an Abwesenheitsantrag', async () => {
        // --- 1. lehrer1 creates 3 tickets ---
        let t1, t2, t3;

        const dateTomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
        const dateLater = format(addDays(new Date(), 30), 'yyyy-MM-dd');

        for (let i = 0; i < 3; i++) {
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
            if (i === 2) t3 = res.body;
        }

        // Verify Publisher Logs for Creation
        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        let notifs = getTestNotifications();
        // The publisher currently notifies the creator
        expect(notifs.filter(n => n.targetUser === 'lehrer1').length).toBe(0);
        clearTestNotifications();

        // Verify Subscriptions
        await runSubscriptionCheck();
        notifs = getTestNotifications();
        // lehrer1 sees 3 tickets in Meine Tickets -> 1 notification
        expect(notifs.some(n => n.targetUser === 'lehrer1' && n.message.includes('Meine Tickets'))).toBe(true);
        // schulleiter sees 3 tickets in Mir Zugewiesen -> 1 notification
        expect(notifs.some(n => n.targetUser === 'schulleiter' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        // stundenplaner sees nothing because they are offen.neu and only schulleiter handles them
        expect(notifs.some(n => n.targetUser === 'stundenplaner')).toBe(false);
        clearTestNotifications();

        // Verify "Meine Tickets" for lehrer1
        let resMy = await request(app)
            .get('/api/tickets?filter=my')
            .set('Authorization', `Bearer ${tokens.lehrer1}`);

        expect(resMy.status).toBe(200);
        expect(resMy.body.length).toBe(3);

        // Ensure "stornieren" is available as an optional action for the creator
        const myT1 = resMy.body.find(t => t.id === t1.id);
        expect(myT1.state).toBe('offen.neu');
        const myT1Actions = getActionsForTicket(myT1, { username: 'lehrer1', groups: ['Lehrkräfte'] }, 'my');
        const stornierenAction = myT1Actions.find(a => a.name === 'stornieren');
        expect(stornierenAction).toBeDefined();
        expect(stornierenAction.optional).toBe(true);
        expect(myT1Actions.length).toBe(1); // Only stornieren at this state for creator

        // Verify "Mir Zugewiesen" for schulleiter (should see them as offen.neu)
        let resAssignedSL = await request(app)
            .get('/api/tickets?filter=assigned')
            .set('Authorization', `Bearer ${tokens.schulleiter}`);

        expect(resAssignedSL.status).toBe(200);
        expect(resAssignedSL.body.length).toBe(3);

        // Schulleitung should see "genehmigen" and "ablehnen"
        const assignedT1_SL = resAssignedSL.body.find(t => t.id === t1.id);
        const slActions = getActionsForTicket(assignedT1_SL, { username: 'schulleiter', groups: ['Schulleitung', 'Lehrkräfte'] }, 'assigned');
        expect(slActions.map(a => a.name).sort()).toEqual(['ablehnen', 'genehmigen']);

        // --- 2. lehrer1 cancels t3 ---
        const resCancel = await request(app)
            .post(`/api/tickets/${t3._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'stornieren' });

        expect(resCancel.status).toBe(200);
        expect(resCancel.body.state).toBe('geschlossen.storniert');

        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        notifs = getTestNotifications();
        // Self-notifications are skipped, so lehrer1 should not be notified of their own cancellation.
        expect(notifs.filter(n => n.targetUser === 'lehrer1').length).toBe(0); 
        clearTestNotifications();

        await runSubscriptionCheck();
        notifs = getTestNotifications();
        // schulleiter loses t3 from Mir Zugewiesen
        expect(notifs.some(n => n.targetUser === 'schulleiter' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        clearTestNotifications();

        // Verify t3 is no longer in Schulleiter's assigned list
        resAssignedSL = await request(app)
            .get('/api/tickets?filter=assigned')
            .set('Authorization', `Bearer ${tokens.schulleiter}`);
        expect(resAssignedSL.body.find(t => t.id === t3.id)).toBeUndefined();


        // --- 3. schulleiter approves t1, rejects t2 ---
        const resApprove = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({ actionName: 'genehmigen' });

        expect(resApprove.status).toBe(200);
        expect(resApprove.body.state).toBe('offen.genehmigt');

        const resReject = await request(app)
            .post(`/api/tickets/${t2._id}/action`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`)
            .send({ actionName: 'ablehnen', comment: 'Nein' });

        expect(resReject.status).toBe(200);
        expect(resReject.body.state).toBe('offen.abgelehnt');

        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        notifs = getTestNotifications();
        // 2 logs (approve, reject)
        expect(notifs.filter(n => n.targetUser === 'lehrer1').length).toBe(2);
        clearTestNotifications();

        await runSubscriptionCheck();
        notifs = getTestNotifications();
        // stundenplaner now sees t1 in Mir Zugewiesen
        expect(notifs.some(n => n.targetUser === 'stundenplaner' && n.message.includes('Mir Zugewiesen'))).toBe(true);
        // schulleiter sees both leave Mir Zugewiesen (one approved, one rejected)
        expect(notifs.some(n => n.targetUser === 'schulleiter')).toBe(true);
        clearTestNotifications();

        // Verify "Meine Tickets" for lehrer1
        resMy = await request(app)
            .get('/api/tickets?filter=my')
            .set('Authorization', `Bearer ${tokens.lehrer1}`);

        const myT1_afterSL = resMy.body.find(t => t.id === t1.id);
        const myT2_afterSL = resMy.body.find(t => t.id === t2.id);

        expect(myT1_afterSL.state).toBe('offen.genehmigt');
        expect(myT2_afterSL.state).toBe('offen.abgelehnt');

        // stornieren is still optional for genehmigt, but NO optional actions for abgelehnt
        const myT1Actions_afterSL = getActionsForTicket(myT1_afterSL, { username: 'lehrer1', groups: ['Lehrkräfte'] }, 'my');
        const myT2Actions = getActionsForTicket(myT2_afterSL, { username: 'lehrer1', groups: ['Lehrkräfte'] }, 'my');
        expect(myT1Actions_afterSL.map(a => a.name)).toEqual(['stornieren']);
        expect(myT2Actions.map(a => a.name)).toEqual([]);

        // lehrer1 should see "ok" for the rejected ticket in "Mir Zugewiesen"
        let resAssignedL1 = await request(app)
            .get('/api/tickets?filter=assigned')
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        const assignedT2_L1 = resAssignedL1.body.find(t => t.id === t2.id);
        expect(assignedT2_L1).toBeDefined();
        const l1AssignedActions = getActionsForTicket(assignedT2_L1, { username: 'lehrer1', groups: ['Lehrkräfte'] }, 'assigned');
        expect(l1AssignedActions.map(a => a.name)).toEqual(['ok']);


        // --- 4. stundenplaner sees approved ticket and assigns to himself ---
        let resAssignedSP = await request(app)
            .get('/api/tickets?filter=assigned')
            .set('Authorization', `Bearer ${tokens.stundenplaner}`);

        expect(resAssignedSP.status).toBe(200);
        const assignedT1_SP = resAssignedSP.body.find(t => t.id === t1.id);
        expect(assignedT1_SP).toBeDefined();
        // Stundenplanung sees "bearbeiten" action
        const spActions = getActionsForTicket(assignedT1_SP, { username: 'stundenplaner', groups: ['Stundenplanung', 'Lehrkräfte'] }, 'assigned');
        expect(spActions.map(a => a.name)).toEqual(['bearbeiten']);

        const resAssign = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'bearbeiten', formData: { assignee: 'stundenplaner' } });

        expect(resAssign.status).toBe(200);
        expect(resAssign.body.assignee).toBe('stundenplaner');


        // --- 5. stundenplaner processes t1 and sets to "erledigt" ---
        // 'bearbeiten' action executes a form script or just changes state.
        // The workflow defines "erledigt" and "in Arbeit" via form.
        // We simulate the form submission for "erledigt" action.
        const resDone = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.stundenplaner}`)
            .send({ actionName: 'bearbeiten', formButtonName: 'erledigt' });

        expect(resDone.status).toBe(200);
        expect(resDone.body.state).toBe('offen.erledigt');

        // Publisher check
        await Log.updateMany({}, { timestamp: new Date(Date.now() - 60000) });
        await checkUnpublishedLogs();
        notifs = getTestNotifications();
        // "bearbeiten" action logged
        expect(notifs.filter(n => n.targetUser === 'lehrer1').length).toBeGreaterThan(0);
        clearTestNotifications();

        // --- 6. lehrer1 acknowledges (ok) t1 and t2 ---
        resAssignedL1 = await request(app)
            .get('/api/tickets?filter=assigned')
            .set('Authorization', `Bearer ${tokens.lehrer1}`);

        const assignedT1_final = resAssignedL1.body.find(t => t.id === t1.id);
        const assignedT2_final = resAssignedL1.body.find(t => t.id === t2.id);

        // Both should now have "ok" action in assigned
        const assignedT1FinalActions = getActionsForTicket(assignedT1_final, { username: 'lehrer1', groups: ['Lehrkräfte'] }, 'assigned');
        const assignedT2FinalActions = getActionsForTicket(assignedT2_final, { username: 'lehrer1', groups: ['Lehrkräfte'] }, 'assigned');
        expect(assignedT1FinalActions.map(a => a.name)).toEqual(['ok']);
        expect(assignedT2FinalActions.map(a => a.name)).toEqual(['ok']);

        const resOk1 = await request(app)
            .post(`/api/tickets/${t1._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'ok' });
        expect(resOk1.status).toBe(200);
        expect(resOk1.body.state).toBe('geschlossen.ok');

        const resOk2 = await request(app)
            .post(`/api/tickets/${t2._id}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ actionName: 'ok' });
        expect(resOk2.status).toBe(200);
        expect(resOk2.body.state).toBe('geschlossen.ok');
    });

    it('should correctly restrict access to actions according to workflow groups', async () => {
        // 1. Create ticket
        const resCreate = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send(ticketPayload);

        const ticketId = resCreate.body._id;

        // 2. Lehrer2 tries to approve (should fail, no access)
        const resApproveL2 = await request(app)
            .post(`/api/tickets/${ticketId}/action`)
            .set('Authorization', `Bearer ${tokens.lehrer2}`) // Lehrer2 is not Schulleitung
            .send({ actionName: 'genehmigen' });

        expect(resApproveL2.status).toBe(403);

        // 3. Hausmeister tries to read (should not be visible in all tickets depending on permissions)
        // Access rules say "read": "@creator", "Schulleitung", "Stundenplanung"
        const resReadHausmeister = await request(app)
            .get(`/api/tickets/${ticketId}`)
            .set('Authorization', `Bearer ${tokens.hausmeister}`);

        expect(resReadHausmeister.status).toBe(404); // returns 404 typically if not accessible, or 403

        // 4. Schulleiter deletes the ticket (has delete access)
        const resDelete = await request(app)
            .delete(`/api/tickets/${ticketId}`)
            .set('Authorization', `Bearer ${tokens.schulleiter}`);

        expect(resDelete.status).toBe(200);
    });
});
