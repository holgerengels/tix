const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    ticket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true },
    text: { type: String, required: true },
    creator: { type: String, required: true },
    created: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', CommentSchema);
