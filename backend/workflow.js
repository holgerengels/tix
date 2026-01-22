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
                workflows[workflow.typ] = workflow;
                console.log(`Loaded workflow: ${workflow.typ}`);
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
    const rule = wf.zugriff.find(z => z.name === 'erstellen');
    if (!rule) return false;
    return rule.gruppen.some(g => userGroups.includes(g));
};

const getVisibleTicketTypes = (userGroups) => {
    return Object.keys(workflows).filter(type => canCreate(type, userGroups));
};

module.exports = {
    getWorkflows,
    getWorkflowForType,
    getVisibleTicketTypes
};
