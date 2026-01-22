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
        titel: 'Beispiel Ticket 1',
        typ: 'Abwesenheit',
        status: 'neu',
        ersteller: 'lehrer1',
        erstellt: new Date(),
        daten: {},
        log: [{ bearbeiter: 'lehrer1', text: 'Ticket erstellt', bearbeitet: new Date() }]
    },
    {
        _id: 'mock_2',
        titel: 'Beispiel Ticket 2',
        typ: 'Abwesenheit',
        status: 'genehmigt',
        ersteller: 'lehrer2',
        erstellt: new Date(),
        daten: {},
        log: [{ bearbeiter: 'lehrer2', text: 'Ticket erstellt', bearbeitet: new Date() }]
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

// Tickets
router.get('/tickets', verifyToken, async (req, res) => {
    const { filter } = req.query; // 'my', 'assigned', 'all'
    const user = req.user;

    if (!isDBConnected()) {
        console.log('Serving MOCK tickets');
        let results = [];
        // Simple mock filtering
        if (filter === 'my') {
            results = mockTickets.filter(t => t.ersteller === user.username);
        } else {
            // Return all for now in mock mode for simplicity, or implement complex filtering if needed
            results = mockTickets;
        }
        return res.json(results);
    }

    let query = {};
    if (filter === 'my') {
        query.ersteller = user.username;
    } else if (filter === 'assigned') {
        const conditions = [];
        const allWorkflows = workflowEngine.getWorkflows();
        Object.values(allWorkflows).forEach(wf => {
            if (wf.workflow) {
                wf.workflow.forEach(state => {
                    const releavantActions = state.aktionen.filter(action => {
                        return user.groups.includes(action.gruppe) || (action.gruppe === '@ersteller'); // simplified
                    });

                    if (releavantActions.length > 0) {
                        if (releavantActions.some(a => a.gruppe === '@ersteller')) {
                            conditions.push({ typ: wf.typ, status: { $in: state.status }, ersteller: user.username });
                        }
                        if (releavantActions.some(a => user.groups.includes(a.gruppe))) {
                            conditions.push({ typ: wf.typ, status: { $in: state.status } });
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
            const readAccess = wf.zugriff.find(z => z.name === 'lesen');
            const deleteAccess = wf.zugriff.find(z => z.name === 'löschen');
            const groups = [];
            if (readAccess) groups.push(...readAccess.gruppen);
            if (deleteAccess) groups.push(...deleteAccess.gruppen);

            if (groups.some(g => user.groups.includes(g))) {
                conditions.push({ typ: wf.typ });
            }
        });

        if (conditions.length > 0) query.$or = conditions;
        else query = { _id: null };
    }

    try {
        const tickets = await Ticket.find(query).sort({ erstellt: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets', verifyToken, async (req, res) => {
    try {
        const ticketData = req.body;
        ticketData.ersteller = req.user.username;
        ticketData.log = [{ bearbeiter: req.user.username, text: 'Ticket erstellt' }];

        if (!isDBConnected()) {
            console.log('Creating MOCK ticket');
            const newTicket = {
                _id: 'mock_' + Date.now(),
                ...ticketData,
                erstellt: new Date(),
                status: 'neu' // Default status
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

        const wf = workflowEngine.getWorkflowForType(ticket.typ);
        // Robustness fix: Handle if ticket.status doesn't match any workflow state (e.g. old data)
        const currentState = wf.workflow.find(s => s.status.includes(ticket.status));

        if (!currentState) return res.status(400).json({ message: `Invalid ticket status: ${ticket.status}` });

        const action = currentState.aktionen.find(a => a.name === actionName);
        if (!action) return res.status(400).json({ message: 'Invalid action' });

        // Check permission
        const userGroups = req.user.groups;
        let authorized = false;

        if (action.gruppe === '@ersteller') {
            if (ticket.ersteller === req.user.username) authorized = true;
        } else if (userGroups.includes(action.gruppe)) {
            authorized = true;
        }

        if (!authorized) return res.status(403).json({ message: 'Not authorized' });

        // Determine Script to run
        let scriptToRun = action.script;

        if (formButtonName && action.formular) {
            const formDef = wf.formulare.find(f => f.name === action.formular);
            if (formDef) {
                const btn = formDef.aktionen.find(b => b.name === formButtonName);
                if (btn) {
                    scriptToRun = btn.script;
                }
            }
        }

        // Execute Script
        if (scriptToRun) {
            const match = scriptToRun.match(/ticket\.status\s*=\s*'([^']+)'/);
            if (match) {
                ticket.status = match[1];
            }
        }

        // Add log
        const newLog = {
            bearbeiter: req.user.username,
            text: `Aktion: ${actionName} ${formButtonName ? `(${formButtonName})` : ''}`,
            bearbeitet: new Date()
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
