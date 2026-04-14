const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '../../config');
let kiToken = null;
let kiModel = null;
let serverUrl = null;
let baseApiUrl = null;

async function getClient() {
    if (kiToken && kiModel) return { token: kiToken, model: kiModel, baseUrl: baseApiUrl };

    const settings = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'settings.json'), 'utf8'));
    if (!settings.ki || !settings.ki.server) throw new Error("Kein KI-Server konfiguriert");
    
    serverUrl = settings.ki.server; 
    baseApiUrl = serverUrl.replace('/api/v1/', '/api/');

    if (!kiToken) {
        try {
            const loginRes = await axios.post(`${serverUrl}auths/signin`, {
                email: settings.ki.login,
                password: settings.ki.password
            });
            kiToken = loginRes.data.token;
        } catch (authErr) {
            throw new Error(`Auth failed: ${authErr.message}`);
        }
    }

    if (!kiModel) {
        const modelsRes = await axios.get(`${baseApiUrl}models`, {
            headers: { Authorization: `Bearer ${kiToken}` }
        });
        
        if (!modelsRes.data || !modelsRes.data.data || modelsRes.data.data.length === 0) {
            throw new Error("No KI models available");
        }
        
        kiModel = modelsRes.data.data[0].id;
    }

    return { token: kiToken, model: kiModel, baseUrl: baseApiUrl };
}

/**
 * Basic completion with a single text prompt
 */
async function askKI(prompt, temperature = 0.1) {
    try {
        const client = await getClient();
        
        const chatRes = await axios.post(`${client.baseUrl}chat/completions`, {
            model: client.model,
            messages: [{ role: "user", content: prompt }],
            temperature: temperature
        }, {
            headers: { Authorization: `Bearer ${client.token}` }
        });
        
        if (chatRes.data && chatRes.data.choices && chatRes.data.choices[0]) {
            return chatRes.data.choices[0].message.content;
        }
        return "";
    } catch (err) {
        console.error('Error calling askKI:', err.message);
        if (err.response && err.response.status === 401) {
            kiToken = null; // Invalidate on auth error
        }
        return "";
    }
}

/**
 * Advanced completion matching OpenAI messages schema
 */
async function askKIWithMessages(messages, temperature = 0.1) {
    try {
        const client = await getClient();
        
        const chatRes = await axios.post(`${client.baseUrl}chat/completions`, {
            model: client.model,
            messages: messages,
            temperature: temperature
        }, {
            headers: { Authorization: `Bearer ${client.token}` }
        });
        
        if (chatRes.data && chatRes.data.choices && chatRes.data.choices[0]) {
            return chatRes.data.choices[0].message.content;
        }
        return "";
    } catch (err) {
        console.error('Error calling askKIWithMessages:', err.message);
        if (err.response && err.response.status === 401) {
            kiToken = null; // Invalidate
        }
        return "";
    }
}

module.exports = { 
    askKI, 
    askKIWithMessages, 
    getClient 
};
