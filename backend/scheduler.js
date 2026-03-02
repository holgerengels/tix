const { loadBots, runBots } = require('./bots');
const { runSubscriptionCheck } = require('./subscriptionWorker');
const { checkUnpublishedLogs } = require('./publisher');
const path = require('path');
const fs = require('fs');

let settingsPath = path.join(__dirname, '../config/settings.json');
let settings = {};

try {
    if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(data);
    }
} catch (err) {
    console.error(`[Scheduler] Error reading settings file: ${err.message}`);
}

// Default intervals if not specified in config
const BOTS_INTERVAL = (settings.scheduler && settings.scheduler.botsInterval)
    ? settings.scheduler.botsInterval * 1000 : 60 * 1000; // 60s

const SUBSCRIPTION_INTERVAL = (settings.scheduler && settings.scheduler.subscriptionInterval)
    ? settings.scheduler.subscriptionInterval * 1000 : 60 * 60 * 1000; // 1h

const PUBLISHER_INTERVAL = (settings.scheduler && settings.scheduler.publisherInterval)
    ? settings.scheduler.publisherInterval * 1000 : 60 * 1000; // 60s

async function scheduleBots() {
    try {
        await runBots();
    } catch (err) {
        console.error('[Scheduler] Error running bots:', err);
    } finally {
        setTimeout(scheduleBots, BOTS_INTERVAL);
    }
}

async function scheduleSubscriptions() {
    try {
        await runSubscriptionCheck();
    } catch (err) {
        console.error('[Scheduler] Error running subscription check:', err);
    } finally {
        setTimeout(scheduleSubscriptions, SUBSCRIPTION_INTERVAL);
    }
}

async function schedulePublisher() {
    let nextRun = PUBLISHER_INTERVAL;
    try {
        // checkUnpublishedLogs returns the time until the next log needs publishing.
        // We use that as a dynamic sleep, bounded by our default PUBLISHER_INTERVAL.
        // If the dynamic wait is smaller than our default interval and > 1s, we use it.
        const dynamicWait = await checkUnpublishedLogs();
        if (dynamicWait >= 1000 && dynamicWait < PUBLISHER_INTERVAL) {
            nextRun = dynamicWait;
        }
    } catch (err) {
        console.error('[Scheduler] Error running publisher check:', err);
    } finally {
        setTimeout(schedulePublisher, nextRun);
    }
}

function startScheduler() {
    console.log(`[Scheduler] Starting central background scheduler...`);
    console.log(`[Scheduler] Bots interval: ${BOTS_INTERVAL / 1000}s`);
    console.log(`[Scheduler] Subscriptions interval: ${SUBSCRIPTION_INTERVAL / 1000}s`);
    console.log(`[Scheduler] Publisher interval (max): ${PUBLISHER_INTERVAL / 1000}s`);

    // Initialize standard dependencies like loadBots
    loadBots();

    // Start the loops (wait a few seconds before first run to let server settle)
    setTimeout(scheduleBots, 5000);
    setTimeout(scheduleSubscriptions, 6000);
    setTimeout(schedulePublisher, 7000);
}

module.exports = { startScheduler };
