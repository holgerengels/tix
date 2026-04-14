const fs = require('fs');
const https = require('https');

const args = process.argv.slice(2);
const username = args[0];
const password = args[1];
const kiUser = args[2];
const kiPass = args[3];
const testOnly = args[4] === 'true';

if (!password || !kiPass) {
    console.error("Usage: node import_tickets.js <tix_username> <tix_password> <ki_email> <ki_password> [testOnly]");
    console.error("Example: node import_tickets.js holger_engels tixPass email@schule.de kiPass true");
    process.exit(1);
}

// Load IT-Ticket and Hausmeisterauftrag config to get valid room and category options
const itConfig = JSON.parse(fs.readFileSync(__dirname + '/config/it.json', 'utf8'));
const hmConfig = JSON.parse(fs.readFileSync(__dirname + '/config/hausmeister.json', 'utf8'));
const roomOptions = itConfig.fields.find(f => f.name === 'location').options;
const itCatOptions = itConfig.fields.find(f => f.name === 'category').options;
const hmCatOptions = hmConfig.fields.find(f => f.name === 'category').options;

let kiToken = null;
let kiModel = null;

async function initKI() {
    console.log(`[KI] Login bei ki.valckenburgschule.de als ${kiUser}...`);
    try {
        const loginData = JSON.stringify({ email: kiUser, password: kiPass });
        const resObj = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'ki.valckenburgschule.de',
                port: 443,
                path: '/api/v1/auths/signin',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(loginData)
                }
            }, res => {
                let body = '';
                res.on('data', d => body += d);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try { resolve(JSON.parse(body)); } catch(e) { reject("Parse Error"); }
                    } else {
                        reject(body);
                    }
                });
            });
            req.on('error', reject);
            req.write(loginData);
            req.end();
        });
        
        kiToken = resObj.token;
        console.log("[KI] Login erfolgreich. Hole verfügbare Modelle...");

        // Fetch models to pick the first text model
        const modelsObj = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'ki.valckenburgschule.de',
                port: 443,
                path: '/api/models',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${kiToken}`
                }
            }, res => {
                let body = '';
                res.on('data', d => body += d);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try { resolve(JSON.parse(body)); } catch(e) { reject("Parse Error"); }
                    } else {
                        reject(body);
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });

        if (modelsObj && modelsObj.data && modelsObj.data.length > 0) {
            kiModel = modelsObj.data[0].id;
            console.log(`[KI] Verwende Modell: ${kiModel}`);
        } else {
            console.log("[KI] Keine Modelle gefunden!");
        }
    } catch (e) {
        console.error("[KI] Init-Fehler:", e);
    }
}

async function determineCategoryByAI(type, record) {
    const options = type === 'IT-Ticket' ? itCatOptions : hmCatOptions;
    
    if (!kiToken || !kiModel) {
        console.log(`[KI-Skipped] Keine KI verfügbar. Verwende "Sonstiges" für: ${record.Titel}`);
        return 'Sonstiges';
    }

    return new Promise((resolve) => {
        const bodyData = JSON.stringify({
            model: kiModel,
            messages: [
                {
                    role: "system",
                    content: `Ordne das folgende Problem/Ticket exakt einer dieser Kategorien zu: ${options.join(', ')}. Gebe AUSSCHLIESSLICH den exakten Kategorienamen zurück und keinen weiteren Text.`
                },
                {
                    role: "user",
                    content: JSON.stringify(record, null, 2)
                }
            ],
            temperature: 0.1
        });

        const req = https.request({
            hostname: 'ki.valckenburgschule.de',
            port: 443,
            path: '/api/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${kiToken}`,
                'Content-Length': Buffer.byteLength(bodyData)
            }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (!parsed.choices || !parsed.choices[0]) {
                        console.log("[KI] Unerwartete Antwort:", body);
                        return resolve('Sonstiges');
                    }
                    const reply = parsed.choices[0].message.content.trim();
                    if (options.includes(reply)) {
                        resolve(reply);
                    } else {
                        for (const opt of options) {
                            if (reply.includes(opt)) return resolve(opt);
                        }
                        resolve('Sonstiges');
                    }
                } catch (e) {
                    resolve('Sonstiges');
                }
            });
        });

        req.on('error', () => resolve('Sonstiges'));
        req.write(bodyData);
        req.end();
    });
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i+1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function mapRoom(rawRoom) {
    if (!rawRoom || rawRoom === '[ --- ]') return 'Kein Raum';
    rawRoom = rawRoom.trim();
    if (roomOptions.includes(rawRoom)) return rawRoom;
    
    for (const opt of roomOptions) {
        if (opt.startsWith(rawRoom)) return opt;
    }
    
    if (rawRoom.match(/^\d+$/)) {
        const search = `Raum ${rawRoom}`;
        for (const opt of roomOptions) {
            if (opt.startsWith(search)) return opt;
        }
    }
    return 'Kein Raum';
}

