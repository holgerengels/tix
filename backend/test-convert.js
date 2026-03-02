const mongoose = require('mongoose');
const tSchema = new mongoose.Schema({ type: String, description: String }, { strict: false });
const Ticket = mongoose.model('TestTicket', tSchema);
const ticket = new Ticket({ type: 'Stundenplan', description: 'desc', day: 'Mo', lessons: { min: 1, max: 2 } });
const { convert } = require('../config/stundenplan.js');
try {
  convert(ticket);
  console.log("Success! description:", ticket.description);
} catch (err) {
  console.error("Error:", err);
}
