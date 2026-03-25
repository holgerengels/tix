const mongoose = require('mongoose');
const Ticket = require('../src/models/ticket');
const workflowEngine = require('../src/workflow');

mongoose.connect('mongodb://admin:password@localhost:27017/tickets?authSource=admin').then(async () => {
    workflowEngine.loadWorkflows();
    const req = { user: { username: 'schulleiter', groups: ['Schulleitung'] } };
    
    let ticket = new Ticket({
        id: 'AUV-99',
        title: 'Testausflug',
        type: 'Außerunterrichtliche Veranstaltung',
        state: 'offen.neu',
        creator: 'lehrer1',
        dateFrom: new Date('2026-04-10'),
        dateUntil: new Date('2026-04-12'),
        location: 'Berlin',
        colleaguesAgree: true,
        acrossDepartments: true,
        assignee: 'schulleiter'
    });
    
    const wf = workflowEngine.getWorkflowForType(ticket.type);
    const { validateTicket } = require('../src/validation');
    
    const scriptToRun = "ticket.state = 'offen.genehmigt'";
    const vm = require('vm');
    const sandbox = { ticket, evaluateTemplate: require('../src/validation').evaluateTemplate, currentWorkflow: wf };
    vm.createContext(sandbox);
    try {
        vm.runInContext(scriptToRun, sandbox);
        console.log("State after script:", ticket.state);
    } catch(e) {
        console.error("Script error:", e);
    }
    
    const validationResult = validateTicket(ticket.toObject(), wf, null, req.user);
    console.log("Validation Result:", JSON.stringify(validationResult, null, 2));
    
    process.exit(0);
});
