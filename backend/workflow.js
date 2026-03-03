const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '../config');
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

const canCreate = (type, userGroups) => {
    const wf = workflows[type];
    if (!wf) return false;
    const rule = wf.access.find(z => z.name === 'create');
    if (!rule) return false;
    return rule.groups.some(g => userGroups.includes(g));
};

const getVisibleTicketTypes = (userGroups) => {
    return Object.keys(workflows).filter(type => canCreate(type, userGroups));
};

const canComment = (type, userGroups) => {
    const wf = workflows[type];
    if (!wf) return false;
    // Default to strict: explicit comment permission required
    const rule = wf.access.find(z => z.name === 'comment');
    if (!rule) return false;
    return rule.groups.some(g => userGroups.includes(g));
};

const canEdit = (type, userGroups) => {
    if (userGroups.includes('Administration')) return true;
    const wf = workflows[type];
    if (!wf) return false;
    const rule = wf.access.find(z => z.name === 'edit');
    if (!rule) return false;
    return rule.groups.some(g => userGroups.includes(g));
};

const canDelete = (type, userGroups) => {
    if (userGroups.includes('Administration')) return true;
    const wf = workflows[type];
    if (!wf) return false;
    const rule = wf.access.find(z => z.name === 'delete');
    if (!rule) return false;
    return rule.groups.some(g => userGroups.includes(g));
};

module.exports = {
    getWorkflows,
    getWorkflowForType,
    getVisibleTicketTypes,
    loadWorkflows,
    canComment,
    canEdit,
    canDelete
};
