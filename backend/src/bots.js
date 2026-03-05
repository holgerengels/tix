const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Ticket = require('./models/ticket');

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
                        __dirname: CONFIG_DIR,
                        setTimeout: setTimeout,
                        setInterval: setInterval,
                        clearTimeout: clearTimeout,
                        clearInterval: clearInterval
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
                                    // Make exported functions available in the execution scope
                                    const scope = { ticket, ...scriptExports };
                                    const keys = Object.keys(scope);
                                    const values = Object.values(scope);

                                    // If script is just calling a globally available function in the VM,
                                    // we need to make sure those are accessible.
                                    // Since script file already ran in `sandbox`, its declarations are in `sandbox`.
                                    // Instead of a new Function, we can evaluate inside the VM with ticket.
                                    sandbox.ticket = ticket;
                                    try {
                                        const result = vm.runInContext(botConfig.script, sandbox);
                                        if (result && typeof result.then === 'function') {
                                            await result;
                                        }
                                    } catch (e) {
                                        console.error(`Error running bot script ${botConfig.name}:`, e);
                                    }
                                };

                                BOTS.push({
                                    name: botConfig.name,
                                    type: config.type,
                                    states: botConfig.states || [],
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

module.exports = { loadBots, runBots, runBotsForTicket };
