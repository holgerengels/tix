const mongoose = require('mongoose');
const Ticket = require('./backend/src/models/ticket');
const Log = require('./backend/src/models/log');
const Comment = require('./backend/src/models/comment');

mongoose.connect('mongodb://localhost:27017/tix')
  .then(async () => {
    // Search for ticket creator containing 'simon'
    const tickets = await Ticket.find({ creator: /simon/i }).lean();
    console.log(`Found ${tickets.length} tickets for someone named simon.`);
    
    for (const t of tickets) {
      console.log(`- ID: ${t._id}, Type: ${t.type}, Title: ${t.title}, Creator: ${t.creator}`);
    }
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
