const caldav = require('./src/caldav');

async function test() {
    try {
        console.log("Fetching calendars...");
        const calendars = await caldav.getCalendars();
        console.log("Calendars found:", calendars);

        console.log("Fetching availability...");
        const data = await caldav.getAllAvailability('2026-03-12');
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("TEST ERROR:", e);
    }
}

test();
