const axios = require('axios');
const { CookieJar } = require('tough-cookie');

let HttpsProxyAgent;
try {
  // Only use if available, mimicking the test script
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch (e) { }

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
let proxyConfig = { proxy: false };

if (proxyUrl && HttpsProxyAgent) {
  try {
    proxyConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
  } catch (e) {
    console.error("WebUntis Proxy-Error in it.js:", e.message);
  }
}

// We need a persistent jar per ticket fetch to avoid session mixups
const createClient = () => {
  const jar = new CookieJar();
  const client = axios.create({ ...proxyConfig, validateStatus: () => true });

  client.interceptors.request.use(async config => {
    try {
      const urlToUse = config.baseURL && !config.url.startsWith('http')
        ? config.baseURL + config.url
        : config.url;

      const cookie = await jar.getCookieString(urlToUse);
      if (cookie) {
        config.headers = config.headers || {};
        config.headers.Cookie = cookie;
      }
    } catch (err) {
      console.error("CookieJar get error in it.js:", err.message);
    }
    return config;
  });

  client.interceptors.response.use(async response => {
    try {
      const setCookieHeaders = response.headers['set-cookie'];
      if (setCookieHeaders) {
        const urlToUse = response.config.baseURL && !response.config.url.startsWith('http')
          ? response.config.baseURL + response.config.url
          : response.config.url;

        for (const cookie of setCookieHeaders) {
          await jar.setCookie(cookie, urlToUse);
        }
      }
    } catch (err) {
      console.error("CookieJar set error in it.js:", err.message);
    }
    return response;
  });

  return client;
};

function dringend(ticket) {
  if (ticket.state === 'offen.neu' && ticket.category === 'Medien') {
    // Ensure badges array exists
    if (!ticket.badges) ticket.badges = [];
    // Add 'dringend' if not present
    if (!ticket.badges.includes('dringend')) {
      ticket.badges.push('dringend');
    }
    if (ticket.badges.includes('langfristig')) {
      ticket.badges = ticket.badges.filter(badge => badge !== 'langfristig');
    }
  }
}

async function raum(ticket) {
  if (ticket.location && ticket.location.startsWith('Raum ')) {
    const roomName = ticket.location.substring(5, 8).trim();

    if (!roomName) return;

    try {
      const blocks = await fetchblocks(roomName)
      ticket.set('raumbelegung', blocks);

    } catch (e) {
      console.error("Fehler beim Laden der Raumbelegung:", e);
      ticket.set('raumbelegung', []);
    }
  }
}

async function fetchblocks(roomName) {
  const settingsPath = path.join(__dirname, 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const { url, login, user, password, secret } = settings.webuntis;

  const client = createClient();

  // 1. Initial Token from index.do
  let csrfToken = await fetchtoken(client, url);

  // 2. Perform Login and optionally get the rotated token
  const newCsrf = await dologin(client, otpauth, secret, url, login, user, password);
  if (newCsrf) {
    csrfToken = newCsrf; // Update with the rotated token if given
  }

  const room = await fetchroom(client, url, csrfToken, roomName);
  if (!room) {
    return "Raum nicht gefunden";
  }
  const periods = await fetchtimetable(client, url, room, csrfToken);
  if (!periods || periods.length === 0) {
    return [{ status: 'free', start: 750, end: 1505 }];
  }

  // Sort periods by start time
  periods.sort((a, b) => a.startTime - b.startTime);

  // Merge consecutive occupied periods
  let mergedOccupied = [];
  for (const p of periods) {
    if (mergedOccupied.length === 0) {
      mergedOccupied.push({ start: p.startTime, end: p.endTime });
    } else {
      const last = mergedOccupied[mergedOccupied.length - 1];
      if (last.end >= p.startTime) {
        last.end = Math.max(last.end, p.endTime);
      } else {
        mergedOccupied.push({ start: p.startTime, end: p.endTime });
      }
    }
  }

  // Build continuous blocks of free/occupied
  const dayStart = 750;
  const dayEnd = 1505;
  let blocks = [];
  let currentStart = dayStart;

  for (const p of mergedOccupied) {
    if (p.start > currentStart) {
      blocks.push({ status: 'free', start: currentStart, end: p.start });
    }
    if (p.end > currentStart) {
      // If the occupied period starts before our bounds but ends inside,
      // or spans entirely across, clamp it.
      const blockStart = Math.max(currentStart, p.start);
      const blockEnd = Math.min(dayEnd, p.end);
      if (blockStart < blockEnd) {
        blocks.push({ status: 'occupied', start: blockStart, end: blockEnd });
      }
      currentStart = p.end;
    }
  }

  if (currentStart < dayEnd) {
    blocks.push({ status: 'free', start: currentStart, end: dayEnd });
  }

  return blocks;
}

async function time(client, url) {
  const timeRes = await client.head(url, { maxRedirects: 0 });
  let serverTimeMs = Date.now();
  if (timeRes.headers['date']) {
    serverTimeMs = new Date(timeRes.headers['date']).getTime();
    console.log(`[WebUntis] Server time: ${new Date(serverTimeMs).toISOString()} | Local time: ${new Date().toISOString()}`);
  }
  return serverTimeMs;
}

async function dologin(client, otpauth, secret, url, login, user, password) {
  let totp = new otpauth.TOTP({
    issuer: "WebUntis",
    label: "test",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: otpauth.Secret.fromBase32(secret)
  });

  let serverTimeMs = await time(client, url);
  const token = totp.generate({ timestamp: serverTimeMs });
  const loginUrl = url + login;
  const params = {
    j_username: user,
    j_password: password,
    token: token
  };

  let resp = await client.post(loginUrl, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  console.log("login status:", resp.status);

  if (typeof resp.data === 'string') {
    const newCsrfMatch = resp.data.match(/"csrfToken":"([^"]+)"/);
    if (newCsrfMatch && newCsrfMatch[1]) {
      return newCsrfMatch[1];
    }
  }
  return null;
}

async function fetchroom(client, url, csrfToken, roomName) {
  const pageConfigUrl = `${url}api/public/timetable/weekly/pageconfig?type=4`;
  const pRes = await client.get(pageConfigUrl, {
    headers: {
      'Accept': 'application/json',
      'Referer': `${url}index.do`,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrfToken
    }
  });

  if (!pRes.data || !pRes.data.data) {
    console.error("fetchroom HTTP Status:", pRes.status);
    return null;
  }

  const elements = pRes.data.data.elements;
  const room = elements.find(e => e.type === 4 && e.name === roomName);
  return room;
}

async function fetchtoken(client, url) {
  const indexRes = await client.get(`${url}index.do`);
  const csrfMatch = indexRes.data.match(/"csrfToken":"([^"]+)"/);
  const csrfToken = csrfMatch ? csrfMatch[1] : null;
  console.log("token: " + csrfToken);
  return csrfToken;
}

async function fetchtimetable(client, url, room, csrfToken) {
  const dateStr = new Date().toISOString().split('T')[0];
  const timetableUrl = `${url}api/public/timetable/weekly/data?elementType=4&elementId=${room.id}&date=${dateStr}&formatId=2`;
  const ttRes = await client.get(timetableUrl, {
    headers: {
      'Accept': 'application/json',
      'Referer': `${url}index.do`,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrfToken
    }
  });

  if (!ttRes.data || !ttRes.data.data) {
    console.error("fetchtimetable HTTP Status:", ttRes.status);
    return [];
  }

  const periods = ttRes.data.data.result.data.elementPeriods[room.id];
  return periods;
}

async function sentiment_analyse(ticket) {
  const sentiment = await askKI('Bewerte den Frust-Level des folgenden Tickets. Wenn der Benutzer extrem frustriert, aggressiv oder sehr wütend wirkt (z.B. "zum x-ten Mal defekt", Beschwerden, viele Ausrufezeichen), antworte AUSSCHLIESSLICH mit ESKALIERT. Sonst antworte mit OK. Text: ' + ticket.description);
  if (sentiment.trim().toUpperCase() === 'ESKALIERT' && (!ticket.badges || !ticket.badges.includes('eskaliert'))) {
    if (!ticket.badges) ticket.badges = [];
    ticket.badges.push('eskaliert');
  }
}

async function raum_erkennung(ticket) {
  if (!ticket.location || ticket.location === 'Kein Raum') {
    const reply = await askKI('Extrahiere den Raum oder Ort aus folgendem Text. Antworte AUSSCHLIESSLICH mit der Raumnummer (z.B. 302) oder Ort (z.B. Aula, Mensa). Wenn kein Ort im Text steht, antworte mit NULL. Text: ' + ticket.title + ' ' + ticket.description);
    const match = reply.trim();
    if (match !== 'NULL' && match !== '') {
      const conf = JSON.parse(fs.readFileSync(__dirname + '/it.json'));
      const roomOpts = conf.fields.find(f => f.name === 'location').options;
      const found = roomOpts.find(r => r.includes(match) || match.includes(r));
      if (found) ticket.location = found;
    }
  }
}

module.exports = {
  dringend,
  raum,
  sentiment_analyse,
  raum_erkennung
};
