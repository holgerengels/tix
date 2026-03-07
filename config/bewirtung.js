const auth = require('./auth');
const workflow = require('./workflow');

async function automatisch_genehmigen(ticket) {
  if (ticket.state !== 'offen.neu') return;

  const users = await auth.getUsers();
  const user = users.find(u => u.username === ticket.creator);

  if (!user) {
    return;
  }

  const wf = workflow.getWorkflowForType(ticket.type);
  const stateBlock = wf.workflow.find(s => s.states.includes(ticket.state));

  if (stateBlock) {
    const action = stateBlock.actions.find(a => a.name === 'genehmigen');
    if (action && action.groups.some(g => (user.groups || []).includes(g))) {
      ticket.state = 'offen.genehmigt';
    }
  }
}

module.exports = {
  automatisch_genehmigen
};