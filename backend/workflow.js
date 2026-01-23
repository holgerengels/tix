const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '../config');
const workflows = {};

const loadWorkflows = () => {
    try {
        const files = fs.readdirSync(configDir);
        files.forEach(file => {
            if (file.endsWith('.json')) {
                const content = fs.readFileSync(path.join(configDir, file), 'utf8');
                const workflow = JSON.parse(content);
                workflows[workflow.type] = workflow;
                console.log(`Loaded workflow: ${workflow.type}`);
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

module.exports = {
    getWorkflows,
    getWorkflowForType,
    getVisibleTicketTypes,
    loadWorkflows
};
