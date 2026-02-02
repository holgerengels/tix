const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    editor: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    action: { type: String, required: true },
    dataBefore: { type: Object }, // Snapshot of ticket data before action
    dataAfter: { type: Object },   // Snapshot of ticket data after action
    published: { type: Date }     // Internal timestamp for publishing logic
});

module.exports = mongoose.model('Log', logSchema);
