const axios = require('axios');
const Log = require('./models/log');
const path = require('path');
const fs = require('fs');

let settingsPath = path.join(__dirname, '../config/settings.json');
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
    transporter = nodemailer.createTransport(settings.publisher.mail);
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

async function processLogs() {
    try {
        const now = new Date();
        let nextRun = DELAY;

        // Find all logs that are not yet published
        // We need to check explicitly for null or undefined (or missing)
        const unpublishedLogs = await Log.find({
            $or: [
                { published: { $exists: false } },
                { published: null }
            ]
        }).populate('ticket');

        if (unpublishedLogs.length > 0) {
            console.log(`[Publisher] Checking ${unpublishedLogs.length} unpublished logs...`);
        }

        let youngestLogTimestamp = null;

        for (const log of unpublishedLogs) {
            const logTime = new Date(log.timestamp).getTime();
            const age = now.getTime() - logTime;

            if (age >= DELAY) {
                // Publish it
                log.published = now;
                await log.save();

                let message = `Log published: ${log._id}`;
                if (log.ticket) {
                    const ticket = log.ticket;
                    const link = `${BASE_URL}/tickets/${ticket.id}/view`;
                    // Format: Type TicketID Title - wurde von Editor bearbeitet
                    message = `${ticket.type} [${ticket.id}](${link}): ${ticket.title} - wurde von ${log.editor} bearbeitet`;
                }

                try {
                    // NEW: Dynamic Notification based on User Settings
                    const targetUser = log.ticket.creator;
                    const { getUserSettings } = require('./auth');
                    const userSettings = await getUserSettings(targetUser);
                    const notificationUri = userSettings.notificationUri;

                    if (notificationUri) {
                        const [protocol, address] = notificationUri.split(':');

                        // Handle nctalk
                        if (protocol === 'nctalk') {
                            if (address) {
                                await nextcloud(address, message);
                            } else {
                                console.warn(`[Publisher] Invalid nctalk URI: ${notificationUri}`);
                            }
                        }
                        // Handle mailto
                        else if (protocol === 'mailto') {
                            if (address) {
                                await sendMail(address, `Ticket Update: ${log.ticket.title}`, message);
                            } else {
                                console.warn(`[Publisher] Invalid mailto URI: ${notificationUri}`);
                            }
                        }
                        // Unknown
                        else {
                            console.warn(`[Publisher] Unknown notification protocol: ${protocol}`);
                        }
                    } else {
                        console.log(`[Publisher] No notification URI configured for ${targetUser}`);
                    }

                } catch (notifyErr) {
                    console.error('[Publisher] Notification failed:', notifyErr.message);
                }

            } else {
                // Not old enough yet
                // Calculate when it will be old enough
                // timeToPublish = logTime + delayLimit
                // wait = timeToPublish - now
                const wait = (logTime + DELAY) - now.getTime();

                // Track the earliest wakeup time needed (smallest wait > 0)
                if (wait > 0 && wait < nextRun) {
                    nextRun = wait;
                }
            }
        }

        // Ensure we don't wait effectively 0 or negative time if logic was tight, though logic above prevents it mostly.
        // Also ensure we wait at least a little bit to avoid hot loops if something is weird, 
        // e.g. nextRun could be computed as 1ms. 
        if (nextRun < 1000) nextRun = 1000;

        console.log(`[Publisher] Next run in ${Math.round(nextRun / 1000)}s`);
        setTimeout(processLogs, nextRun);

    } catch (err) {
        console.error('[Publisher] Error:', err);
        // Retry after default delay on error
        setTimeout(processLogs, DELAY);
    }
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
function startPublisher() {
    console.log('[Publisher] Starting background publisher service...');
    processLogs();
}

module.exports = { startPublisher };
