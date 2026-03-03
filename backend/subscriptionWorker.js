const Subscription = require('./models/subscription');
const Ticket = require('./models/ticket');
const { sendMail, nextcloud, getTestNotifications } = require('./publisher');
const { getUserSettings, getUsers } = require('./auth');
const workflowEngine = require('./workflow');
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

    // Additional fields like badges
    if (filter.badges && filter.badges.length > 0) {
        // Assume all selected badges must be present (or any, depending on frontend logic)
        // ListView does $in, meaning OR logic for badges
        query.badges = { $in: filter.badges };
    }

    if (filter.creator) {
        query.creator = { $regex: filter.creator, $options: 'i' };
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
        const users = await getUsers();
        const allWorkflows = workflowEngine.getWorkflows();

        for (const sub of subscriptions) {
            const query = buildQueryFromFilter(sub.filter);

            // Inject assignment filter logic
            if (sub.filter.assignmentType) {
                const user = users.find(u => u.username === sub.userId);
                const userGroups = user ? user.groups : [];

                if (sub.filter.assignmentType === 'personal') {
                    query.assignee = sub.userId;
                } else if (sub.filter.assignmentType === 'group') {
                    const conditions = [];

                    Object.values(allWorkflows).forEach(wf => {
                        // Apply filter type if present
                        if (sub.filter.type && sub.filter.type.length > 0) {
                            const typeArr = Array.isArray(sub.filter.type) ? sub.filter.type : [sub.filter.type];
                            if (!typeArr.includes(wf.type)) return;
                        }

                        if (wf.workflow) {
                            wf.workflow.forEach(state => {
                                const releavantActions = (state.actions || []).filter(action => {
                                    if (action.optional) return false;
                                    const hasGroupAccess = action.groups.some(g => userGroups.includes(g));
                                    const hasAssigneeAccess = action.groups.includes('@assignee');
                                    return hasGroupAccess || hasAssigneeAccess;
                                });

                                if (releavantActions.length > 0) {
                                    const condition = { type: wf.type, state: { $in: state.states } };
                                    if (releavantActions.some(a => a.groups.some(g => userGroups.includes(g)))) {
                                        conditions.push(condition);
                                    } else if (releavantActions.some(a => a.groups.includes('@assignee'))) {
                                        conditions.push({ ...condition, assignee: sub.userId });
                                    }
                                }
                            });
                        }
                    });

                    if (conditions.length > 0) {
                        if (query.$or) {
                            query.$and = [{ $or: query.$or }, { $or: conditions }];
                            delete query.$or;
                        } else {
                            query.$or = conditions;
                        }
                    } else {
                        // User has no group assignments matching this filter
                        query.assignee = sub.userId;
                    }
                }
            }

            // Fetch matching tickets
            console.log(`[SubscriptionWorker] Query for ${sub.userId} / ${sub.name}:`, JSON.stringify(query));
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
                        } else if (protocol === 'test' && address) {
                            getTestNotifications().push({ targetUser: sub.userId, address, message });
                            console.log(`[SubscriptionWorker] Test notification stored for ${sub.userId}`);
                        } else {
                            console.warn(`[SubscriptionWorker] Unsupported protocol or missing address: ${notificationUri}`);
                        }
                    } catch (notifyErr) {
                        console.error('[SubscriptionWorker] Failed to send notification:', notifyErr.message);
                    }
                } else {
                    console.log(`[SubscriptionWorker] No notification URI for user ${sub.userId}`);
                }

                // NEW: Web Push Notifications
                try {
                    const { webpush } = require('./utils/push');
                    const PushSubscription = require('./models/pushSubscription');
                    const pushSubs = await PushSubscription.find({ userId: sub.userId });

                    const payload = JSON.stringify({
                        title: `Ticket-Abo: ${sub.name}`,
                        body: `Es gibt aktuell ${currentTickets.length} zutreffende Tickets in dieser Ansicht.`,
                        // In Frontend router, we use ?filter=... depending on the subscription logic, 
                        // but a generic link to the home page or specific sub-filter is fine.
                        // Ideally we could pass the actual JSON filter, but that's complex to stringify in a URL reliably.
                        // Let's bring them to the root so they see their tickets.
                        url: `/?filter=all`
                    });

                    for (const pushSub of pushSubs) {
                        try {
                            await webpush.sendNotification(pushSub.subscription, payload);
                        } catch (error) {
                            if (error.statusCode === 410 || error.statusCode === 404) {
                                console.log(`[SubscriptionWorker] Subscription for ${sub.userId} expired. Removing.`);
                                await PushSubscription.deleteOne({ _id: pushSub._id });
                            } else {
                                console.error(`[SubscriptionWorker] Error sending push notification:`, error);
                            }
                        }
                    }
                } catch (pushErr) {
                    console.error('[SubscriptionWorker] Web Push notification failed:', pushErr.message);
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

function startWorker() {
    console.log(`[SubscriptionWorker] Service initialized. Handled by unified scheduler.`);
}

module.exports = { startWorker, runSubscriptionCheck };
