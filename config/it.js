const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const otpauth = require('otpauth');
const fs = require('fs');
const path = require('path');

// We need a persistent jar per ticket fetch to avoid session mixups
const createClient = () => {
  const jar = new CookieJar();
  return wrapper(axios.create({ jar, validateStatus: () => true }));
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
  const params = new URLSearchParams();
  params.append('j_username', user);
  params.append('j_password', password);
  params.append('token', token);

  let resp = await client.post(loginUrl, params.toString(), {
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

module.exports = {
  dringend,
  raum
};
