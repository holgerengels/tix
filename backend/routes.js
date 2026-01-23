const express = require('express');
const router = express.Router();
const { login, verifyToken } = require('./auth');
const Ticket = require('./models/ticket');
const workflowEngine = require('./workflow');
const mongoose = require('mongoose');

// Mock Data Store
let mockTickets = [
    {
        _id: 'mock_1',
        title: 'Beispiel Ticket 1',
        type: 'Abwesenheit',
        state: 'neu',
        creator: 'lehrer1',
        created: new Date(),
        data: {},
        log: [{ editor: 'lehrer1', text: 'Ticket erstellt', edited: new Date() }]
    },
    {
        _id: 'mock_2',
        title: 'Beispiel Ticket 2',
        type: 'Abwesenheit',
        state: 'genehmigt',
        creator: 'lehrer2',
        created: new Date(),
        data: {},
        log: [{ editor: 'lehrer2', text: 'Ticket erstellt', edited: new Date() }]
    }
];

// Helper to check DB status
const isDBConnected = () => mongoose.connection.readyState === 1;

// Auth
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const result = login(username, password);
    if (result) res.json(result);
    else res.status(401).json({ message: 'Invalid credentials' });
});

// Config
router.get('/config', verifyToken, (req, res) => {
    res.json(workflowEngine.getWorkflows());
});

router.post('/config/reload', verifyToken, (req, res) => {
    try {
        workflowEngine.loadWorkflows();
        res.json({ message: 'Workflows reloaded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tickets
router.get('/tickets', verifyToken, async (req, res) => {
    const { filter } = req.query; // 'my', 'assigned', 'all'
    const user = req.user;

    if (!isDBConnected()) {
        console.log('Serving MOCK tickets');
        let results = [];
        // Simple mock filtering
        if (filter === 'my') {
            results = mockTickets.filter(t => t.creator === user.username);
        } else {
            // Return all for now in mock mode for simplicity, or implement complex filtering if needed
            results = mockTickets;
        }
        return res.json(results);
    }

    let query = {};
    if (filter === 'my') {
        query.creator = user.username;
    } else if (filter === 'assigned') {
        const conditions = [];
        const allWorkflows = workflowEngine.getWorkflows();
        Object.values(allWorkflows).forEach(wf => {
            if (wf.workflow) {
                wf.workflow.forEach(state => {
                    const releavantActions = (state.actions || []).filter(action => {
                        // For 'assigned' filter, we only care about mandatory (non-optional) actions
                        if (action.optional) return false;

                        const hasGroupAccess = action.groups.some(g => user.groups.includes(g));
                        const hasCreatorAccess = action.groups.includes('@creator');
                        return hasGroupAccess || hasCreatorAccess;
                    });

                    if (releavantActions.length > 0) {
                        if (releavantActions.some(a => a.groups.includes('@creator'))) {
                            conditions.push({ type: wf.type, state: { $in: state.states }, creator: user.username });
                        }
                        if (releavantActions.some(a => a.groups.some(g => user.groups.includes(g)))) {
                            conditions.push({ type: wf.type, state: { $in: state.states } });
                        }
                    }
                });
            }
        });

        if (conditions.length > 0) query.$or = conditions;
        else query = { _id: null };

    } else if (filter === 'all') {
        const conditions = [];
        const allWorkflows = workflowEngine.getWorkflows();
        Object.values(allWorkflows).forEach(wf => {
            const readAccess = wf.access.find(z => z.name === 'read');
            const deleteAccess = wf.access.find(z => z.name === 'delete');
            const groups = [];
            if (readAccess) groups.push(...readAccess.groups);
            if (deleteAccess) groups.push(...deleteAccess.groups);

            if (groups.some(g => user.groups.includes(g))) {
                conditions.push({ type: wf.type });
            }
        });

        if (conditions.length > 0) query.$or = conditions;
        else query = { _id: null };
    }

    try {
        const tickets = await Ticket.find(query).sort({ created: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets', verifyToken, async (req, res) => {
    try {
        const ticketData = {
            type: req.body.typ || req.body.type,
            title: req.body.titel || req.body.title,
            description: req.body.beschreibung || req.body.description,
            ...req.body,
            creator: req.user.username,
            created: new Date(),
            state: 'offen.neu',
            log: [{ editor: req.user.username, text: 'Ticket erstellt', edited: new Date() }]
        };

        if (!isDBConnected()) {
            console.log('Creating MOCK ticket');
            const newTicket = {
                _id: 'mock_' + Date.now(),
                ...ticketData
            };
            mockTickets.push(newTicket);
            return res.status(201).json(newTicket);
        }

        const ticket = new Ticket(ticketData);
        await ticket.save();
        res.status(201).json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:id/action', verifyToken, async (req, res) => {
    try {
        const { actionName, formData, formButtonName } = req.body;

        let ticket;
        if (!isDBConnected()) {
            ticket = mockTickets.find(t => t._id === req.params.id);
        } else {
            ticket = await Ticket.findById(req.params.id);
        }

        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const wf = workflowEngine.getWorkflowForType(ticket.type);
        // Robustness fix: Handle if ticket.state doesn't match any workflow state (e.g. old data)
        const currentState = wf.workflow.find(s => s.states.includes(ticket.state));

        if (!currentState) return res.status(400).json({ message: `Invalid ticket state: ${ticket.state}` });

        const action = currentState.actions.find(a => a.name === actionName);
        if (!action) return res.status(400).json({ message: 'Invalid action' });

        // Check permission
        const userGroups = req.user.groups;
        let authorized = false;

        if (action.groups.includes('@creator')) {
            if (ticket.creator === req.user.username) authorized = true;
        } else if (action.groups.some(g => userGroups.includes(g))) {
            authorized = true;
        }

        if (!authorized) return res.status(403).json({ message: 'Not authorized' });

        // Determine Script to run
        let scriptToRun = action.script;

        if (formButtonName && action.form) {
            const formDef = wf.forms.find(f => f.name === action.form);
            if (formDef) {
                const btn = formDef.actions.find(b => b.name === formButtonName);
                if (btn) {
                    scriptToRun = btn.script;
                }
            }
        }

        // Execute Script
        if (scriptToRun) {
            const match = scriptToRun.match(/ticket\.state\s*=\s*'([^']+)'/);
            if (match) {
                ticket.state = match[1];
            }
        }

        // Add log
        const newLog = {
            editor: req.user.username,
            text: `Aktion: ${actionName} ${formButtonName ? `(${formButtonName})` : ''}`,
            edited: new Date()
        };

        if (Array.isArray(ticket.log)) {
            ticket.log.push(newLog);
        } else {
            ticket.log = [newLog];
        }

        // If formData updates other fields, apply them
        if (formData) {
            Object.assign(ticket, formData);
        }

        if (!isDBConnected()) {
            // Mock update implicitly done as object is reference, just return
            return res.json(ticket);
        }

        await ticket.save();
        res.json(ticket);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
