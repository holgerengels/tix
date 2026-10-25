const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '../../config');
const workflows = {};

const loadWorkflows = () => {
    try {
        const files = fs.readdirSync(configDir);

        // 1. Load default config
        let defaultFields = [];
        if (files.includes('default.json')) {
            const defaultContent = fs.readFileSync(path.join(configDir, 'default.json'), 'utf8');
            try {
                const defaultConfig = JSON.parse(defaultContent);
                if (defaultConfig.fields) {
                    defaultFields = defaultConfig.fields;
                }
            } catch (e) {
                console.error('Error parsing default.json:', e);
            }
        }

        files.forEach(file => {
            if (file.endsWith('.json') && file !== 'default.json' && file !== 'settings.json' && file !== 'vapid.json') {
                const content = fs.readFileSync(path.join(configDir, file), 'utf8');
                try {
                    const workflow = JSON.parse(content);

                    // 2. Merge fields: Standard fields first, then specific fields
                    // Using a map to allow overriding standard fields if needed (by name)
                    const fieldMap = new Map();
                    defaultFields.forEach(f => fieldMap.set(f.name, f));
                    if (workflow.fields) {
                        workflow.fields.forEach(f => {
                            if (fieldMap.has(f.name)) {
                                // Merge with existing standard field
                                fieldMap.set(f.name, { ...fieldMap.get(f.name), ...f });
                            } else {
                                // New field
                                fieldMap.set(f.name, f);
                            }
                        });
                    }
                    workflow.fields = Array.from(fieldMap.values());

                    workflow.file = file;
                    workflows[workflow.type] = workflow;
                    console.log(`Loaded workflow: ${workflow.type}`);
                } catch (e) {
                    console.error(`Error parsing ${file}:`, e);
                }
            }
        });
    } catch (err) {
        console.error('Error loading workflows:', err);
    }
};

loadWorkflows();

const getWorkflows = () => workflows;

const getWorkflowForType = (type) => workflows[type];

// Administration may do everything (access rules, workflow actions, undo).
const isAdmin = (userGroups) => (userGroups || []).includes('Administration');

// Generic access check against the workflow's `access` rule `name` (create, read, edit, delete, comment, undo).
// Missing workflows or rules deny access.
const hasAccess = (type, name, userGroups = []) => {
    if (isAdmin(userGroups)) return true;
    const rule = workflows[type]?.access?.find(z => z.name === name);
    return !!rule && (rule.groups || []).some(g => userGroups.includes(g));
};

const canCreate = (type, userGroups) => hasAccess(type, 'create', userGroups);
const canRead = (type, userGroups) => hasAccess(type, 'read', userGroups);
const canEdit = (type, userGroups) => hasAccess(type, 'edit', userGroups);
const canDelete = (type, userGroups) => hasAccess(type, 'delete', userGroups);
const canComment = (type, userGroups) => hasAccess(type, 'comment', userGroups);
const canUndo = (type, userGroups) => hasAccess(type, 'undo', userGroups);

const getVisibleTicketTypes = (userGroups) => {
    return Object.keys(workflows).filter(type => canCreate(type, userGroups));
};

// Checks whether a user matches an action's groups (incl. dynamic roles @creator / @assignee).
// `ticket` may also be a log snapshot (e.g. dataBefore).
const matchesActionGroups = (groups, ticket, user) => {
    const userGroups = user.groups || [];
    if (isAdmin(userGroups)) return true;
    return (groups || []).some(g => {
        if (g === '@creator') return ticket.creator === user.username;
        if (g === '@assignee') return ticket.assignee === user.username;
        return userGroups.includes(g);
    });
};

// Read access to a single ticket (and thus its comments, logs and attachments).
// Note: starredBy is a mere bookmark and deliberately grants NO read access.
const canReadTicket = (ticket, user) => {
    if (ticket.creator === user.username) return true;
    if (ticket.assignee === user.username) return true;
    return canRead(ticket.type, user.groups || []);
};

module.exports = {
    getWorkflows,
    getWorkflowForType,
    getVisibleTicketTypes,
    loadWorkflows,
    isAdmin,
    hasAccess,
    canCreate,
    canComment,
    canEdit,
    canDelete,
    canRead,
    canUndo,
    canReadTicket,
    matchesActionGroups
};

