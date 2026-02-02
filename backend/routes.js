const express = require('express');
const router = express.Router();
const { login, verifyToken } = require('./auth');
const Ticket = require('./models/ticket');
const Counter = require('./models/counter');
const Comment = require('./models/comment');
const Log = require('./models/log');
const workflowEngine = require('./workflow');
const { canComment } = require('./workflow');
const mongoose = require('mongoose');

// Auth
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const result = login(username, password);
    if (result) res.json(result);
    else res.status(401).json({ message: 'Invalid credentials' });
});

router.get('/users', verifyToken, (req, res) => {
    const { getUsers } = require('./auth');
    res.json(getUsers());
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
    const { filter, type, status, creator, dateFrom, dateTo, badge } = req.query; // 'my', 'assigned', 'all' AND granular filters
    const user = req.user;

    let baseQuery = {};

    // 1. Base Filter (Access Control)
    if (filter === 'my') {
        baseQuery.creator = user.username;
    } else if (filter === 'assigned') {
        const conditions = [];
        const allWorkflows = workflowEngine.getWorkflows();
        Object.values(allWorkflows).forEach(wf => {
            if (wf.workflow) {
                wf.workflow.forEach(state => {
                    const releavantActions = (state.actions || []).filter(action => {
                        if (action.optional) return false;

                        const hasGroupAccess = action.groups.some(g => user.groups.includes(g));
                        const hasCreatorAccess = action.groups.includes('@creator');
                        const hasAssigneeAccess = action.groups.includes('@assignee');
                        return hasGroupAccess || hasCreatorAccess || hasAssigneeAccess;
                    });

                    if (releavantActions.length > 0) {
                        const condition = { type: wf.type, state: { $in: state.states } };
                        // Note: Complex logic for dynamic assignee/creator checks in $or is hard, 
                        // so we simplify to: If user likely has access, we include the type/state.
                        // Ideally we would check per-ticket who is creator/assignee, 
                        // but for 'assigned' view, usually we look for tickets waiting for *my group* or *me specifically*.

                        // For generic group access:
                        if (releavantActions.some(a => a.groups.some(g => user.groups.includes(g)))) {
                            conditions.push(condition);
                        }
                        // For specific user access (creator/assignee), strictly we need $or inside:
                        // but MongoDB query construction gets deep. 
                        // Let's assume for 'assigned' we rely mostly on group or direct assignment.
                        else if (releavantActions.some(a => a.groups.includes('@assignee'))) {
                            conditions.push({ ...condition, assignee: user.username });
                        }
                        else if (releavantActions.some(a => a.groups.includes('@creator'))) {
                            conditions.push({ ...condition, creator: user.username });
                        }
                    }
                });
            }
        });

        if (conditions.length > 0) baseQuery.$or = conditions;
        else baseQuery = { _id: null }; // No access

    } else if (filter === 'all' || !filter) {
        const conditions = [];
        const allWorkflows = workflowEngine.getWorkflows();
        Object.values(allWorkflows).forEach(wf => {
            const readAccess = wf.access ? wf.access.find(z => z.name === 'read') : null;
            const groups = [];
            if (readAccess) groups.push(...readAccess.groups);

            // Implicit: Creator usually can read their own tickets? 
            // If explicit read access rules exist, we follow them.
            // If generic read access allows this user's group:
            if (groups.some(g => user.groups.includes(g))) {
                conditions.push({ type: wf.type });
            }
        });

        // Also always include tickets where user is creator or assignee?
        // Usually 'all' means all visible in system.
        // Let's stick to explicit read permissions + own tickets

        const accessOr = [];
        if (conditions.length > 0) accessOr.push(...conditions);
        accessOr.push({ creator: user.username });
        accessOr.push({ assignee: user.username });

        if (baseQuery.$or) {
            // If baseQuery already had $or (unlikely here as it is 'all'), we'd merge.
            // But here we build it.
            baseQuery.$or = accessOr;
        } else {
            baseQuery.$or = accessOr;
        }
    }

    // 2. Granular Filters (Applied on top of Base Query)
    let finalQuery = { ...baseQuery };

    // If baseQuery has $or, we must use $and to combine with other filters
    const sensitiveFilters = [];

    if (type) sensitiveFilters.push({ type: type });
    if (status) {
        if (status.endsWith('.*')) {
            const prefix = status.replace('.*', '');
            sensitiveFilters.push({ state: { $regex: `^${prefix}`, $options: 'i' } });
        } else {
            sensitiveFilters.push({ state: status });
        }
    }
    if (creator) sensitiveFilters.push({ creator: { $regex: creator, $options: 'i' } }); // Fuzzy search
    if (req.query.id) sensitiveFilters.push({ id: req.query.id }); // Exact match for ID (e.g. ABW-1)

    if (dateFrom || dateTo) {
        let dateQuery = {};
        if (dateFrom) dateQuery.$gte = new Date(dateFrom);
        if (dateTo) {
            const d = new Date(dateTo);
            // Set time to end of day to include all tickets from that date
            d.setHours(23, 59, 59, 999);
            dateQuery.$lte = d;
        }
        sensitiveFilters.push({ created: dateQuery });
    }

    if (badge) {
        const badges = Array.isArray(badge) ? badge : [badge];
        sensitiveFilters.push({ badges: { $in: badges } });
    }

    if (sensitiveFilters.length > 0) {
        if (finalQuery.$or) {
            // Need to wrap: ($or conditions) AND (filter1) AND (filter2)
            finalQuery = {
                $and: [
                    { $or: finalQuery.$or },
                    ...sensitiveFilters
                ]
            };
        } else {
            // Just merge into top level
            // Note: 'creator' collision possible if baseQuery used it. 
            // But baseQuery only used it in direct assignment, not $or usually for 'my'.
            // For 'my', baseQuery.creator is set. If filter.creator is also set, 
            // we should technically $and them.

            finalQuery = {
                $and: [
                    baseQuery,
                    ...sensitiveFilters
                ]
            };
        }
    }

    try {
        const tickets = await Ticket.find(finalQuery).sort({ created: -1 });
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets', verifyToken, async (req, res) => {
    try {
        const type = req.body.typ || req.body.type;

        // Validation
        const wf = workflowEngine.getWorkflowForType(type);
        if (wf && wf.fields) {
            for (const field of wf.fields) {
                if (field.required) {
                    const val = req.body[field.name];
                    if (val === undefined || val === null || val === '') {
                        return res.status(400).json({
                            message: `Missing required field: ${field.label || field.name}`
                        });
                    }
                }
            }
        }

        const ticketData = {
            type: type,
            title: req.body.titel || req.body.title,
            description: req.body.beschreibung || req.body.description,
            ...req.body,
            creator: req.user.username,
            created: new Date(),
            state: 'offen.neu'
        };

        // Generate ID if abbreviation exists
        if (wf && wf.abbreviation) {
            try {
                const counter = await Counter.findByIdAndUpdate(
                    wf.abbreviation,
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true }
                );
                ticketData.id = `${wf.abbreviation}-${counter.seq}`;
            } catch (err) {
                console.error('Error generating ticket ID:', err);
                // Continue without ID or handle error? 
                // Better to log and maybe fail if ID is critical, but for now let's proceed or maybe fallback?
                // If ID is required by business logic, we should probably fail. 
                // But schema didn't mark it required.
            }
        }

        const ticket = new Ticket(ticketData);
        await ticket.save();

        // Create Log
        await new Log({
            ticket: ticket._id,
            editor: req.user.username,
            action: 'Ticket erstellt',
            dataAfter: ticket.toObject()
        }).save();

        res.status(201).json(ticket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:id/action', verifyToken, async (req, res) => {
    try {
        const { actionName, formData, formButtonName } = req.body;

        const ticket = await Ticket.findById(req.params.id);
        const dataBefore = ticket.toObject();

        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const wf = workflowEngine.getWorkflowForType(ticket.type);
        // Robustness fix: Handle if ticket.state doesn't match any workflow state (e.g. old data)
        const currentStates = wf.workflow.filter(s => s.states.includes(ticket.state));

        if (currentStates.length === 0) {
            console.log(`Debug: Invalid ticket state. Ticket: ${ticket.state}, Workflow States: ${wf.workflow.map(s => s.states.join(','))}`);
            return res.status(400).json({ message: `Invalid ticket state: ${ticket.state}` });
        }

        // Search for the action in ALL matching state blocks
        let action = null;
        for (const stateBlock of currentStates) {
            const found = stateBlock.actions.find(a => a.name === actionName);
            if (found) {
                action = found;
                break;
            }
        }

        if (!action) {
            // Check for generic 'edit' permission if action not found in state
            // This allows global actions like 'Bearbeiten' (or 'hacken') to work in any state
            // provided the user has 'edit' access.
            const { canEdit } = require('./workflow');
            if (canEdit(ticket.type, req.user.groups)) {
                action = {
                    name: actionName,
                    groups: req.user.groups, // Implicitly allowed
                    script: '' // No state transition by default, just data update
                };
            } else {
                console.log(`Debug: Action not found. Requested: ${actionName}, Available in blocks: ${currentStates.map(block => block.actions.map(a => a.name).join(', ')).join(' | ')}`);
                return res.status(400).json({ message: 'Invalid action' });
            }
        }

        // Check permission
        const userGroups = req.user.groups;
        let authorized = false;

        if (action.groups.includes('@creator') && ticket.creator === req.user.username) authorized = true;
        if (action.groups.includes('@assignee') && ticket.assignee === req.user.username) authorized = true;
        if (action.groups.some(g => userGroups.includes(g))) authorized = true;

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

        if (formData) {
            Object.keys(formData).forEach(key => {
                ticket.set(key, formData[key]);
            });
        }

        await ticket.save();

        // Create Log
        await new Log({
            ticket: ticket._id,
            editor: req.user.username,
            action: actionName + (formButtonName ? ` (${formButtonName})` : ''),
            dataBefore: dataBefore,
            dataAfter: ticket.toObject()
        }).save();

        res.json(ticket);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// Comments
router.get('/tickets/:id/comments', verifyToken, async (req, res) => {

    try {
        const comments = await Comment.find({ ticket: req.params.id }).sort({ created: 1 });
        res.json(comments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:id/comments', verifyToken, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ message: 'Text required' });

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // Access Control
        let authorized = false;
        if (ticket.creator === req.user.username) authorized = true;
        if (ticket.assignee === req.user.username) authorized = true;

        // Check group access via workflow config
        if (!authorized && canComment(ticket.type, req.user.groups)) {
            authorized = true;
        }

        if (!authorized) return res.status(403).json({ message: 'Not authorized to comment' });

        const comment = new Comment({
            ticket: ticket._id,
            text,
            creator: req.user.username,
            created: new Date()
        });
        await comment.save();

        // Create Log
        await new Log({
            ticket: ticket._id,
            editor: req.user.username,
            action: 'Kommentar hinzugefügt',
            timestamp: new Date(),
            dataAfter: ticket.toObject() // Snapshot (unchanged, but current state)
        }).save();

        res.status(201).json(comment);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Logs
router.get('/logs', verifyToken, async (req, res) => {
    try {
        const user = req.user;
        const workflowEngine = require('./workflow');
        const tickets = await Ticket.find({}, 'id title type creator assignee'); // Get basic info for access check

        // Filter tickets based on read access (Reuse logic from /tickets roughly)
        // Optimization: For now, we fetch all logs and filter in memory or fetch accessible tickets IDs first.
        // Fetching all tickets first to get IDs is safer for consistent access control.

        // 1. Determine accessible Ticket IDs
        const accessibleTicketIds = [];
        const allWorkflows = workflowEngine.getWorkflows();

        for (const ticket of tickets) {
            let hasAccess = false;

            // Direct access
            if (ticket.creator === user.username) hasAccess = true;
            if (ticket.assignee === user.username) hasAccess = true;

            if (!hasAccess) {
                const wf = allWorkflows[ticket.type];
                if (wf) {
                    const readAccess = wf.access ? wf.access.find(z => z.name === 'read') : null;
                    if (readAccess && readAccess.groups.some(g => user.groups.includes(g))) {
                        hasAccess = true;
                    }
                }
            }

            if (hasAccess) {
                accessibleTicketIds.push(ticket._id);
            }
        }

        // 2. Fetch Logs for these tickets
        const logs = await Log.find({ ticket: { $in: accessibleTicketIds } })
            .select('-dataBefore -dataAfter -published') // Exclude heavy data and internal fields
            .populate('ticket', 'id title type')
            .sort({ timestamp: -1 })
            .limit(100); // Limit to 100 for now

        res.json(logs);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
