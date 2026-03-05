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
        ticket.set('raumbelegung', "frei ab 7:50");
        return;
      }

      // Sort periods by start time
      periods.sort((a, b) => a.startTime - b.startTime);

      // Merge consecutive periods
      let merged = [];
      for (const p of periods) {
        if (merged.length === 0) {
          merged.push({ start: p.startTime, end: p.endTime });
        } else {
          const last = merged[merged.length - 1];
          if (last.end >= p.startTime) {
            last.end = Math.max(last.end, p.endTime);
          } else {
            merged.push({ start: p.startTime, end: p.endTime });
          }
        }
      }

      const formatTime = (t) => {
        const tStr = t.toString();
        const mins = tStr.slice(-2);
        const hrs = tStr.slice(0, -2) || '0';
        return `${hrs}:${mins}`;
      };

      const dayStart = 750;
      let freePeriods = [];
      let currentStart = dayStart;

      for (const p of merged) {
        if (p.start > currentStart) {
          freePeriods.push({ start: currentStart, end: p.start });
        }
        if (p.end > currentStart) {
          currentStart = p.end;
        }
      }
      freePeriods.push({ start: currentStart, end: null });

      const formatted = freePeriods.map(p => {
        if (p.end === null) {
          return `frei ab ${formatTime(p.start)}`;
        }
        return `frei ${formatTime(p.start)} bis ${formatTime(p.end)}`;
      }).join(', ');

      console.log(formatted);
      ticket.set('raumbelegung', formatted);

    } catch (e) {
      console.error("Fehler beim Laden der Raumbelegung:", e);
      ticket.set('raumbelegung', "Fehler beim Laden der Raumbelegung");
    }
  }
}

module.exports = {
  dringend,
  raum
};