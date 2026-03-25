const mongoose = require('mongoose');
const Ticket = require('../src/models/ticket');
const Log = require('../src/models/log');

mongoose.connect('mongodb://admin:password@localhost:27017/tickets?authSource=admin')
  .then(() => Ticket.find().sort({created: -1}).limit(5))
  .then(tickets => {
    console.log("LAST TICKETS:", tickets.map(t => ({ id: t.id, type: t.type, state: t.state, assignee: t.assignee })));
    return Log.find().sort({timestamp: -1}).limit(5).populate('ticket');
  })
  .then(logs => {
    console.log("LAST LOGS:", logs.map(l => ({ ticketId: l.ticket?.id, editor: l.editor, action: l.action, time: l.timestamp })));
    process.exit(0);
  });
