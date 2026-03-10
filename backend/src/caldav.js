const axios = require('axios');
const xml2js = require('xml2js');
const { format, parseISO, addMinutes, isBefore, isAfter, isSameDay } = require('date-fns');
const fs = require('fs');
const path = require('path');

// Load config dynamically or from settings
const getCaldavSettings = () => {
    const settingsPath = path.join(__dirname, '../../config/settings.json');
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.calendar && settings.calendar.server) {
            let serverUrl = settings.calendar.server;
            if (!serverUrl.endsWith('/')) serverUrl += '/';
            return {
                // SOGo typically serves a user's calendars at /SOGo/dav/email@domain.com/Calendar/
                url: `${serverUrl}${settings.calendar.login}/Calendar/`,
                username: settings.calendar.login,
                password: settings.calendar.password
            };
        } else {
            console.warn("[CalDAV] Warning: 'calendar' object or 'server' key is missing in config/settings.json.");
        }
    } else {
        console.warn(`[CalDAV] Warning: Settings file not found at ${settingsPath}`);
    }
    return null;
};

// Helper to create an axios instance with auth
const getClient = () => {
    const config = getCaldavSettings();
    if (!config) throw new Error("CalDAV settings not found in config.");

    const axiosConfig = {
        baseURL: config.url,
        auth: {
            username: config.username,
            password: config.password
        },
        timeout: 10000
    };

    return axios.create(axiosConfig);
};

/**
 * WebDAV response keys differ by server implementation (e.g., SOGo uses D: prefix while Nextcloud uses d:).
 * This safely retrieves the key regardless of case.
 */
function getXmlKey(obj, baseKey) {
    if (!obj) return undefined;
    const lowerKey = baseKey.toLowerCase();
    for (const key of Object.keys(obj)) {
        // match "D:propstat", "d:propstat", "propstat"
        if (key.toLowerCase() === lowerKey || key.toLowerCase() === `d:${lowerKey}`) {
            return obj[key];
        }
    }
    return undefined;
}

/**
 * Fetches all available calendars (rooms) from the CalDAV server.
 * Returns an array of objects: { name: "Raum 101", href: "/path/to/calendar/" }
 */
async function getCalendars(allowedRooms = null) {
    const config = getCaldavSettings();
    if (!config) return [];

    const client = getClient();

    // WebDAV PROPFIND to list calendars
    const propfindXml = `
        <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:prop>
             <d:displayname />
             <d:resourcetype />
          </d:prop>
        </d:propfind>
    `;

    try {
        const response = await client.request({
            method: 'PROPFIND',
            url: '/', // Assuming the base URL points to the user's principal/calendar home
            headers: {
                'Depth': '1',
                'Content-Type': 'application/xml; charset=utf-8',
                'User-Agent': 'Tix-Backend/1.0 (Node.js)'
            },
            data: propfindXml
        });

        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const result = await parser.parseStringPromise(response.data);
        const calendars = [];

        const multistatus = getXmlKey(result, 'multistatus');
        if (!multistatus) return [];

        const responses = getXmlKey(multistatus, 'response') || [];
        const respArray = Array.isArray(responses) ? responses : [responses];

        for (const resp of respArray) {
            const propstat = getXmlKey(resp, 'propstat');
            // Deal with array of propstats
            const propStatsArray = Array.isArray(propstat) ? propstat : [propstat];

            for (const pStat of propStatsArray) {
                const prop = pStat ? getXmlKey(pStat, 'prop') : null;
                const resourcetype = prop ? getXmlKey(prop, 'resourcetype') : null;

                // Check if it's a calendar collection
                if (resourcetype && (resourcetype['c:calendar'] !== undefined || resourcetype['calendar'] !== undefined)) {
                    const href = getXmlKey(resp, 'href');
                    const name = getXmlKey(prop, 'displayname') || href.split('/').filter(Boolean).pop();
                    // Some calendars are not rooms (like Personal Calendar)
                    if (!allowedRooms || allowedRooms.includes(name)) {
                        calendars.push({ name, href });
                    }
                }
            }
        }

        return calendars;
    } catch (err) {
        console.error("[CalDAV] Error fetching calendars:", err.message);
        return [];
    }
}

/**
 * Parses raw iCalendar (.ics) string data to extract VEVENT blocks.
 * Returns an array of events: { uid, start, end, description }
 */
