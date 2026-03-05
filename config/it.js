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
      const axios = require('axios');
      const otpauth = require('otpauth');
      const fs = require('fs');
      const { wrapper } = require('axios-cookiejar-support');
      const { CookieJar } = require('tough-cookie');

      const settings = JSON.parse(fs.readFileSync('/home/holger/jdevel/tix/config/settings.json', 'utf8'));
      const { url, login, user, password, secret } = settings.webuntis;

      const jar = new CookieJar();
      const client = wrapper(axios.create({ jar }));

      let totp = new otpauth.TOTP({
        issuer: "WebUntis",
        label: "test",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: otpauth.Secret.fromBase32(secret)
      });
      const token = totp.generate();

      const loginUrl = url + login;
      const params = { 'j_username': user, 'j_password': password, 'token': token };

      await client.post(loginUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const indexRes = await client.get(`${url}index.do`);
      const csrfMatch = indexRes.data.match(/"csrfToken":"([^"]+)"/);
      const csrfToken = csrfMatch ? csrfMatch[1] : null;

      const pageConfigUrl = `${url}api/public/timetable/weekly/pageconfig?type=4`;
      const pRes = await client.get(pageConfigUrl, {
        headers: {
          'Accept': 'application/json',
          'Referer': `${url}index.do`,
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': csrfToken
        }
      });

      const elements = pRes.data.data.elements;
      const room = elements.find(e => e.type === 4 && e.name === roomName);
      if (!room) {
        ticket.raumbelegung = "Raum nicht gefunden";
        return;
      }

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

      const periods = ttRes.data.data.result.data.elementPeriods[room.id];
      if (!periods || periods.length === 0) {
        ticket.set('raumbelegung', [{ status: 'free', start: 750, end: 1505 }]);
        return;
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

      ticket.set('raumbelegung', blocks);

    } catch (e) {
      console.error("Fehler beim Laden der Raumbelegung:", e);
      ticket.set('raumbelegung', []);
    }
  }
}

module.exports = {
  dringend,
  raum
};