const User = require('./models/user');
const Subscription = require('./models/subscription');
const PushSubscription = require('./models/pushSubscription');
const auth = require('./auth');
const fs = require('fs');
const path = require('path');

// Read settings
let settings = {};
try {
    const settingsPath = path.join(__dirname, '../../config/settings.json');
    if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
} catch (e) {
    console.error('[UserPruningWorker] Error loading settings:', e);
}

const RETENTION_DAYS = (settings.server && settings.server.usersync && settings.server.usersync.retentionDays) !== undefined
    ? settings.server.usersync.retentionDays
    : 30;

async function runUserPruningCheck() {
    console.log('[UserPruningWorker] Starting user pruning check...');

    // Pruner runs in production/LDAP mode.
    // In DevMode, we skip it as there's no real LDAP server to prune against.
    if (auth.isDevMode()) {
        console.log('[UserPruningWorker] DevMode is enabled. Skipping user pruning check.');
        return;
    }

    try {
        // Fetch all active users directly from LDAP (forceFetch = true)
        const ldapUsers = await auth.getUsers([], true);
        if (!ldapUsers || ldapUsers.length === 0) {
            console.warn('[UserPruningWorker] No users retrieved from LDAP. Aborting pruning to prevent accidental deletions.');
            return;
        }

        const ldapUsernames = new Set(ldapUsers.map(u => u.username.toLowerCase()));
        const mongoUsers = await User.find({});

        const now = new Date();
        const threshold = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

        let updatedCount = 0;
        let prunedCount = 0;

        for (const mongoUser of mongoUsers) {
            const username = mongoUser.username.toLowerCase();
            if (ldapUsernames.has(username)) {
                // User is still present in LDAP. Keep their lastSeenInLdap updated
                mongoUser.lastSeenInLdap = now;
                await mongoUser.save();
                updatedCount++;
            } else {
                // User is missing from LDAP. Check if grace period is expired
                const lastSeen = mongoUser.lastSeenInLdap || mongoUser.updatedAt || mongoUser.createdAt || now;
                if (lastSeen < threshold) {
                    console.log(`[UserPruningWorker] Pruning user ${mongoUser.username} (last seen in LDAP: ${lastSeen})`);
                    
                    // Cascading delete user and their subscriptions
                    await User.deleteOne({ _id: mongoUser._id });
                    await Subscription.deleteMany({ userId: mongoUser.username });
                    await PushSubscription.deleteMany({ userId: mongoUser.username });
                    
                    prunedCount++;
                } else {
                    console.log(`[UserPruningWorker] User ${mongoUser.username} is missing from LDAP, but retention grace period has not expired. Last seen: ${lastSeen}`);
                }
            }
        }

        console.log(`[UserPruningWorker] Pruning check complete. Updated ${updatedCount} users. Pruned ${prunedCount} users.`);
    } catch (err) {
        console.error('[UserPruningWorker] Error running user pruning check:', err);
    }
}

module.exports = { runUserPruningCheck };
