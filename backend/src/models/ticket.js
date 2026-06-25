const mongoose = require('mongoose');



const ticketSchema = new mongoose.Schema({
    type: { type: String, required: true },
    id: { type: String }, // Human readable ID e.g. ABW-1001
    state: { type: String, required: true, default: 'offen.neu' },
    title: { type: String, required: true },
    description: { type: String },
    creator: { type: String, required: true },
    created: { type: Date, required: true, default: Date.now },
    assignee: { type: String },
    assigned: { type: Date },
    badges: { type: [String], default: [] },
    parentTicket: { type: String, index: true },
    summary: { type: String }
}, {
    strict: false,
    timestamps: { createdAt: 'created', updatedAt: 'updated' }
}); // Allow arbitrary additional fields

module.exports = mongoose.model('Ticket', ticketSchema);
