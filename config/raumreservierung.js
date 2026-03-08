const { addEvent, deleteEvent } = require('./caldav');
const { parseISO, isBefore } = require('date-fns');

async function eintragen(ticket) {
    if (ticket.state !== 'offen.neu') return;

    if (!ticket.date || !ticket.termin || !ticket.termin.room || !ticket.termin.start || !ticket.termin.end) {
        console.error(`[Raumreservierung] Invalid ticket data for ${ticket._id}: Missing termin or date.`);
        // Could transition to an error state here, but let's keep it simple
        return;
    }

    try {
        await addEvent(
            ticket.termin.room,
            ticket._id.toString(),
            ticket.date,
            ticket.termin.start,
            ticket.termin.end,
            ticket.description || ticket.title
        );
        ticket.state = 'offen.eingetragen';
        console.log(`[Raumreservierung] Termin for ticket ${ticket._id} eingetragen.`);
    } catch (err) {
        console.error(`[Raumreservierung] Failed to create event for ${ticket._id}:`, err);
        // Leave in offen.neu to retry or manual intervention
    }
}

async function stornieren(ticket) {
    if (ticket.state !== 'offen.storniert') return;

    if (!ticket.termin || !ticket.termin.room) {
        console.log(`[Raumreservierung] Ticket ${ticket._id} has no valid termin to cancel.`);
        ticket.state = 'geschlossen.storniert';
        return;
    }

    try {
        await deleteEvent(ticket.termin.room, ticket._id.toString());
        ticket.state = 'geschlossen.storniert';
        console.log(`[Raumreservierung] Termin for ticket ${ticket._id} storniert.`);
    } catch (err) {
        console.error(`[Raumreservierung] Failed to delete event for ${ticket._id}:`, err);
    }
}

async function abschliessen(ticket) {
    if (ticket.state !== 'offen.eingetragen') return;

    // Check if the appointment date has passed
    if (!ticket.date) return;

    // Use current time and compare with the date boundary
    const ticketDate = parseISO(ticket.date);
    // Set to end of day to close it the day AFTER
    ticketDate.setHours(23, 59, 59, 999);

    if (isBefore(ticketDate, new Date())) {
        ticket.state = 'geschlossen.ok';
        console.log(`[Raumreservierung] Datums-Timeout erreicht. Ticket ${ticket._id} abgeschlossen.`);
    }
}

async function verschieben(ticket, dataBefore) {
    if (ticket.state !== 'offen.verschoben') return;

    if (!ticket.date || !ticket.termin || !ticket.termin.room || !ticket.termin.start || !ticket.termin.end) {
        console.error(`[Raumreservierung] Invalid ticket data for ${ticket._id}: Missing termin or date.`);
        return;
    }

    try {
        // Check if room changed using dataBefore
        let oldRoom = null;
        if (dataBefore && dataBefore.termin) {
            oldRoom = dataBefore.termin.room;
        }

        if (oldRoom && oldRoom !== ticket.termin.room) {
            console.log(`[Raumreservierung] Room changed from ${oldRoom} to ${ticket.termin.room}, deleting old event.`);
            await deleteEvent(oldRoom, ticket._id.toString());
        }

        // caldav.js addEvent will overwrite if the uid is the same and the calendar is the same.
        // It uses PUT on the specific ICS file, so it acts as an upset.
        await addEvent(
            ticket.termin.room,
            ticket._id.toString(),
            ticket.date,
            ticket.termin.start,
            ticket.termin.end,
            ticket.description || ticket.title
        );
        ticket.state = 'offen.eingetragen';
        console.log(`[Raumreservierung] Termin for ticket ${ticket._id} verschoben.`);
    } catch (err) {
        console.error(`[Raumreservierung] Failed to reschedule event for ${ticket._id}:`, err);
    }
}

module.exports = {
    eintragen,
    stornieren,
    abschliessen,
    verschieben
};
