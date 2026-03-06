const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const otpauth = require('otpauth');
const fs = require('fs');
const path = require('path');

let HttpsProxyAgent;
try {
    HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch (e) {
    // Not installed
}

const settingsPath = path.join(__dirname, '../../config/settings.json');
let settings;
try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
} catch (e) {
    console.error("Konnte settings.json nicht laden:", e);
    process.exit(1);
}

const webuntis = settings.webuntis;
console.log(`Teste WebUntis API an: ${webuntis.url}`);
console.log("--------------------------------------------------");

// Setup Axios client with proxy if HTTP_PROXY or HTTPS_PROXY environment variables are set
const axiosConfig = {
    // Use an interceptor or default validateStatus to allow reading 403 responses
    validateStatus: function (status) {
        return status >= 200 && status < 500; // Resolve promise for status codes < 500
    }
};
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

if (proxyUrl) {
    console.log(`Proxy im Environment gefunden: ${proxyUrl}`);
    if (HttpsProxyAgent) {
        try {
            axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
            axiosConfig.proxy = false;
            console.log("✅ HttpsProxyAgent konfiguriert.");
        } catch (e) {
            console.error("Fehler bei der HttpsProxyAgent-Konfiguration:", e.message);
        }
    } else {
        console.log("Warnung: https-proxy-agent ist nicht installiert. Verwende Axios-internen Proxy.");
    }
} else {
    console.log("Kein Proxy in den Umgebungsvariablen konfiguriert.");
}
console.log("--------------------------------------------------");

const jar = new CookieJar();
const client = wrapper(axios.create({ ...axiosConfig, jar }));

async function testWebuntis() {
    try {
        // Test connection to index.do
        console.log(`1. Hole CSRF-Token von ${webuntis.url}index.do ...`);
        const indexRes = await client.get(`${webuntis.url}index.do`);
        const csrfMatch = indexRes.data.match(/"csrfToken":"([^"]+)"/);
        let csrfToken = csrfMatch ? csrfMatch[1] : null;

        if (!csrfToken) {
            console.warn("⚠️ Konnte CSRF-Token nicht extrahieren (HTTP " + indexRes.status + ")");
            // Wenn 403, dann liegt hier schon der Fehler
            if (indexRes.status === 403) {
                console.error("❌ 403 Forbidden! Verbindung wird durch WAF/Proxy blockiert.");
                console.error("Response Header:", indexRes.headers);
                console.error("Response Data:", typeof indexRes.data === 'string' ? indexRes.data.substring(0, 200) + '...' : indexRes.data);
            }
        } else {
            console.log("✅ CSRF-Token erhalten:", csrfToken);
        }

        console.log("\n2. Prüfe Server-Zeitpunkt (HEAD request)...");
        const timeRes = await client.head(webuntis.url, { maxRedirects: 0 });
        let serverTimeMs = Date.now();
        if (timeRes.headers['date']) {
            serverTimeMs = new Date(timeRes.headers['date']).getTime();
            console.log(`✅ Server-Zeit: ${new Date(serverTimeMs).toISOString()} | Lokale Zeit: ${new Date().toISOString()}`);
        } else {
            console.log("⚠️ Kein 'date' Header gefunden, nutze lokale Zeit.");
        }

        console.log("\n3. Versuche Login...");
        const totp = new otpauth.TOTP({
            issuer: "WebUntis",
            label: "test",
            algorithm: "SHA1",
            digits: 6,
            period: 30,
            secret: otpauth.Secret.fromBase32(webuntis.secret)
        });

        const token = totp.generate({ timestamp: serverTimeMs });
        const loginUrl = `${webuntis.url}${webuntis.login}`;
        console.log(`Sende POST an: ${loginUrl}`);

        const params = new URLSearchParams();
        params.append('j_username', webuntis.user);
        params.append('j_password', webuntis.password);
        params.append('token', token);

        const loginRes = await client.post(loginUrl, params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log(`Login HTTP Status: ${loginRes.status}`);
        if (loginRes.status === 403) {
            console.error("❌ 403 Forbidden beim Login!");
        } else if (loginRes.status >= 200 && loginRes.status < 400) {
            console.log("✅ Login-Anfrage war erfolgreich (Redirect/OK)!");

            // Try to extract a new CSRF token if one is present in the response body
            if (typeof loginRes.data === 'string') {
                const newCsrfMatch = loginRes.data.match(/"csrfToken":"([^"]+)"/);
                if (newCsrfMatch && newCsrfMatch[1] && newCsrfMatch[1] !== csrfToken) {
                    console.log(`✅ Neues CSRF-Token nach Login erhalten: ${newCsrfMatch[1]}`);
                    csrfToken = newCsrfMatch[1];
                }
            }
        }

        console.log("\n4. Versuche pageconfig abzurufen (als Raum-Test)...");
        if (csrfToken) {
            const pageConfigUrl = `${webuntis.url}api/public/timetable/weekly/pageconfig?type=4`;
            const pRes = await client.get(pageConfigUrl, {
                headers: {
                    'Accept': 'application/json',
                    'Referer': `${webuntis.url}index.do`,
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': csrfToken
                }
            });

            console.log(`PageConfig HTTP Status: ${pRes.status}`);
            if (pRes.status === 403) {
                console.error("❌ 403 Forbidden beim Abrufen der API!");
            } else if (pRes.data && pRes.data.data && pRes.data.data.elements) {
                const elements = pRes.data.data.elements;
                const rooms = elements.filter(e => e.type === 4);
                console.log(`✅ Erfolgreich JSON validiert. Gefundene Räume: ${rooms.length}`);
                if (rooms.length > 0) {
                    console.log(`Beispielraum: ${rooms[0].name} (ID: ${rooms[0].id})`);
                }
            } else {
                console.log("⚠️ Antwort hat nicht das erwartete JSON-Format.");
            }
        } else {
            console.log("Skippe Schritt 4, da kein CSRF Token vorhanden ist.");
        }

        console.log("\n=================================");
        console.log("🏁 WebUntis End-to-End Test Done");
        console.log("=================================");

    } catch (error) {
        console.error("\n=================================");
        console.error("❌ NETZWERK-FEHLER WÄHREND DES TESTS");
        console.error("=================================");
        if (error.response) {
            console.error(`HTTP Status: ${error.response.status}`);
            console.error(`Response Headers:`, error.response.headers);
            console.error(`Response Data Summary:`, typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : error.response.data);
        } else if (error.request) {
            console.error(`Keine Antwort erhalten. Netzwerkfehler oder Timeout:`, error.message);
        } else {
            console.error(`Fehler beim Request-Setup:`, error.message);
        }
    }
}

testWebuntis();
