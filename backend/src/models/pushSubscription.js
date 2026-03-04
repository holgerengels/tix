const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    subscription: { type: mongoose.Schema.Types.Mixed, required: true }
}, {
    timestamps: true
});

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
