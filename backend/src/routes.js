const express = require('express');
const router = express.Router();
const { login, verifyToken } = require('./auth');
const Ticket = require('./models/ticket');
const Counter = require('./models/counter');
const Comment = require('./models/comment');
const Log = require('./models/log');
const Subscription = require('./models/subscription');
const workflowEngine = require('./workflow');
const { canComment, canDelete } = require('./workflow');
const mongoose = require('mongoose');
const vm = require('vm');
const { runBotsForTicket } = require('./bots');
const { evaluateTemplate } = require('./validation');

// Compute summary string from workflow template for search purposes
function computeSummary(ticketData, wf) {
    if (!wf || !wf.template) return undefined;
    try {
        const data = typeof ticketData.toObject === 'function' ? ticketData.toObject() : ticketData;
        const result = evaluateTemplate(wf.template, data);
        return typeof result === 'string' ? result.trim() : String(result || '').trim();
    } catch (e) {
        console.warn('[computeSummary] Error:', e.message);
        return undefined;
    }
}

// Auth
router.post('/login', async (req, res) => {
    const { username, password, isPwa } = req.body;
    try {
        const result = await login(username, password, isPwa);
        if (result) res.json(result);
        else res.status(401).json({ message: 'Invalid credentials' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'Refresh token required' });

    const { refreshAccessToken } = require('./auth');
    const result = refreshAccessToken(refreshToken);
    if (result) {
        res.json(result);
    } else {
        res.status(401).json({ message: 'Invalid or expired refresh token' });
    }
});


router.post('/extend', verifyToken, (req, res) => {
    const { extendAccessToken } = require('./auth');
    const result = extendAccessToken(req.user.username, req.user.groups);
    res.json(result);
});

router.get('/users', verifyToken, async (req, res) => {
    const { getUsers } = require('./auth');
    // Expecting comma separated groups in query: ?groups=Lehrkräfte,Admin
    const groups = req.query.groups ? req.query.groups.split(',').filter(g => g.trim()) : [];
    res.json(await getUsers(groups));
});

router.get('/users/:username', verifyToken, async (req, res) => {
    const { getUser } = require('./auth');
    const user = await getUser(req.params.username);
    // Only return username and displayName — no groups for security
    res.json({ username: user.username, displayName: user.displayName });
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

router.get('/config/status', verifyToken, (req, res) => {
    const { isDevMode } = require('./auth');
    res.json({ devmode: isDevMode() });
});

router.get('/settings', verifyToken, async (req, res) => {
    try {
        const { getUserSettings } = require('./auth');
        const settings = await getUserSettings(req.user.username);
        res.json(settings);
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/settings', verifyToken, async (req, res) => {
    try {
        const { updateUserSettings } = require('./auth');
        await updateUserSettings(req.user.username, req.body);
        res.json({ message: 'Settings saved' });
    } catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/settings/filters', verifyToken, async (req, res) => {
    try {
        const User = require('./models/user');
        const user = await User.findOne({ username: req.user.username.toLowerCase() });
        res.json(user && user.savedFilters ? user.savedFilters : {});
    } catch (err) {
        console.error('Error fetching saved filters:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/settings/filters', verifyToken, async (req, res) => {
    try {
        const User = require('./models/user');
        await User.findOneAndUpdate(
            { username: req.user.username.toLowerCase() },
            { $set: { savedFilters: req.body } },
            { upsert: true }
        );
        res.json({ message: 'Saved filters updated' });
    } catch (err) {
        console.error('Error updating saved filters:', err);
        res.status(500).json({ error: err.message });
    }
});

// Config Docs
router.get('/config/:type/doc', verifyToken, async (req, res) => {
    try {
        const typeStr = req.params.type;
        const allWorkflows = workflowEngine.getWorkflows();
        const wf = allWorkflows[typeStr];

        let mdPath = null;
        const fs = require('fs');
        const path = require('path');
        const configDir = path.join(__dirname, '../../config');

        if (wf && wf.file) {
            const baseName = wf.file.replace('.json', '');
            mdPath = path.join(configDir, `${baseName}.md`);
        }

        if (!mdPath || !fs.existsSync(mdPath)) {
            mdPath = path.join(configDir, 'default.md');
        }

        if (fs.existsSync(mdPath)) {
            const content = fs.readFileSync(mdPath, 'utf8');
            res.send(content);
        } else {
            res.send('Keine Dokumentation verfügbar.');
        }

    } catch (err) {
        console.error('Error fetching doc:', err);
        res.status(500).json({ error: err.message });
    }
});

// Tickets
router.get('/tickets', verifyToken, async (req, res) => {
    const { filter, type, status, creator, assignee, dateFrom, dateTo, badge, assignmentType, search } = req.query; // 'my', 'assigned', 'all' AND granular filters
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

    } else if (filter === 'admin' && user.groups.includes('Administration')) {
        // Dedicated admin filter bypasses workflow restrictions entirely
        if (baseQuery.$or) delete baseQuery.$or;

    } else if (filter === 'all' || !filter) {
        if (user.groups.includes('Administration')) {
            // Administrators have global read access to all tickets
        } else {
            const conditions = [];
            const allWorkflows = workflowEngine.getWorkflows();
            Object.values(allWorkflows).forEach(wf => {
                const readAccess = wf.access ? wf.access.find(z => z.name === 'read') : null;
                const groups = [];
                if (readAccess) groups.push(...readAccess.groups);
                if (groups.some(g => user.groups.includes(g))) {
                    conditions.push({ type: wf.type });
                }
            });

            const accessOr = [];
            if (conditions.length > 0) accessOr.push(...conditions);
            accessOr.push({ creator: user.username });
            accessOr.push({ assignee: user.username });

            baseQuery.$or = accessOr;
        }
    }

    // 2. Granular Filters (Applied on top of Base Query)
    let finalQuery = { ...baseQuery };

    // If baseQuery has $or, we must use $and to combine with other filters
    const sensitiveFilters = [];

    if (type) {
        const types = Array.isArray(type) ? type : [type];
        sensitiveFilters.push({ type: { $in: types } });
    }
    if (status) {
        if (status.endsWith('.*')) {
            const prefix = status.replace('.*', '');
            sensitiveFilters.push({ state: { $regex: `^${prefix}`, $options: 'i' } });
        } else {
            sensitiveFilters.push({ state: status });
        }
    }
    if (creator) {
        try {
            const { getUsers } = require('./auth');
            const allUsers = await getUsers();
            const searchRegex = new RegExp(creator, 'i');
            const matchedUsernames = allUsers
                .filter(u => searchRegex.test(u.username) || searchRegex.test(u.displayName))
                .map(u => u.username);

            if (matchedUsernames.length > 0) {
                sensitiveFilters.push({ creator: { $in: matchedUsernames } });
            } else {
                sensitiveFilters.push({ creator: '___NO_MATCH___' });
            }
        } catch (e) {
            sensitiveFilters.push({ creator: { $regex: creator, $options: 'i' } });
        }
    }
    if (assignee) {
        try {
            const { getUsers } = require('./auth');
            const allUsers = await getUsers();
            const searchRegex = new RegExp(assignee, 'i');
            const matchedUsernames = allUsers
                .filter(u => searchRegex.test(u.username) || searchRegex.test(u.displayName))
                .map(u => u.username);

            if (matchedUsernames.length > 0) {
                sensitiveFilters.push({ assignee: { $in: matchedUsernames } });
            } else {
                sensitiveFilters.push({ assignee: '___NO_MATCH___' });
            }
        } catch (e) {
            sensitiveFilters.push({ assignee: { $regex: assignee, $options: 'i' } });
        }
    }
    if (req.query.id) sensitiveFilters.push({ id: req.query.id }); // Exact match for ID (e.e. ABW-1)
    if (assignmentType === 'personal') sensitiveFilters.push({ assignee: user.username }); // Filter for purely personal assignment

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

    // Fulltext search across key fields
    if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchConditions = [
            { title: { $regex: escapedSearch, $options: 'i' } },
            { id: { $regex: escapedSearch, $options: 'i' } },
            { description: { $regex: escapedSearch, $options: 'i' } },
            { creator: { $regex: escapedSearch, $options: 'i' } },
            { assignee: { $regex: escapedSearch, $options: 'i' } },
            { badges: { $regex: escapedSearch, $options: 'i' } },
            { summary: { $regex: escapedSearch, $options: 'i' } }
        ];

        // Also match by user display names
        try {
            const { getUsers } = require('./auth');
            const allUsers = await getUsers();
            const searchRegex = new RegExp(escapedSearch, 'i');
            const matchedUsernames = allUsers
                .filter(u => searchRegex.test(u.displayName))
                .map(u => u.username);
            if (matchedUsernames.length > 0) {
                searchConditions.push({ creator: { $in: matchedUsernames } });
                searchConditions.push({ assignee: { $in: matchedUsernames } });
            }
        } catch (e) {
            // Ignore display name resolution errors
        }

        sensitiveFilters.push({ $or: searchConditions });
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
        const docTickets = await Ticket.find(finalQuery).sort({ created: -1 }).limit(200);
        const tickets = docTickets.map(t => t.toObject());

        // Load subtickets efficiently
        const ticketIds = tickets.map(t => t.id).filter(id => id);
        if (ticketIds.length > 0) {
            const allSubTickets = await Ticket.find({ parentTicket: { $in: ticketIds } }).lean();
            if (allSubTickets.length > 0) {
                const subTicketsByParent = {};
                allSubTickets.forEach(sub => {
                    if (!subTicketsByParent[sub.parentTicket]) subTicketsByParent[sub.parentTicket] = [];
                    subTicketsByParent[sub.parentTicket].push(sub);
                });
                tickets.forEach(t => {
                    if (subTicketsByParent[t.id]) {
                        t.subTickets = subTicketsByParent[t.id];
                    }
                });
            }
        }

        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets', verifyToken, async (req, res) => {
    try {
        const type = req.body.typ || req.body.type;

        const wf = workflowEngine.getWorkflowForType(type);

        // Access Control
        if (wf && wf.access) {
            const createAccess = wf.access.find(a => a.name === 'create');
            if (createAccess && createAccess.groups) {
                const userGroups = req.user.groups || [];
                // Anyone can create if no specific groups required, else must match
                if (createAccess.groups.length > 0) {
                    const hasAccess = createAccess.groups.some(g => userGroups.includes(g));
                    if (!hasAccess) {
                        return res.status(403).json({ message: 'Not authorized to create tickets of this type' });
                    }
                }
            }
        }

        // Validation
        if (wf) {
            const { validateTicket } = require('./validation');
            const validationResult = validateTicket(req.body, wf, null, req.user);
            if (!validationResult.isValid) {
                return res.status(400).json({
                    message: `Validation failed: ${validationResult.errors.join(', ')}`
                });
            }
        }

        if (req.body.parentTicket) {
            const parent = await Ticket.findOne({ id: req.body.parentTicket });
            if (!parent) {
                return res.status(400).json({ message: 'Parent ticket not found' });
            }
            const parentWf = workflowEngine.getWorkflowForType(parent.type);
            const parentMatchingBlocks = parentWf?.workflow?.filter(w => w.states.includes(parent.state)) || [];

            let allowed = false;
            for (const block of parentMatchingBlocks) {
                const subActions = (block.actions || []).filter(a => a.subTickets && a.subTickets.includes(type));
                for (const action of subActions) {
                    const groups = action.groups || [];
                    const isCreator = parent.creator === req.user.username;
                    const isAssignee = parent.assignee === req.user.username;
                    const userGroups = req.user.groups || [];

                    const allowedGroup = groups.some(g => {
                        if (g === '@creator' && isCreator) return true;
                        if (g === '@assignee' && isAssignee) return true;
                        if (userGroups.includes(g)) return true;
                        return false;
                    });

                    if (allowedGroup || groups.length === 0) {
                        allowed = true;
                        break;
                    }
                }
                if (allowed) break;
            }

            if (!allowed) {
                return res.status(400).json({ message: 'This ticket type is not allowed as a subticket for the given parent in its current state or you do not have permission' });
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

        const newTicket = new Ticket(ticketData);
        newTicket.summary = computeSummary(newTicket, wf) || '';
        await newTicket.save();

        // Run bots immediately
        await runBotsForTicket(newTicket);

        // Log creation
        const log = new Log({
            ticket: newTicket._id,
            action: 'Ticket erstellt',
            editor: req.user.username, // Changed from 'user' to 'editor' to match existing log structure
            timestamp: new Date(),
            dataAfter: newTicket.toObject() // Added dataAfter to match existing log structure
        });
        await log.save();

        res.status(201).json(newTicket);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets/:id/action', verifyToken, async (req, res) => {
    try {
        const { actionName, formData, formButtonName } = req.body;

        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        const dataBefore = ticket.toObject();

        const wf = workflowEngine.getWorkflowForType(ticket.type);
        // Robustness fix: Handle if ticket.state doesn't match any workflow state (e.g. old data)
        const currentStates = wf.workflow.filter(s => s.states.includes(ticket.state));

        if (currentStates.length === 0) {
            console.log(`Debug: Invalid ticket state. Ticket: ${ticket.state}, Workflow States: ${wf.workflow.map(s => s.states.join(','))}`);
            // return res.status(400).json({ message: `Invalid ticket state: ${ticket.state}` });
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
            // This allows global actions like 'Bearbeiten' to work in any state
            // provided the user has 'edit' access.

            // Fix: Enforce that only explicit generic actions (like 'editieren') fall back to edit rights.
            // Invalid workflow transitions are strictly rejected.
            if (actionName !== 'editieren') {
                return res.status(400).json({ message: `Aktion '${actionName}' ist im aktuellen Status (${ticket.state}) nicht verfügbar.` });
            }

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
        let scriptToRun = null;

        if (action.form) {
            // If action has a form, it MUST be triggered via a valid form button to run a script
            if (formButtonName) {
                const formDef = wf.forms.find(f => f.name === action.form);
                if (formDef) {
                    const btn = formDef.actions.find(b => b.name === formButtonName);
                    if (btn) {
                        scriptToRun = btn.script;
                    }
                }
            }
        } else {
            // Regular action without form
            scriptToRun = action.script;
        }

        if (formData) {
            Object.keys(formData).forEach(key => {
                ticket.set(key, formData[key]);
                ticket.markModified(key);
            });
        }

        // Execute Script
        if (scriptToRun) {
            const { evaluateTemplate } = require('./validation');
            const sandbox = { ticket, evaluateTemplate, currentWorkflow: wf };

            // Inject functions from the workflow's specific JS file if it exists
            if (wf && wf.file) {
                const fs = require('fs');
                const path = require('path');
                const baseName = wf.file.replace('.json', '');
                const scriptPath = path.join(__dirname, '../../config', `${baseName}.js`);
                if (fs.existsSync(scriptPath)) {
                    try {
                        const scriptContent = fs.readFileSync(scriptPath, 'utf8');
                        const contextSandbox = {
                            require: require,
                            console: console,
                            module: {},
                            exports: {},
                            process: process,
                            path: path,
                            fs: fs,
                            otpauth: require('otpauth'),
                            evaluateTemplate: require('./validation').evaluateTemplate,
                            currentWorkflow: wf
                        };
                        contextSandbox.module.exports = contextSandbox.exports;
                        vm.createContext(contextSandbox);
                        vm.runInContext(scriptContent, contextSandbox);
                        Object.assign(sandbox, contextSandbox.module.exports);
                    } catch (e) {
                        console.error(`Error loading workflow JS ${scriptPath} for action script:`, e);
                    }
                }
            }

            vm.createContext(sandbox);
            try {
                vm.runInContext(scriptToRun, sandbox);
            } catch (e) {
                console.error(`Error executing action script '${scriptToRun}':`, e);
                return res.status(500).json({ message: 'Error executing action script.' });
            }
        }

        // Validate modified ticket
        const currentWf = workflowEngine.getWorkflowForType(ticket.type) || wf;
        const { validateTicket } = require('./validation');
        const validationResult = validateTicket(ticket.toObject(), currentWf, null, req.user);
        if (!validationResult.isValid) {
            return res.status(400).json({
                message: `Validation failed: ${validationResult.errors.join(', ')}`
            });
        }

        if (ticket.isModified()) {
            const currentWfForSummary = workflowEngine.getWorkflowForType(ticket.type);
            const newSummary = computeSummary(ticket, currentWfForSummary);
            if (newSummary !== undefined) ticket.summary = newSummary;
            await ticket.save();
        }

        // Subticket -> Parent Logging
        if (ticket.parentTicket && dataBefore.state !== ticket.state) {
            const parent = await Ticket.findOne({ id: ticket.parentTicket });
            if (parent) {
                const workflowEngine = require('./workflow');
                const parentWf = workflowEngine.getWorkflowForType(parent.type);
                if (parentWf && parentWf.subTickets && parentWf.subTickets.logStatusToParent) {
                    const Log = require('./models/log');
                    await new Log({
                        ticket: parent._id,
                        editor: 'System',
                        action: `Subticket ${ticket.id} ist nun im Status: ${ticket.state}`,
                        timestamp: new Date(),
                        dataAfter: parent.toObject()
                    }).save();

                    // Asynchronously trigger bots for the parent
                    const { runBotsForTicket } = require('./bots');
                    runBotsForTicket(parent).catch(e => console.error("Error running bots for parent:", e));
                }
            }
        }

        // Run bots immediately
        await runBotsForTicket(ticket);

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


router.delete('/tickets/:id', verifyToken, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        if (!canDelete(ticket.type, req.user.groups)) {
            return res.status(403).json({ message: 'Not authorized to delete' });
        }

        await Ticket.findByIdAndDelete(req.params.id);
        await Comment.deleteMany({ ticket: req.params.id });
        await Log.deleteMany({ ticket: req.params.id });

        res.json({ message: 'Ticket deleted' });
    } catch (err) {
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
        const { text, silent } = req.body;

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

        // Create Log (if not silent)
        if (!silent) {
            await new Log({
                ticket: ticket._id,
                editor: req.user.username,
                action: 'Kommentar hinzugefügt',
                timestamp: new Date(),
                dataAfter: ticket.toObject() // Snapshot (unchanged, but current state)
            }).save();
        }

        res.status(201).json(comment);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// LIST LOGS
router.get('/logs', verifyToken, async (req, res) => {
    try {
        const user = req.user;
        const workflowEngine = require('./workflow');
        const wfConfig = workflowEngine.getWorkflows();
        const { type, editor, dateFrom, dateTo } = req.query;

        // 1. Get Accessible Ticket IDs (filtered by type if provided)
        let ticketBaseQuery = {};
        if (type) {
            ticketBaseQuery.type = type;
        }

        let finalTicketQuery;
        if (user.groups.includes('Administration')) {
            finalTicketQuery = ticketBaseQuery;
        } else {
            const accessOr = [];
            Object.values(wfConfig).forEach(wf => {
                const readAccess = wf.access ? wf.access.find(a => a.name === 'read') : null;
                if (readAccess && readAccess.groups.some(g => user.groups.includes(g))) {
                    accessOr.push({ type: wf.type });
                }
            });

            accessOr.push({ creator: user.username });
            accessOr.push({ assignee: user.username });

            finalTicketQuery = {
                $and: [
                    ticketBaseQuery,
                    { $or: accessOr }
                ]
            };
        }

        // Fetch only the _id field using lean projection to prevent Out-Of-Memory crashes
        const accessibleDocs = await Ticket.find(finalTicketQuery).select('_id').lean();
        const accessibleTicketIds = accessibleDocs.map(doc => doc._id);

        // 2. Build Log Query
        let logQuery = { ticket: { $in: accessibleTicketIds } };

        if (editor) {
            try {
                const { getUsers } = require('./auth');
                const allUsers = await getUsers();
                const searchRegex = new RegExp(editor, 'i');
                const matchedUsernames = allUsers
                    .filter(u => searchRegex.test(u.username) || searchRegex.test(u.displayName))
                    .map(u => u.username);

                if (matchedUsernames.length > 0) {
                    logQuery.editor = { $in: matchedUsernames };
                } else {
                    logQuery.editor = '___NO_MATCH___';
                }
            } catch (e) {
                logQuery.editor = { $regex: editor, $options: 'i' };
            }
        }

        if (dateFrom || dateTo) {
            logQuery.timestamp = {};
            if (dateFrom) logQuery.timestamp.$gte = new Date(dateFrom);
            if (dateTo) {
                // Set to end of day
                const endDate = new Date(dateTo);
                endDate.setHours(23, 59, 59, 999);
                logQuery.timestamp.$lte = endDate;
            }
        }

        // 3. Fetch Logs
        const logs = await Log.find(logQuery)
            .select('-dataBefore -dataAfter -published')
            .populate('ticket', 'id title type')
            .sort({ timestamp: -1 })
            .limit(100);

        res.json(logs);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// Undo Check
router.get('/tickets/:id/undoable', verifyToken, async (req, res) => {
    try {
        const ticketId = req.params.id;
        const user = req.user;
        const workflowEngine = require('./workflow');
        const wfConfig = workflowEngine.getWorkflows();

        // 1. Fetch Ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // 2. Fetch Latest Log
        const latestLog = await Log.findOne({ ticket: ticketId }).sort({ timestamp: -1 });

        // Checks
        if (!latestLog) return res.json(null); // No actions yet
        if (latestLog.published) return res.json(null); // Already published
        if (latestLog.action.trim().startsWith('Ticket erstellt')) return res.json(null);

        // 3. User undo permission
        const wf = wfConfig[ticket.type];
        if (!wf) return res.json(null);

        const undoAccess = wf.access ? wf.access.find(a => a.name === 'undo') : null;
        if (!undoAccess || !undoAccess.groups.some(g => user.groups.includes(g))) {
            return res.json(null); // User has no undo permission
        }

        // 4. Action ownership/permission check
        // "wenn er die action selbst hätte ausführen können bzw. selbst ausgeführt hat"

        let canUndo = false;
        if (latestLog.editor === user.username) {
            canUndo = true;
        } else {
            // Check if user could have executed this action
            // relying on state BEFORE action
            const stateBefore = latestLog.dataBefore ? latestLog.dataBefore.state : null;
            if (stateBefore) {
                // Find the action definition in that state
                const workflowState = wf.workflow.find(s => s.states.includes(stateBefore));
                if (workflowState) {
                    // The action name is in latestLog.action. 
                    // However, log.action might contain suffixes like " (ButtonName)".
                    // We need to parse or match it loosely, or ideally store actionName separately.
                    // Current Log format: "actionName" or "actionName (ButtonName)" or "Ticket erstellt" or "Kommentar hinzugefügt"



                    // If it was "Ticket erstellt" (creation), can we undo it? 
                    // Usually undo is for transitions. "Ticket erstellt" implies deletion? 
                    // Requirement implies "letzte action", so maybe yes.
                    // But creation access is generic.

                    // Let's matching against available actions in that state.
                    // Note: We don't have exact action ID/name in log if it was formatted.
                    // But usually action starts with...

                    // Simplification: Check if user is in groups allowed for ANY action that matches start of log string?
                    // Or better: We assume standard actions only.

                    const actionName = latestLog.action.split(' (')[0]; // simple heuristic
                    const actionDef = workflowState.actions.find(a => a.name === actionName);

                    if (actionDef) {
                        // Check permissions
                        if (actionDef.groups.some(g => user.groups.includes(g))) canUndo = true;
                        if (actionDef.groups.includes('@creator') && latestLog.dataBefore.creator === user.username) canUndo = true; // Use creator from snapshot
                        if (actionDef.groups.includes('@assignee') && latestLog.dataBefore.assignee === user.username) canUndo = true;
                    }
                }
            }
        }

        if (canUndo) {
            return res.json(latestLog);
        } else {
            return res.json(null);
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// Undo Execute
router.post('/tickets/:id/undo', verifyToken, async (req, res) => {
    try {
        const ticketId = req.params.id;
        const user = req.user;
        const workflowEngine = require('./workflow');
        const wfConfig = workflowEngine.getWorkflows();

        // 1. Fetch Ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

        // 2. Fetch Latest Log
        const latestLog = await Log.findOne({ ticket: ticketId }).sort({ timestamp: -1 });

        // Checks
        if (!latestLog) return res.status(400).json({ message: 'No actions to undo' });
        if (latestLog.published) return res.status(400).json({ message: 'Kann nicht mehr rückgängig gemacht werden' });

        // Ensure no new actions appeared (trivial since we fetched latestLog just now, 
        // effectively checking if "latestLog" IS the one user wants to undo? 
        // User intention is matches if we undo the *current* latest. 
        // If user sees log A, but B happened, doing undo now undoes B.
        // User might be surprised. But current requirement says: "check if... no further action executed".
        // This effectively means "Is this log entry valid for undo?".
        // If we want to be strict, we could pass the log ID we want to undo.
        // But the requirement says "checking ... if no further action". 
        // Implicitly means: Proceed only if the latest log is still undoable.
        // We re-verify permissions on THIS latest log.

        // 3. User undo permission
        const wf = wfConfig[ticket.type];
        if (!wf) return res.status(500).json({ message: 'Workflow config missing' });

        const undoAccess = wf.access ? wf.access.find(a => a.name === 'undo') : null;
        if (!undoAccess || !undoAccess.groups.some(g => user.groups.includes(g))) {
            return res.status(403).json({ message: 'Not authorized to undo' });
        }

        // 4. Action ownership/permission check
        let canUndo = false;
        if (latestLog.editor === user.username) {
            canUndo = true;
        } else {
            const stateBefore = latestLog.dataBefore ? latestLog.dataBefore.state : null;
            if (stateBefore) {
                const workflowState = wf.workflow.find(s => s.states.includes(stateBefore));
                if (workflowState) {
                    const actionName = latestLog.action.split(' (')[0];
                    const actionDef = workflowState.actions.find(a => a.name === actionName);

                    if (actionDef) {
                        if (actionDef.groups.some(g => user.groups.includes(g))) canUndo = true;
                        if (actionDef.groups.includes('@creator') && latestLog.dataBefore.creator === user.username) canUndo = true;
                        if (actionDef.groups.includes('@assignee') && latestLog.dataBefore.assignee === user.username) canUndo = true;
                    }
                }
            }
        }

        if (!canUndo) {
            return res.status(403).json({ message: 'Not authorized to undo this specific action' });
        }

        // 5. Execution
        if (!latestLog.dataBefore) return res.status(400).json({ message: 'No restore data available' });

        // Restore Ticket
        // We must be careful not to overwrite things that shouldn't change (like internal IDs if they were in dataBefore?)
        // dataBefore is a Mongoose object output.
        // Let's replace the fields that matter.
        // Actually, requirement says "dataBefore ... ins ticket übernommen".
        // Simple approach: set all fields from dataBefore.

        const restoreData = latestLog.dataBefore;
        delete restoreData._id; // Ensure we don't overwrite ID (though it should be same)
        delete restoreData.__v;

        // Mongoose 'set' or overwrite
        ticket.set(restoreData);

        // Force the state specifically if it wasn't captured correctly? 
        // dataBefore should have the old state.

        await ticket.save();

        // 6. Delete Log
        await Log.findByIdAndDelete(latestLog._id);

        res.json({ message: 'Undo successful', ticket });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// --- Subscriptions API ---

// Get all subscriptions for the current user
router.get('/settings/subscriptions', verifyToken, async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ userId: req.user.username });
        res.json(subscriptions);
    } catch (error) {
        console.error('[API] Error fetching subscriptions:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Create a new subscription
router.post('/settings/subscriptions', verifyToken, async (req, res) => {
    try {
        const { name, filter } = req.body;
        if (!name || !filter) {
            return res.status(400).json({ message: 'Name and filter are required' });
        }

        const newSubscription = new Subscription({
            userId: req.user.username,
            name: name,
            filter: filter,
            lastMatchingTickets: [] // Initial empty state
        });

        const savedSubscription = await newSubscription.save();
        res.status(201).json(savedSubscription);
    } catch (error) {
        console.error('[API] Error creating subscription:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Delete a subscription
router.delete('/settings/subscriptions/:id', verifyToken, async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        if (subscription.userId !== req.user.username) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Subscription.findByIdAndDelete(req.params.id);
        res.json({ message: 'Subscription deleted' });
    } catch (error) {
        console.error('[API] Error deleting subscription:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// --- CalDAV API ---
router.get('/caldav/availability', verifyToken, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ message: 'Date parameter is required (YYYY-MM-DD)' });
        }

        const fs = require('fs');
        const path = require('path');
        const rrConfigPath = path.join(__dirname, '../../config/raumreservierung.json');
        let allowedRooms = null;
        if (fs.existsSync(rrConfigPath)) {
            const rrConfig = JSON.parse(fs.readFileSync(rrConfigPath, 'utf8'));
            const terminField = rrConfig.fields.find(f => f.type === 'Termin');
            if (terminField && terminField.rooms) {
                allowedRooms = terminField.rooms;
            }
        }

        const { getAllAvailability } = require('./caldav');
        const availability = await getAllAvailability(date, allowedRooms);
        res.json(availability);
    } catch (error) {
        console.error('[API] Error fetching CalDAV availability:', error);
        res.status(500).json({ message: 'Internal Server Error fetching calendars' });
    }
});

// --- Web Push API ---

router.get('/push/public-key', verifyToken, (req, res) => {
    try {
        const { getPublicKey } = require('./utils/push');
        res.status(200).send(getPublicKey());
    } catch (err) {
        console.error('[API] Error getting public key:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

router.post('/push/subscribe', verifyToken, async (req, res) => {
    try {
        const subscription = req.body;
        const PushSubscription = require('./models/pushSubscription');

        // Check if subscription already exists (using endpoint as unique identifier)
        const existing = await PushSubscription.findOne({ 'subscription.endpoint': subscription.endpoint });

        if (existing) {
            // If user changed or we just want to ensure it's up to date
            existing.userId = req.user.username;
            existing.subscription = subscription;
            await existing.save();
            console.log(`[API] Web Push subscription updated for ${req.user.username}`);
            return res.status(200).json({ message: 'Subscription updated' });
        }

        const newSub = new PushSubscription({
            userId: req.user.username,
            subscription: subscription
        });

        await newSub.save();
        console.log(`[API] New Web Push subscription stored for ${req.user.username}`);
        res.status(201).json({ message: 'Subscription saved' });
    } catch (error) {
        console.error('[API] Error saving push subscription:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Attachments
router.use(require('./attachments'));

module.exports = router;
