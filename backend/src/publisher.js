const axios = require('axios');
const Log = require('./models/log');
const path = require('path');
const fs = require('fs');

let settingsPath = path.join(__dirname, '../../config/settings.json');
let settings = {};

try {
    if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(data);
    } else {
        console.warn(`[Publisher] Warning: Settings file not found at ${settingsPath}`);
    }
} catch (err) {
    console.error(`[Publisher] Error reading settings file: ${err.message}`);
}

const BASE_URL = settings.server.url || 'http://localhost:5173';

const NEXTCLOUD_URL = settings.publisher.nextcloud ? settings.publisher.nextcloud.url : '';
const NEXTCLOUD_AUTH = {
    username: settings.publisher.nextcloud ? settings.publisher.nextcloud.username : '',
    password: settings.publisher.nextcloud ? settings.publisher.nextcloud.password : ''
};
const DELAY = (settings.publisher.delay || 1) * 60 * 1000;

if (!BASE_URL || !NEXTCLOUD_URL || !NEXTCLOUD_AUTH.username || !NEXTCLOUD_AUTH.password) {
    console.warn('[Publisher] Warning: Nextcloud configuration is missing or incomplete in settings.json');
}

const nodemailer = require('nodemailer');



// Mail Transporter Setup
let transporter = null;
if (settings.publisher && settings.publisher.mail) {
    let mailOptions = settings.publisher.mail;
    transporter = nodemailer.createTransport(mailOptions);
} else {
    console.warn('[Publisher] Mail configuration missing in settings.json');
}

async function sendMail(to, subject, text) {
    if (!transporter) {
        console.warn('[Publisher] Cannot send mail: No transporter configured');
        return;
    }
    try {
        const info = await transporter.sendMail({
            from: settings.publisher.mail.from, // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            text: text, // plain text body
            // html: "<b>Hello world?</b>", // html body
        });
        console.log(`[Publisher] Mail sent: ${info.messageId}`);
    } catch (error) {
        console.error('[Publisher] Error sending mail:', error);
    }
}

const testNotifications = [];
function getTestNotifications() { return testNotifications; }
function clearTestNotifications() { testNotifications.length = 0; }
function sendTest(targetUser, address, message) {
    testNotifications.push({ targetUser, address, message });
    console.log(`[Publisher] Test notification stored for ${targetUser}`);
}