function parseIcs(icsData) {
    const lines = icsData.split(/\r?\n/);
    const events = [];
    let currentEvent = null;

    for (const line of lines) {
        if (line.startsWith('BEGIN:VEVENT')) {
            currentEvent = {};
        } else if (line.startsWith('END:VEVENT')) {
            if (currentEvent) events.push(currentEvent);
            currentEvent = null;
        } else if (currentEvent) {
            // Very naive ICS parsing for essential properties
            if (line.startsWith('UID:')) currentEvent.uid = line.substring(4);
            else if (line.startsWith('DTSTART:')) currentEvent.start = line.substring(8);
            else if (line.startsWith('DTSTART;TZID=')) currentEvent.start = line.split(':')[1];
            else if (line.startsWith('DTSTART;VALUE=DATE:')) currentEvent.start = line.substring(19);
            else if (line.startsWith('DTEND:')) currentEvent.end = line.substring(6);
            else if (line.startsWith('DTEND;TZID=')) currentEvent.end = line.split(':')[1];
            else if (line.startsWith('DTEND;VALUE=DATE:')) currentEvent.end = line.substring(17);
            else if (line.startsWith('DESCRIPTION:')) currentEvent.description = line.substring(12);
        }
    }
    return events;
}

/**
 * Fetch availability for a single calendar on a given date.
 * Returns array of { start (HHMM integer), end (HHMM integer), status: 'occupied' }
 */