function mapAssignee(assignee) {
    if (!assignee) return null;
    assignee = assignee.trim();
    
    if (assignee === 'Elektriker-Unternehmen' || assignee === 'EDV-Unternehmen') {
        return 'holger_engels';
    }
    if (assignee === 'Rau, Max') {
        return null;
    }
    
    const parts = assignee.split(',');
    if (parts.length === 2) {
        const last = parts[0].trim().toLowerCase();
        const first = parts[1].trim().toLowerCase();
        return `${first}_${last}`;
    }
    
    return assignee.toLowerCase().replace(/ /g, '_');
}

function apiRequest(path, method, data, token) {
    return new Promise((resolve, reject) => {
        const dataStr = data ? JSON.stringify(data) : '';
        const options = {
            hostname: 'tix.valckenburgschule.de',
            port: 443,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataStr)
            }
        };
        if (token) {
            options.headers['Authorization'] = 'Bearer ' + token;
        }

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(body); } catch(e) { parsed = body; }
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(parsed);
                } else {
                    reject({ status: res.statusCode, data: parsed });
                }
            });
        });

        req.on('error', reject);
        if (dataStr) req.write(dataStr);
        req.end();
    });
}

async function run() {
    try {
        await initKI();
        
        console.log(`\nLogging in to TIX as ${username}...`);
        const loginRes = await apiRequest('/login', 'POST', { username, password });
        const token = loginRes.token;
        console.log('Login successful.');

        const lines = fs.readFileSync(__dirname + '/export.csv', 'utf8')
            .split('\n')
            .map(l => l.trim())
            .filter(l => l !== '');
            
        const headers = parseCSVLine(lines[0]);
        let recordsToProcess = lines.slice(1);
        
        if (testOnly) {
            recordsToProcess = [recordsToProcess[0]];
            console.log("\nTEST MODE: Processing single record.");
        }

        for (let idx = 0; idx < recordsToProcess.length; idx++) {
            const cols = parseCSVLine(recordsToProcess[idx]);
            const record = {};
            for(let i = 0; i < headers.length; i++) {
                record[headers[i]] = cols[i];
            }

            console.log(`\n--- Processing: ${record.Titel} ---`);

            let type = '';
            let category = '';
            const rawCat = record.Kategorie ? record.Kategorie.trim() : '';
            
            if (rawCat === 'IT') {
                type = 'IT-Ticket';
                category = await determineCategoryByAI(type, record);
            } else if (rawCat === 'Elektrik') {
                type = 'Hausmeisterauftrag';
                category = 'Reparatur';
            } else if (rawCat === 'Hausmeisterauftrag') {
                type = 'Hausmeisterauftrag';
                category = await determineCategoryByAI(type, record);
            } else {
                console.log(`Unknown category '${rawCat}', skipping.`);
                continue;
            }

            const rawStatus = (record.Status || '').trim();
            const targetState = ['zugewiesen', 'in Arbeit', 'Rücksprache', 'Rückfrage'].includes(rawStatus) 
                ? 'offen.inArbeit' 
                : 'offen.neu';

            const payload = {
                type: type,
                title: record.Titel || 'Ohne Titel',
                description: `Importiertes Ticket (ErstellungsDatum: ${record.ErstellungsDatum})`,
                category: category,
                location: mapRoom(record.Raum),
                badges: []
            };

            const prio = record['Priorität'] ? record['Priorität'].trim().toLowerCase() : '';
            if (prio === 'hoch') {
                payload.badges.push('wichtig');
            } else if (prio === 'niedrig') {
                payload.badges.push('unwichtig');
            }

            const assignee = mapAssignee(record.ZweisungAn);
            if (assignee) {
                payload.assignee = assignee;
            }

            console.log(`Creating ticket: [${payload.type}] [Kategorie: ${category}] ${payload.title}`);
            const ticketRes = await apiRequest('/tickets', 'POST', payload, token);
            console.log(`Created ticket ID: ${ticketRes.id} (DB ID: ${ticketRes._id})`);

            if (targetState === 'offen.inArbeit') {
                console.log(`Advancing state to: ${targetState}`);
                const stateAction = {
                    actionName: "bearbeiten",
                    formButtonName: "in Arbeit",
                    formData: {}
                };
                await apiRequest(`/tickets/${ticketRes._id}/action`, 'POST', stateAction, token);
                console.log(`State updated.`);
            }
            
            console.log(`Success for record: ${record.Titel}`);
        }
        console.log("\nFinished importing.");
    } catch (e) {
        console.error("\nError during execution:", e);
        if (e && e.data) {
            console.error("API response:", e.data);
        }
    }
}

run();