async function checkUnpublishedLogs() {
    try {
        const now = new Date();
        let nextRun = DELAY;

        // Find all logs that are not yet published
        const unpublishedLogs = await Log.find({
            $and: [
                {
                    $or: [
                        { published: { $exists: false } },
                        { published: null }
                    ]
                },
                { action: { $nin: ['created', 'Ticket erstellt'] } }
            ]
        }).populate('ticket').sort({ timestamp: 1 });

        if (unpublishedLogs.length > 0) {
            console.log(`[Publisher] Checking ${unpublishedLogs.length} unpublished logs...`);
        }

        // Group unpublished logs by ticket
        const logsByTicket = new Map();
        const orphanedLogs = [];

        for (const log of unpublishedLogs) {
            if (!log.ticket) {
                orphanedLogs.push(log);
                continue;
            }
            const ticketKey = log.ticket._id.toString();
            if (!logsByTicket.has(ticketKey)) {
                logsByTicket.set(ticketKey, []);
            }
            logsByTicket.get(ticketKey).push(log);
        }

        // Mark orphaned logs (e.g. deleted tickets) as published immediately
        if (orphanedLogs.length > 0) {
            const orphanIds = orphanedLogs.map(l => l._id);
            await Log.updateMany({ _id: { $in: orphanIds } }, { $set: { published: now } });
        }

        const { getUserSettings } = require('./auth');

        // Process each ticket's bundle of logs
        for (const [ticketId, ticketLogs] of logsByTicket) {
            // Find the most recent log timestamp for this ticket (debounce check)
            const newestLogTime = Math.max(...ticketLogs.map(l => new Date(l.timestamp).getTime()));
            const ageSinceLastChange = now.getTime() - newestLogTime;

            if (ageSinceLastChange < DELAY) {
                // The ticket has recent activity; wait until DELAY has passed since the latest change
                const wait = (newestLogTime + DELAY) - now.getTime();
                if (wait > 0 && wait < nextRun) {
                    nextRun = wait;
                }
                continue;
            }

            // Ticket is ready for publication: mark all its unpublished logs as published
            const logIds = ticketLogs.map(l => l._id);
            await Log.updateMany({ _id: { $in: logIds } }, { $set: { published: now } });

            const ticket = ticketLogs[0].ticket;
            const link = `${BASE_URL}/tickets/${ticket.id}/view`;

            // Identify candidate recipients (creator, assignee, and starredBy users)
            const candidates = new Set();
            if (ticket.creator) candidates.add(ticket.creator);
            if (ticket.assignee) candidates.add(ticket.assignee);
            if (Array.isArray(ticket.starredBy)) {
                for (const u of ticket.starredBy) {
                    if (u) candidates.add(u);
                }
            }

            for (const targetUser of candidates) {
                // Filter out actions performed by targetUser themselves
                const relevantLogs = ticketLogs.filter(l => l.editor !== targetUser);
                if (relevantLogs.length === 0) {
                    continue; // targetUser did all these edits themselves
                }

                const editors = [...new Set(relevantLogs.map(l => l.editor))].join(', ');

                let message;
                let pushBody;

                if (relevantLogs.length === 1) {
                    const l = relevantLogs[0];
                    const actionInfo = l.action && l.action !== 'state_changed' ? ` (${l.action})` : '';
                    message = `${ticket.type} [${ticket.id}](${link}): ${ticket.title} - wurde von ${l.editor} bearbeitet${actionInfo}`;
                    pushBody = `${ticket.id}: Wurde von ${l.editor} bearbeitet${actionInfo}`;
                } else {
                    const actionBullets = relevantLogs.map(l => `• ${l.action || 'Bearbeitet'} (${l.editor})`).join('\n');
                    message = `${ticket.type} [${ticket.id}](${link}): ${ticket.title}\n${relevantLogs.length} Änderungen von ${editors}:\n${actionBullets}`;
                    pushBody = `${ticket.id}: ${relevantLogs.length} Änderungen von ${editors}`;
                }

                try {
                    const userSettings = await getUserSettings(targetUser);
                    const notificationUri = userSettings?.notificationUri;

                    if (notificationUri) {
                        const uris = notificationUri.split(',').map(s => s.trim()).filter(Boolean);

                        for (const targetUri of uris) {
                            const [protocol, address] = targetUri.split(':');

                            if (protocol === 'nctalk') {
                                if (address) {
                                    await nextcloud(address, message);
                                } else {
                                    console.warn(`[Publisher] Invalid nctalk URI: ${targetUri}`);
                                }
                            } else if (protocol === 'mailto') {
                                if (address) {
                                    await sendMail(address, `Ticket Update: ${ticket.title}`, message);
                                } else {
                                    console.warn(`[Publisher] Invalid mailto URI: ${targetUri}`);
                                }
                            } else if (protocol === 'test') {
                                sendTest(targetUser, address, message);
                            } else {
                                console.warn(`[Publisher] Unknown notification protocol: ${protocol}`);
                            }
                        }
                    } else {
                        console.log(`[Publisher] No notification URI configured for ${targetUser}`);
                    }

                    // Web Push Notification (1 per ticket bundle)
                    await sendPush(targetUser, {
                        title: `Ticket Update: ${ticket.title}`,
                        body: pushBody,
                        url: `/tickets/${ticket.id}/view`
                    });

                } catch (notifyErr) {
                    console.error(`[Publisher] Notification to ${targetUser} failed:`, notifyErr.message);
                }
            }
        }

        if (nextRun < 1000) nextRun = 1000;
        return nextRun;

    } catch (err) {
        console.error('[Publisher] Error in checkUnpublishedLogs:', err);
        return DELAY;
    }
}

