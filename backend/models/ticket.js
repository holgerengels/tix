const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
    bearbeiter: { type: String, required: true },
    bearbeitet: { type: Date, required: true, default: Date.now },
    text: { type: String }
});

const ticketSchema = new mongoose.Schema({
    typ: { type: String, required: true },
    status: { type: String, required: true, default: 'offen.neu' },
    titel: { type: String, required: true },
    beschreibung: { type: String },
    ersteller: { type: String, required: true },
    erstellt: { type: Date, required: true, default: Date.now },
    log: [entrySchema]
}, { strict: false }); // Allow arbitrary additional fields

module.exports = mongoose.model('Ticket', ticketSchema);
