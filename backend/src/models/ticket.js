const mongoose = require('mongoose');

const LINK_TYPES = ['follows', 'duplicates', 'relates'];

const linkSchema = new mongoose.Schema({
    type: { type: String, enum: LINK_TYPES, required: true },
    ticket: { type: String, required: true }, // Human readable ID of the target
    created: { type: Date, default: Date.now },
    creator: { type: String }
}, { _id: false });

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
    starredBy: [{ type: String, index: true }],
    badges: { type: [String], default: [] },
    parentTicket: { type: String, index: true },
    // Directed, non-hierarchical relations. Stored only on the source ticket;
    // the inverse direction is derived at read time via { 'links.ticket': id }.
    //   follows    - this ticket continues (reopens) the target
    //   duplicates - this ticket is a duplicate of the target
    //   relates    - generic (symmetric) relation
    links: { type: [linkSchema], default: undefined },
    summary: { type: String }
}, {
    strict: false,
    timestamps: { createdAt: 'created', updatedAt: 'updated' }
}); // Allow arbitrary additional fields

ticketSchema.index({ 'links.ticket': 1 });

module.exports = mongoose.model('Ticket', ticketSchema);