async function processLogs() {
    const nextRun = await checkUnpublishedLogs();
    console.log(`[Publisher] Next run in ${Math.round(nextRun / 1000)}s`);
    setTimeout(processLogs, nextRun);
}

// Nextcloud benötigt zwingend diesen Header für API Calls
const HEADERS = {
    'OCS-APIRequest': 'true',
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

async function nextcloud(targetUserId, message) {
    try {
        // SCHRITT 1: Raum erstellen / finden
        // WICHTIG: '?format=json' an die URL hängen!
        // Upgrade to v4 API
        const createRoomUrl = `${NEXTCLOUD_URL}/ocs/v2.php/apps/spreed/api/v4/room?format=json`;

        const roomData = {
            invite: targetUserId,
            roomType: 1,
            roomName: 'Backend Bot'
        };

        const roomResponse = await axios.post(createRoomUrl, roomData, {
            auth: NEXTCLOUD_AUTH,
            headers: HEADERS
        });

        // Token extrahieren
        const roomToken = roomResponse.data.ocs.data.token;
        console.log(`Chatraum Token: ${roomToken}`);

        // SCHRITT 2: Nachricht senden
        const sendUrl = `${NEXTCLOUD_URL}/ocs/v2.php/apps/spreed/api/v1/chat/${roomToken}?format=json`;

        const messageData = {
            message: message
        };

        await axios.post(sendUrl, messageData, {
            auth: NEXTCLOUD_AUTH,
            headers: HEADERS
        });

        console.log(`Nachricht an ${targetUserId} gesendet! ✅`);

    } catch (error) {
        console.error('FEHLER:');
        if (error.response) {
            // Zeigt die genaue Antwort von Nextcloud, falls es wieder crasht
            console.error('Status:', error.response.status);
            console.error('Daten:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
    }
}
async function sendPush(userId, payloadObj) {
    try {
        const { webpush } = require('./utils/push');
        const PushSubscription = require('./models/pushSubscription');
        const pushSubs = await PushSubscription.find({ userId });

        if (pushSubs.length > 0) {
            console.log(`[Publisher] Found ${pushSubs.length} push subscriptions for user ${userId}. Sending push notifications...`);
        } else {
            return;
        }

        const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
        let pushOptions = {};
        if (proxyUrl) {
            // web-push handles the internal instantiation. 
            // Passing the agent explicitly fails the instanceof https.Agent validation inside web-push.
            pushOptions.proxy = proxyUrl;
        }

        const payload = JSON.stringify(payloadObj);

        for (const pushSub of pushSubs) {
            try {
                const response = await webpush.sendNotification(pushSub.subscription, payload, pushOptions);
                console.log(`[Publisher] Push notification sent successfully to ${userId} (Endpoint: ${pushSub.subscription.endpoint.substring(0, 50)}...). Status: ${response.statusCode}`);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    console.log(`[Publisher] Push subscription for ${userId} expired (Status ${error.statusCode}). Removing endpoint: ${pushSub.subscription.endpoint.substring(0, 50)}...`);
                    await PushSubscription.deleteOne({ _id: pushSub._id });
                } else {
                    console.error(`[Publisher] Error sending push notification to ${userId} (Endpoint: ${pushSub.subscription.endpoint.substring(0, 50)}...):`, error.message, error.statusCode ? `(Status: ${error.statusCode})` : '', error.body ? error.body : '');
                }
            }
        }
    } catch (pushErr) {
        console.error('[Publisher] Web Push notification setup failed:', pushErr.message);
    }
}

function startPublisher() {
    console.log('[Publisher] Starting background publisher service...');
    processLogs();
}

module.exports = { startPublisher, sendMail, nextcloud, checkUnpublishedLogs, getTestNotifications, clearTestNotifications, sendPush, sendTest };
