const { addEvent, deleteEvent, deleteEventByTicketId } = require('./caldav');
const { parseISO, isBefore } = require('date-fns');

async function eintragen(ticket) {
    if (ticket.state !== 'offen.neu') return;

    const date = ticket.get('date');
    const termin = ticket.get('termin');

    if (!date || !termin || !termin.room || !termin.start || !termin.end) {
        console.error(`[Raumreservierung] Invalid ticket data for ${ticket._id}: Missing termin or date.`);
        // Could transition to an error state here, but let's keep it simple
        return;
    }

    try {
        await addEvent(
            termin.room,
            ticket.id,
            date,
            termin.start,
            termin.end,
            ticket.description || ticket.title
        );
        ticket.state = 'offen.eingetragen';
        console.log(`[Raumreservierung] Termin for ticket ${ticket.id} eingetragen.`);
    } catch (err) {
        console.error(`[Raumreservierung] Failed to create event for ${ticket.id}:`, err);
        // Leave in offen.neu to retry or manual intervention
    }
}

async function stornieren(ticket) {
    if (ticket.state !== 'offen.storniert') return;

    const termin = ticket.get('termin');

    if (!termin || !termin.room) {
        console.log(`[Raumreservierung] Ticket ${ticket._id} has no valid termin to cancel.`);
        ticket.state = 'geschlossen.storniert';
        return;
    }

    try {
        await deleteEvent(termin.room, ticket.id);
        ticket.state = 'geschlossen.storniert';
        console.log(`[Raumreservierung] Termin for ticket ${ticket.id} storniert.`);
    } catch (err) {
        console.error(`[Raumreservierung] Failed to delete event for ${ticket.id}:`, err);
    }
}

async function abschliessen(ticket) {
    if (ticket.state !== 'offen.eingetragen') return;

    const date = ticket.get('date');
    // Check if the appointment date has passed
    if (!date) return;

    // Use current time and compare with the date boundary
    const ticketDate = parseISO(date);
    // Set to end of day to close it the day AFTER
    ticketDate.setHours(23, 59, 59, 999);

    if (isBefore(ticketDate, new Date())) {
        ticket.state = 'geschlossen.ok';
        console.log(`[Raumreservierung] Datums-Timeout erreicht. Ticket ${ticket._id} abgeschlossen.`);
    }
}

async function verschieben(ticket) {
    if (ticket.state !== 'offen.verschoben') return;

    const date = ticket.get('date');
    const termin = ticket.get('termin');

    if (!date || !termin || !termin.room || !termin.start || !termin.end) {
        console.error(`[Raumreservierung] Invalid ticket data for ${ticket._id}: Missing termin or date.`);
        return;
    }

    try {
        // Delete the old event from whatever calendar it was in
        await deleteEventByTicketId(ticket.id);

        // caldav.js addEvent will overwrite if the uid is the same and the calendar is the same.
        // It uses PUT on the specific ICS file, so it acts as an upset.
        await addEvent(
            termin.room,
            ticket.id,
            date,
            termin.start,
            termin.end,
            ticket.description || ticket.title
        );
        ticket.state = 'offen.eingetragen';
        console.log(`[Raumreservierung] Termin for ticket ${ticket.id} verschoben.`);
    } catch (err) {
        console.error(`[Raumreservierung] Failed to reschedule event for ${ticket.id}:`, err);
    }
}

module.exports = {
    eintragen,
    stornieren,
    abschliessen,
    verschieben
};
