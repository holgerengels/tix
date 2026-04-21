const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cron = require('node-cron');
const Ticket = require('./models/ticket');
const Log = require('./models/log');
const ki = require('./ki');

const CONFIG_DIR = path.join(__dirname, '../../config');
const BOTS = [];

function loadBots() {
    console.log('Loading bots...');
    const files = fs.readdirSync(CONFIG_DIR).filter(file => file.endsWith('.json'));

    files.forEach(file => {
        try {
            const configPath = path.join(CONFIG_DIR, file);
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            if (config.bots && Array.isArray(config.bots)) {
                const baseName = path.basename(file, '.json');
                const scriptPath = path.join(CONFIG_DIR, `${baseName}.js`);

                if (fs.existsSync(scriptPath)) {
                    // Use vm to run script with backend's context (require)
                    console.log(`Loading bot script from ${scriptPath}`);
                    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

                    const sandbox = {
                        require: require,
                        console: console,
                        module: {},
                        exports: {},
                        // Add process if needed, or other globals
                        process: process,
                        path: path,
                        fs: fs,
                        otpauth: require('otpauth'),
                        __dirname: CONFIG_DIR,
                        setTimeout: setTimeout,
                        setInterval: setInterval,
                        clearTimeout: clearTimeout,
                        clearInterval: clearInterval,
                        askKI: ki.askKI
                    };
                    sandbox.module.exports = sandbox.exports;

                    try {
                        vm.createContext(sandbox);
                        vm.runInContext(scriptContent, sandbox);
                        const scriptExports = sandbox.module.exports;

                        config.bots.forEach(botConfig => {
                            if (botConfig.script) {
                                // Compile the script into a function that takes 'ticket' as an argument
                                // We combine the exports from the file with the script string
                                const runFn = async (ticket) => {
                                    // Create a fresh sandbox for each execution to avoid race conditions
                                    const freshContext = {
                                        require: require,
                                        console: console,
                                        process: process,
                                        path: path,
                                        fs: fs,
                                        otpauth: require('otpauth'),
                                        __dirname: CONFIG_DIR,
                                        setTimeout: setTimeout,
                                        setInterval: setInterval,
                                        clearTimeout: clearTimeout,
                                        clearInterval: clearInterval,
                                        askKI: ki.askKI,
                                        ticket: ticket
                                    };

                                    // Copy globally defined functions/variables from the initial script evaluation
                                    Object.keys(sandbox).forEach(key => {
                                        if (!(key in freshContext) && key !== 'module' && key !== 'exports') {
                                            freshContext[key] = sandbox[key];
                                        }
                                    });

                                    try {
                                        vm.createContext(freshContext);
                                        // Wrap script in an async IIFE to support top-level await
                                        const wrappedScript = `(async () => {\n${botConfig.script}\n})()`;
                                        const result = vm.runInContext(wrappedScript, freshContext);
                                        if (result && typeof result.then === 'function') {
                                            await result;
                                        }
                                    } catch (e) {
                                        console.error(`Error running bot script ${botConfig.name}:`, e);
                                        throw e; // Propagate to let caller catch and log it
                                    }
                                };

                                BOTS.push({
                                    name: botConfig.name,
                                    type: config.type,
                                    states: botConfig.states || [],
                                    onChange: botConfig.onChange || 'insync',
                                    schedule: botConfig.schedule || null,
                                    run: runFn
                                });
                                console.log(`Loaded bot: ${botConfig.name} for type ${config.type} with script: ${botConfig.script}`);
                            } else {
                                console.warn(`Bot config missing 'script' property in ${file}: ${botConfig.name}`);
                            }
                        });
                    } catch (scriptErr) {
                        console.error(`Error executing bot script ${scriptPath}:`, scriptErr);
                    }
                } else {
                    console.warn(`Script file ${scriptPath} not found for bot config ${file}`);
                }
            }
        } catch (err) {
            console.error(`Error loading bot config from ${file}:`, err);
        }
    });
}

