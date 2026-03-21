const request = require('supertest');
const app = require('../src/server');
const mongoose = require('mongoose');
const { getTokens, clearDatabase, closeDatabase } = require('./setup');
const { loadBots } = require('../src/bots');
const Ticket = require('../src/models/ticket');
const Log = require('../src/models/log');
const workflowEngine = require('../src/workflow');

let tokens;

beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
        await new Promise(resolve => mongoose.connection.once('connected', resolve));
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    tokens = getTokens();
    loadBots();
});

beforeEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
});

describe('Subtickets Integration', () => {
    it('should create a subticket and log status changes to parent', async () => {
        // Override workflow config dynamically
        const workflows = workflowEngine.getWorkflows();
        const originalItTicket = workflows['IT-Ticket'];
        const testWorkflow = JSON.parse(JSON.stringify(originalItTicket));
        testWorkflow.subTickets = { logStatusToParent: true };
        if (testWorkflow.workflow && testWorkflow.workflow.length > 0) {
            testWorkflow.workflow[0].actions.push({
                name: "Subticket erstellen",
                groups: [],
                subTickets: ["IT-Ticket"]
            });
        }
        workflows['IT-Ticket'] = testWorkflow;

        // 1. Create Parent Ticket
        const parentRes = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                type: 'IT-Ticket',
                title: 'Parent',
                description: 'Parent',
                category: 'Hardware',
                location: 'R101'
            });
        if (parentRes.status !== 201) {
            console.error('Parent creation failed:', parentRes.body);
        }
        expect(parentRes.status).toBe(201);
        const parentId = parentRes.body.id;

        // 2. Create Subticket
        const subRes = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                type: 'IT-Ticket',
                title: 'Subticket',
                parentTicket: parentId,
                category: 'Hardware',
                location: 'R101',
                description: 'test'
            });
        if (subRes.status !== 201) {
            console.error('Subticket creation failed:', subRes.body);
        }
        expect(subRes.status).toBe(201);
        const subDbId = subRes.body._id;

        // 3. Reject creation with invalid type
        const rejectRes = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({
                type: 'Stundenplan-Ticket', // Not in allowedTypes
                title: 'Subticket Invalid',
                parentTicket: parentId,
                category: 'Klasse',
                location: 'R101',
                description: 'test'
            });
        expect(rejectRes.status).toBe(403);

        // 4. Change status of subticket to trigger parent log
        const actionRes = await request(app)
            .post(`/api/tickets/${subDbId}/action`)
            .set('Authorization', `Bearer ${tokens.admin}`)
            .send({
                actionName: 'bearbeiten',
                formButtonName: 'in Arbeit',
                formData: { assignee: 'admin' }
            });
        expect(actionRes.status).toBe(200);

        // 5. Check if parent has log
        const parentLogs = await Log.find({ ticket: parentRes.body._id });
        const sysLog = parentLogs.find(l => l.editor === 'System' && l.action.includes('ist nun im Status'));
        expect(sysLog).toBeTruthy();
        expect(sysLog.action).toContain('inArbeit');

        // Restore original config
        workflows['IT-Ticket'] = originalItTicket;
    });

    it('should aggregate subtickets in list view', async () => {
        const workflows = workflowEngine.getWorkflows();
        const originalItTicket = workflows['IT-Ticket'];
        const testWorkflow = JSON.parse(JSON.stringify(originalItTicket));
        if (testWorkflow.workflow && testWorkflow.workflow.length > 0) {
            testWorkflow.workflow[0].actions.push({
                name: "Subticket erstellen",
                groups: [],
                subTickets: ["IT-Ticket"]
            });
        }
        workflows['IT-Ticket'] = testWorkflow;

        const parentRes = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ type: 'IT-Ticket', title: 'Parent 2', category: 'Hardware', location: 'R101', description: 'test' });
        
        const sub2Res = await request(app)
            .post('/api/tickets')
            .set('Authorization', `Bearer ${tokens.lehrer1}`)
            .send({ type: 'IT-Ticket', title: 'Sub 2', parentTicket: parentRes.body.id, category: 'Hardware', location: 'R101', description: 'test' });
        
        if (sub2Res.status !== 201) {
            console.error('Subticket 2 creation failed:', sub2Res.body);
        }

        const getRes = await request(app)
            .get(`/api/tickets?id=${parentRes.body.id}`)
            .set('Authorization', `Bearer ${tokens.lehrer1}`);
        
        expect(getRes.status).toBe(200);
        expect(getRes.body[0].subTickets).toBeDefined();
        expect(getRes.body[0].subTickets.length).toBe(1);
        expect(getRes.body[0].subTickets[0].title).toBe('Sub 2');

        workflows['IT-Ticket'] = originalItTicket;
    });
});
