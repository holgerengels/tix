const auth = require('./auth');
const workflow = require('./workflow');

async function automatisch_genehmigen(ticket) {
  if (ticket.state) return;

  // Get creator's groups
  const users = await auth.getUsers();
  const user = users.find(u => u.username === ticket.creator);

  if (!user) {
    console.log("[HausmeisterBot] No user found for creator:", ticket.creator);
    return;
  }

  // Check if creator is allowed to approve ('genehmigen')
  const wf = workflow.getWorkflowForType(ticket.type);
  const stateBlock = wf.workflow.find(s => s.states.includes(ticket.state));

  console.log("[HausmeisterBot] Found stateblock:", !!stateBlock);

  if (stateBlock) {
    const action = stateBlock.actions.find(a => a.name === 'genehmigen');
    console.log("[HausmeisterBot] Found action:", !!action, "Groups allowed:", action?.groups, "User groups:", user.groups);
    // Check if user is in one of the allowed groups
    if (action && action.groups.some(g => (user.groups || []).includes(g))) {
      ticket.state = 'offen.genehmigt';
      console.log("[HausmeisterBot] State changed to offen.genehmigt");
    }
  }
}

module.exports = {
  automatisch_genehmigen
};