async function runBots() {
    console.log('Running bots...');
    for (const bot of BOTS) {
        try {
            const tickets = await Ticket.find({
                type: bot.type,
                state: { $in: bot.states }
            });

            for (const ticket of tickets) {
                try {
                    console.log(`Bot ${bot.name} processing ticket ${ticket.id}`);
                    await bot.run(ticket);

                    if (ticket.isModified()) {
                        await ticket.save();
                        console.log(`Ticket ${ticket.id} updated by bot ${bot.name}`);
                    }
                } catch (err) {
                    console.error(`Error in bot ${bot.name} for ticket ${ticket.id}:`, err);
                    try {
                        await new Log({
                            ticket: ticket._id,
                            editor: 'System',
                            action: `Fehler bei Bot-Ausführung '${bot.name}': ${err.message}`,
                            timestamp: new Date()
                        }).save();
                    } catch (logErr) { console.error('Failed to save error log', logErr); }
                }
            }
        } catch (err) {
            console.error(`Error querying tickets for bot ${bot.name}:`, err);
        }
    }
}

async function runBotsForTicket(ticket) {
    const matchingBots = BOTS.filter(bot => bot.type === ticket.type && bot.states.includes(ticket.state));

    const syncBots = matchingBots.filter(bot => bot.onChange === 'insync');
    const asyncBots = matchingBots.filter(bot => bot.onChange === 'async');

    // Run synchronous bots sequentially and await them
    for (const bot of syncBots) {
        try {
            console.log(`Bot ${bot.name} (insync) processing ticket ${ticket.id}`);
            await bot.run(ticket);

            if (ticket.isModified()) {
                await ticket.save();
                console.log(`Ticket ${ticket.id} updated by sync bot ${bot.name}`);
            }
        } catch (err) {
            console.error(`Error in sync bot ${bot.name} for ticket ${ticket.id}:`, err);
            try {
                await new Log({
                    ticket: ticket._id,
                    editor: 'System',
                    action: `Fehler bei Bot-Ausführung '${bot.name}': ${err.message}`,
                    timestamp: new Date()
                }).save();
            } catch (logErr) { console.error('Failed to save error log', logErr); }
        }
    }

    // Run asynchronous bots in the background
    asyncBots.forEach(bot => {
        (async () => {
            try {
                // Fetch a fresh ticket instance for the async bot to avoid version conflicts
                const asyncTicket = await Ticket.findById(ticket._id);
                if (!asyncTicket) return;

                console.log(`Bot ${bot.name} (async) processing ticket ${asyncTicket.id}`);
                await bot.run(asyncTicket);

                if (asyncTicket.isModified()) {
                    await asyncTicket.save();
                    console.log(`Ticket ${asyncTicket.id} updated by async bot ${bot.name}`);
                }
            } catch (err) {
                console.error(`Error in async bot ${bot.name} for ticket ${ticket.id}:`, err);
                try {
                    await new Log({
                        ticket: ticket._id,
                        editor: 'System',
                        action: `Fehler bei Bot-Ausführung '${bot.name}': ${err.message}`,
                        timestamp: new Date()
                    }).save();
                } catch (logErr) { console.error('Failed to save error log', logErr); }
            }
        })();
    });
}

function scheduleBots() {
    console.log('[Bots] Initializing bot schedules');
    BOTS.forEach(bot => {
        if (bot.schedule) {
            if (cron.validate(bot.schedule)) {
                console.log(`[Bots] Scheduling bot ${bot.name} with cron: ${bot.schedule}`);
                cron.schedule(bot.schedule, async () => {
                    console.log(`[Bots] Running scheduled bot ${bot.name}`);
                    try {
                        const tickets = await Ticket.find({
                            type: bot.type,
                            state: { $in: bot.states }
                        });
                        for (const t of tickets) {
                            try {
                                await bot.run(t);
                                if (t.isModified()) {
                                    await t.save();
                                }
                            } catch (err) {
                                console.error(`Error in scheduled bot ${bot.name} for ticket ${t.id}:`, err);
                                try {
                                    await new Log({
                                        ticket: t._id,
                                        editor: 'System',
                                        action: `Fehler bei Bot-Ausführung '${bot.name}': ${err.message}`,
                                        timestamp: new Date()
                                    }).save();
                                } catch (logErr) { console.error('Failed to save error log', logErr); }
                            }
                        }
                    } catch (err) {
                        console.error(`Error querying tickets for scheduled bot ${bot.name}:`, err);
                    }
                });
            } else {
                console.error(`[Bots] Invalid cron schedule for bot ${bot.name}: ${bot.schedule}`);
            }
        }
    });
}

module.exports = { loadBots, runBots, runBotsForTicket, scheduleBots };
