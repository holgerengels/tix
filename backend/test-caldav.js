const caldav = require('./src/caldav');

async function test() {
    try {
        console.log("Fetching calendars...");
        const calendars = await caldav.getCalendars();
        console.log("Calendars found:", calendars);

        console.log("Fetching availability...");
        const data = await caldav.getAllAvailability('2026-03-12');
        console.log(JSON.stringify(data, null, 2));

        console.log("\nTesting event creation in personal calendar (ownerEmail)...");
        const testTicketId = 'TEST-SERVICEUSER-1';
        const targetUser = 'raeume@valckenburgschule.de';
        
        await caldav.addEvent(
            'Personal Calendar',
            testTicketId,
            '2026-08-01',
            '1000',
            '1100',
            'Test Service User Termin',
            [],
            targetUser
        );
        console.log("Event created successfully!");

        console.log("Cleaning up test event...");
        await caldav.deleteEvent('Personal Calendar', testTicketId, targetUser);
        console.log("Event deleted successfully!");
    } catch (e) {
        console.error("TEST ERROR:", e);
    }
}

test();
