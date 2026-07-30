const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String },
    employeeId: { type: String, default: '' },
    groups: { type: [String], default: [] },
    notificationUri: { type: String, default: '' },
    savedFilters: {
        type: Map,
        of: [mongoose.Schema.Types.Mixed],
        default: {}
    },
    substitutedBy: { type: [String], default: [] },
    lastSeenInLdap: { type: Date, default: Date.now }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
