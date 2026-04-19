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

async function raum_erkennung(ticket) {
  if (!ticket.location || ticket.location === 'Kein Raum') {
    const reply = await askKI('Extrahiere den Raum oder Ort aus folgendem Text. Antworte AUSSCHLIESSLICH mit der Raumnummer (z.B. 302) oder Ort (z.B. Aula, Mensa). Wenn kein Ort im Text steht, antworte mit NULL. Text: ' + ticket.title + ' ' + ticket.description);
    const match = reply.trim();
    if (match !== 'NULL' && match !== '') {
      const conf = JSON.parse(fs.readFileSync(__dirname + '/hausmeister.json'));
      const roomOpts = conf.fields.find(f => f.name === 'location').options;
      const found = roomOpts.find(r => r.includes(match) || match.includes(r));
      if (found) ticket.location = found;
    }
  }
}

module.exports = {
  automatisch_genehmigen,
  raum_erkennung
};