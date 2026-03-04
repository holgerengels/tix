const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    filter: { type: mongoose.Schema.Types.Mixed, required: true }, // Store the filter logic 1:1 like in frontend
    lastMatchingTickets: [{
        id: { type: String, required: true },
        state: { type: String, required: true }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
