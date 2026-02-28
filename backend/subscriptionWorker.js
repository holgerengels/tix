const Subscription = require('./models/subscription');
const Ticket = require('./models/ticket');
const { sendMail, nextcloud } = require('./publisher');
const { getUserSettings } = require('./auth');
const mongoose = require('mongoose');

// Helper to translate frontend-style filter objects into MongoDB queries
// Analogous to how ListView prepares queries or how routes.js handles it.
function buildQueryFromFilter(filter) {
    let query = {};
    if (!filter) return query;

    // Type filter
    if (filter.type && filter.type.length > 0) {
        query.type = Array.isArray(filter.type) ? { $in: filter.type } : filter.type;
    }

    // State filter (handles regexes / startsWith from frontend "offen", "geschlossen")
    if (filter.states && filter.states.length > 0) {
        let stateConditions = [];
        filter.states.forEach(stateGroup => {
            if (stateGroup === 'offen' || stateGroup === 'geschlossen') {
                stateConditions.push({ state: { $regex: `^${stateGroup}` } });
            } else {
                stateConditions.push({ state: stateGroup });
            }
        });
        if (stateConditions.length > 0) {
            query.$or = query.$or ? [...query.$or, ...stateConditions] : stateConditions;
        }
    }

    // Role / Assignee filter
    if (filter.myRole === 'creator') {
        // Needs the userId context injected later
        // query.creator = userId;
    } else if (filter.myRole === 'assignee') {
        // query.assignee = userId;
    }

    // Additional fields like badges
    if (filter.badges && filter.badges.length > 0) {
        // Assume all selected badges must be present (or any, depending on frontend logic)
        // ListView does $in, meaning OR logic for badges
        query.badges = { $in: filter.badges };
    }

    return query;
}

// Ensure the arrays of {id, state} match exactly in contents 
// (order independent comparison)
function isDiff(oldList, newList) {
    if (oldList.length !== newList.length) return true;

    // If lengths are same, check if every item in new is in old with same state
    const oldMap = new Map(oldList.map(item => [item.id, item.state]));

    for (const newItem of newList) {
        if (!oldMap.has(newItem.id) || oldMap.get(newItem.id) !== newItem.state) {
            return true;
        }
    }
    return false;
}

async function runSubscriptionCheck() {
    console.log('[SubscriptionWorker] Starting periodic check...');
    try {
        const subscriptions = await Subscription.find({});

        for (const sub of subscriptions) {
            const query = buildQueryFromFilter(sub.filter);

            // Inject user-specific context into query
            if (sub.filter.myRole === 'creator') {
                query.creator = sub.userId;
            } else if (sub.filter.myRole === 'assignee') {
                query.assignee = sub.userId;
            } else {
                // Even if no predefined 'myRole', if the user filtered explicitly by their own username
                // we just execute the raw query.
            }

            // Fetch matching tickets
            const tickets = await Ticket.find(query, { _id: 1, id: 1, state: 1, title: 1 });

            // Format current result
            const currentTickets = tickets.map(t => ({ id: t.id, state: t.state, title: t.title }));

            // Check for diffs
            if (isDiff(sub.lastMatchingTickets, currentTickets)) {
                console.log(`[SubscriptionWorker] Changes detected for subscription '${sub.name}' (User: ${sub.userId})`);

                // Get user notification preferences
                const userSettings = await getUserSettings(sub.userId);
                const notificationUri = userSettings ? userSettings.notificationUri : null;

                if (notificationUri) {
                    const [protocol, address] = notificationUri.split(':');
                    const message = `Hallo!\nDein Ticket-Abo "${sub.name}" hat Änderungen!\nEs gibt aktuell ${currentTickets.length} zutreffende Tickets in dieser Ansicht.`;

                    try {
                        if (protocol === 'mailto' && address) {
                            await sendMail(address, `Ticket Update: ${sub.name}`, message);
                        } else if (protocol === 'nctalk' && address) {
                            await nextcloud(address, message);
                        } else {
                            console.warn(`[SubscriptionWorker] Unsupported protocol or missing address: ${notificationUri}`);
                        }
                    } catch (notifyErr) {
                        console.error('[SubscriptionWorker] Failed to send notification:', notifyErr.message);
                    }
                } else {
                    console.log(`[SubscriptionWorker] No notification URI for user ${sub.userId}`);
                }

                // Update the state so we don't notify next time if it stays the same
                sub.lastMatchingTickets = currentTickets.map(t => ({ id: t.id, state: t.state }));

                // Avoid parallel version errors
                await Subscription.updateOne(
                    { _id: sub._id },
                    { $set: { lastMatchingTickets: sub.lastMatchingTickets } }
                );
            }
        }
    } catch (error) {
        console.error('[SubscriptionWorker] Error during execution:', error);
    }
    console.log('[SubscriptionWorker] Check completed. Waiting for next cycle.');
}

function startWorker(intervalMs = 60 * 60 * 1000 /* 1 hour */) {
    console.log(`[SubscriptionWorker] Service registered. Interval: ${intervalMs / 1000}s`);
    // Run once immediately (Optional, but good for testing and fast feedback after boot)
    setTimeout(runSubscriptionCheck, 5000);
    setInterval(runSubscriptionCheck, intervalMs);
}

module.exports = { startWorker, runSubscriptionCheck };
