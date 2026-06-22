const { loadBots, runBots, scheduleBots } = require('./bots');
const { runSubscriptionCheck } = require('./subscriptionWorker');
const { checkUnpublishedLogs } = require('./publisher');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

let settingsPath = path.join(__dirname, '../../config/settings.json');
let settings = {};

try {
    if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(data);
    }
} catch (err) {
    console.error(`[Scheduler] Error reading settings file: ${err.message}`);
}

const SUBSCRIPTION_SCHEDULE = (settings.scheduler && settings.scheduler.subscriptionSchedule)
    ? settings.scheduler.subscriptionSchedule : '0 * * * *'; // default to top of every hour

const PUBLISHER_INTERVAL = (settings.scheduler && settings.scheduler.publisherInterval)
    ? settings.scheduler.publisherInterval * 1000 : 60 * 1000; // 60s

const USER_PRUNING_SCHEDULE = (settings.server && settings.server.usersync && settings.server.usersync.pruningSchedule)
    ? settings.server.usersync.pruningSchedule : '0 3 * * *'; // default to daily at 3 AM

// We no longer loop bots globally here; they have their own cron schedules in `bots.js`.

function scheduleSubscriptions() {
    if (cron.validate(SUBSCRIPTION_SCHEDULE)) {
        console.log(`[Scheduler] Scheduling subscriptions with cron: ${SUBSCRIPTION_SCHEDULE}`);
        cron.schedule(SUBSCRIPTION_SCHEDULE, async () => {
            console.log('[Scheduler] Running scheduled subscription check');
            try {
                await runSubscriptionCheck();
            } catch (err) {
                console.error('[Scheduler] Error running subscription check:', err);
            }
        });
    } else {
        console.error(`[Scheduler] Invalid cron schedule for subscriptions: ${SUBSCRIPTION_SCHEDULE}`);
    }
}

function scheduleUserPruning() {
    if (cron.validate(USER_PRUNING_SCHEDULE)) {
        console.log(`[Scheduler] Scheduling user pruning with cron: ${USER_PRUNING_SCHEDULE}`);
        cron.schedule(USER_PRUNING_SCHEDULE, async () => {
            console.log('[Scheduler] Running scheduled user pruning check');
            try {
                const { runUserPruningCheck } = require('./userPruningWorker');
                await runUserPruningCheck();
            } catch (err) {
                console.error('[Scheduler] Error running user pruning:', err);
            }
        });
    } else {
        console.error(`[Scheduler] Invalid cron schedule for user pruning: ${USER_PRUNING_SCHEDULE}`);
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
    console.log(`[Scheduler] Subscriptions schedule: ${SUBSCRIPTION_SCHEDULE}`);
    console.log(`[Scheduler] Publisher interval (max): ${PUBLISHER_INTERVAL / 1000}s`);

    // Initialize logic and load configs
    loadBots();

    // Start schedules
    scheduleBots();
    scheduleSubscriptions();
    scheduleUserPruning();
    setTimeout(schedulePublisher, 7000);
}

module.exports = { startScheduler };