async function fetchCalendarEvents(calendarHref, targetDateStr) {
    console.log(`[CalDAV] Fetching events for: ${calendarHref}...`);
    const client = getClient();
    const targetDate = parseISO(targetDateStr);

    // Create a safe padded time range in UTC that overlaps the requested Berlin day entirely
    const searchStart = new Date(targetDate);
    searchStart.setDate(searchStart.getDate() - 1);
    const startOfDay = searchStart.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const searchEnd = new Date(targetDate);
    searchEnd.setDate(searchEnd.getDate() + 2);
    const endOfDay = searchEnd.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const reportXml = `
        <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
            <d:prop>
                <d:getetag />
                <c:calendar-data />
            </d:prop>
            <c:filter>
                <c:comp-filter name="VCALENDAR">
                    <c:comp-filter name="VEVENT">
                        <c:time-range start="${startOfDay}" end="${endOfDay}"/>
                    </c:comp-filter>
                </c:comp-filter>
            </c:filter>
        </c:calendar-query>
    `;

    try {
        const absoluteUrl = new URL(calendarHref, client.defaults.baseURL).href;
        const response = await client.request({
            method: 'REPORT',
            url: absoluteUrl,
            headers: {
                'Depth': '1',
                'Content-Type': 'application/xml; charset=utf-8',
                'User-Agent': 'Tix-Backend/1.0 (Node.js)'
            },
            data: reportXml
        });

        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        const result = await parser.parseStringPromise(response.data);
        const events = [];

        const multistatus = getXmlKey(result, 'multistatus');
        if (!multistatus) return [];

        const responses = getXmlKey(multistatus, 'response') || [];
        const respArray = Array.isArray(responses) ? responses : [responses];

        for (const resp of respArray) {
            const propstat = getXmlKey(resp, 'propstat');
            if (!propstat) continue;

            // Handle both array and object propstats
            const pStats = Array.isArray(propstat) ? propstat : [propstat];

            for (const p of pStats) {
                const prop = getXmlKey(p, 'prop');
                if (!prop) continue;

                let data = null;
                for (const k of Object.keys(prop)) {
                    if (k.toLowerCase().endsWith('calendar-data')) {
                        data = prop[k];
                        break;
                    }
                }

                if (data) {
                    const parsed = parseIcs(data);

                    parsed.forEach(evt => {
                        // evt.start format is usually YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
                        const rawStart = evt.start;
                        const rawEnd = evt.end;

                        if (rawStart && rawEnd) {
                            // Convert back to local time components depending on format
                            function parseBerlinLocal(icsString, isEnd = false) {
                                // Full-day event format: YYYYMMDD (length 8)
                                if (icsString.length === 8) {
                                    // For full day events, CalDAV DTEND is usually exclusive (the next day).
                                    let dateStr = icsString.substring(0, 4) + '-' + icsString.substring(4, 6) + '-' + icsString.substring(6, 8);
                                    let timeStr = isEnd ? '2359' : '0000';

                                    if (isEnd) {
                                        // If it's an end date for a full day event, we actually want to block up until 23:59 of the PREVIOUS day.
                                        const d = new Date(`${dateStr}T12:00:00Z`);
                                        d.setDate(d.getDate() - 1);
                                        const y = d.getUTCFullYear();
                                        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
                                        const dd = String(d.getUTCDate()).padStart(2, '0');
                                        dateStr = `${y}-${m}-${dd}`;
                                    }
                                    return { dateStr, timeStr };
                                }

                                // Standard Time format: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
                                if (icsString.endsWith('Z')) {
                                    const yyyy = icsString.substring(0, 4);
                                    const mm = icsString.substring(4, 6);
                                    const dd = icsString.substring(6, 8);
                                    const hh = icsString.substring(9, 11);
                                    const min = icsString.substring(11, 13);
                                    const ss = icsString.substring(13, 15);
                                    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`);

                                    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
                                    let outY, outM, outD, outH, outMin;
                                    for (const p of parts) {
                                        if (p.type === 'year') outY = p.value;
                                        if (p.type === 'month') outM = p.value.padStart(2, '0');
                                        if (p.type === 'day') outD = p.value.padStart(2, '0');
                                        if (p.type === 'hour') {
                                            const h = p.value === '24' ? '00' : p.value;
                                            outH = h.padStart(2, '0');
                                        }
                                        if (p.type === 'minute') outMin = p.value.padStart(2, '0');
                                    }
                                    return { dateStr: `${outY}-${outM}-${outD}`, timeStr: `${outH}${outMin}` };
                                } else {
                                    // Floating time (already local)
                                    return {
                                        dateStr: icsString.substring(0, 4) + '-' + icsString.substring(4, 6) + '-' + icsString.substring(6, 8),
                                        timeStr: icsString.substring(9, 13)
                                    };
                                }
                            }

                            const parsedStart = parseBerlinLocal(rawStart, false);
                            const parsedEnd = parseBerlinLocal(rawEnd, true);

                            console.log(`[CalDAV Debug] Event parsing - Raw Start: ${rawStart}, Parsed Start Date: ${parsedStart.dateStr}, Target Date: ${targetDateStr}`);

                            // Only include if the event overlaps or is on the targetDateStr
                            // Full day events might span multiple days.
                            // In this simple iteration, we block it if either the start or end falls on the target date.
                            // Real overlap logic for multi-day events would require expanding dates, but UI only shows one day.
                            if (parsedStart.dateStr === targetDateStr || parsedEnd.dateStr === targetDateStr) {
                                console.log(`[CalDAV Debug] Match successful! Adding event from ${parsedStart.timeStr} to ${parsedEnd.timeStr}`);
                                // If it started on a previous day and continued to today, it blocks from 00:00
                                const effectiveStart = (parsedStart.dateStr < targetDateStr) ? '0000' : parsedStart.timeStr;
                                // If it ends on a future day, it blocks until 23:59
                                const effectiveEnd = (parsedEnd.dateStr > targetDateStr) ? '2359' : parsedEnd.timeStr;

                                events.push({
                                    start: effectiveStart.padStart(4, '0'),
                                    end: effectiveEnd.padStart(4, '0'),
                                    status: 'occupied'
                                });
                            }
                        }
                    });
                }
            }
        }
        return events;
    } catch (err) {
        console.error(`[CalDAV] Error fetching events for ${calendarHref}:`, err.message);
        return [];
    }
}

/**
 * Fetches availability for all calendars on a specific date.
 * Returns: { "Raum 101": [{ start: '0900', end: '1000', status: 'occupied' }, ...], ... }
 */
async function getAllAvailability(dateStr, allowedRooms = null) {
    const calendars = await getCalendars(allowedRooms);
    const availability = {};

    // Fetch sequentially to avoid triggering concurrent connection limits on SOGo/Nginx
    for (const cal of calendars) {
        const events = await fetchCalendarEvents(cal.href, dateStr);
        availability[cal.name] = events;
    }

    return availability;
}

/**
 * Adds a new event to the specified calendar.
 * @param {string} calendarName - The name of the calendar (e.g., "Raum 101")
 * @param {string} ticketId - The ID of the ticket, used as UID for easy deletion.
 * @param {string} dateStr - The date in YYYY-MM-DD.
 * @param {string} startHHMM - Start time in HH:MM or HHMM.
 * @param {string} endHHMM - End time in HH:MM or HHMM.
 * @param {string} description - The title/description of the event.
 */
async function addEvent(calendarName, ticketId, dateStr, startHHMM, endHHMM, description) {
    const calendars = await getCalendars();
    const calendar = calendars.find(c => c.name === calendarName);
    if (!calendar) throw new Error(`Calendar not found: ${calendarName}`);

    const client = getClient();
    const targetDate = parseISO(dateStr);

    // Parse local dates directly without relying on Docker Node UTC Date
    const yyyy = dateStr.substring(0, 4);
    const mm = dateStr.substring(5, 7);
    const dd = dateStr.substring(8, 10);

    // Clean HHMM strings to exactly 4 chars
    const cleanStart = startHHMM.toString().replace(':', '').padStart(4, '0');
    const cleanEnd = endHHMM.toString().replace(':', '').padStart(4, '0');

    // Generate TZID specific timestamp properties
    const dtStartProp = `DTSTART;TZID=Europe/Berlin:${yyyy}${mm}${dd}T${cleanStart}00`;
    const dtEndProp = `DTEND;TZID=Europe/Berlin:${yyyy}${mm}${dd}T${cleanEnd}00`;

    // Format for ICS (UTC, Z suffix)
    const formatIcsDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtStamp = formatIcsDate(new Date());

    const uid = `TIX-${ticketId}`;

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Tix Ticket System//DE
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtStamp}
${dtStartProp}
${dtEndProp}
SUMMARY:${description}
DESCRIPTION:Tix Reservierung (Ticket ID: ${ticketId})
END:VEVENT
END:VCALENDAR`;

    const eventUrl = `${calendar.href}${uid}.ics`;
    const absoluteEventUrl = new URL(eventUrl, client.defaults.baseURL).href;

    try {
        await client.request({
            method: 'PUT',
            url: absoluteEventUrl,
            headers: {
                'Content-Type': 'text/calendar; charset=utf-8'
            },
            data: icsContent
        });
        console.log(`[CalDAV] Successfully added event ${uid} to ${calendarName}`);
        return true;
    } catch (err) {
        console.error(`[CalDAV] Error adding event to ${calendarName}:`, err.message);
        throw err;
    }
}

/**
 * Deletes an event associated with a ticket.
 */
async function deleteEvent(calendarName, ticketId) {
    const calendars = await getCalendars();
    const calendar = calendars.find(c => c.name === calendarName);
    if (!calendar) throw new Error(`Calendar not found: ${calendarName}`);

    const client = getClient();
    const uid = `TIX-${ticketId}`;
    const eventUrl = `${calendar.href}${uid}.ics`;
    const absoluteEventUrl = new URL(eventUrl, client.defaults.baseURL).href;

    try {
        await client.request({
            method: 'DELETE',
            url: absoluteEventUrl
        });
        console.log(`[CalDAV] Successfully deleted event ${uid} from ${calendarName}`);
        return true;
    } catch (err) {
        // If it's a 404, it might already be deleted or never created. Ignore.
        if (err.response && err.response.status === 404) {
            console.log(`[CalDAV] Event ${uid} not found. Assuming already deleted.`);
            return true;
        }
        console.error(`[CalDAV] Error deleting event from ${calendarName}:`, err.message);
        throw err;
    }
}

/**
 * Deletes an event associated with a ticket, without knowing the calendar in advance.
 * It queries all possible calendars for the system and attempts to delete it.
 */
async function deleteEventByTicketId(ticketId) {
    const calendars = await getCalendars();
    const client = getClient();
    const uid = `TIX-${ticketId}`;

    let deletedCount = 0;

    for (const calendar of calendars) {
        const eventUrl = `${calendar.href}${uid}.ics`;
        const absoluteEventUrl = new URL(eventUrl, client.defaults.baseURL).href;

        try {
            await client.request({
                method: 'DELETE',
                url: absoluteEventUrl
            });
            console.log(`[CalDAV] Successfully deleted event ${uid} from ${calendar.name}`);
            deletedCount++;
        } catch (err) {
            // Ignore 404, we expect this for all calendars except the one that holds the event
            if (err.response && err.response.status === 404) {
                continue;
            }
            console.error(`[CalDAV] Error deleting event from ${calendar.name}:`, err.message);
        }
    }

    if (deletedCount === 0) {
        console.log(`[CalDAV] Event ${uid} not found in any calendar. Assuming already deleted.`);
    }

    return true;
}

module.exports = {
    getCalendars,
    getAllAvailability,
    addEvent,
    deleteEvent,
    deleteEventByTicketId
};
