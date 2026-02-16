const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Ticket = require('./models/ticket');

const CONFIG_DIR = path.join(__dirname, '../config');
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
                        setTimeout: setTimeout,
                        setInterval: setInterval,
                        clearTimeout: clearTimeout,
                        clearInterval: clearInterval
                    };
                    sandbox.module.exports = sandbox.exports;

                    try {
                        vm.createContext(sandbox);
                        vm.runInContext(scriptContent, sandbox);
                        const script = sandbox.module.exports;

                        config.bots.forEach(botConfig => {
                            const functionName = botConfig.call || botConfig.function;
                            if (script[functionName] && typeof script[functionName] === 'function') {
                                BOTS.push({
                                    name: botConfig.name,
                                    type: config.type, // e.g. "Abwesenheit"
                                    states: botConfig.states,
                                    run: script[functionName]
                                });
                                console.log(`Loaded bot: ${botConfig.name} for type ${config.type}`);
                            } else {
                                console.warn(`Bot function ${functionName} not found in ${scriptPath}`);
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
                }
            }
        } catch (err) {
            console.error(`Error querying tickets for bot ${bot.name}:`, err);
        }
    }
}

async function runBotsForTicket(ticket) {
    const matchingBots = BOTS.filter(bot => bot.type === ticket.type && bot.states.includes(ticket.state));

    for (const bot of matchingBots) {
        try {
            console.log(`Bot ${bot.name} processing ticket ${ticket.id}`);
            await bot.run(ticket);

            if (ticket.isModified()) {
                await ticket.save();
                console.log(`Ticket ${ticket.id} updated by bot ${bot.name}`);
            }
        } catch (err) {
            console.error(`Error in bot ${bot.name} for ticket ${ticket.id}:`, err);
        }
    }
}

function startBots() {
    loadBots();
    runBots();
    setInterval(runBots, 60 * 1000);
}

module.exports = { startBots, runBots, runBotsForTicket };
