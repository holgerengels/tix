const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
    text: { type: String, required: true },
    creator: { type: String, required: true, lowercase: true },
    created: { type: Date, default: Date.now },
    mentions: { type: [{ type: String, lowercase: true }], default: [] }
});

module.exports = mongoose.model('Comment', CommentSchema);
