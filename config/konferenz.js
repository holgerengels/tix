const Ticket = require('./models/ticket');
const { parseISO, isBefore } = require('date-fns');
const User = require('./models/user');
const { addEvent, deleteEvent, getEventAttendees } = require('./caldav');

/**
 * Helper to resolve attendees and creator's email address using MongoDB User model.
 */
async function getAttendeesAndCreatorEmail(ticket) {
    const participants = ticket.get('participants') || [];
    const attendees = [];
    
    for (const p of participants) {
        if (p.email) {
            // Direct email (internal or external)
            const cn = p.name || p.email;
            attendees.push({ email: p.email, cn });
        } else if (p.name) {
            // Fallback: look up user in MongoDB
            const userDoc = await User.findOne({ username: p.name.toLowerCase() });
            if (userDoc && userDoc.employeeId) {
                attendees.push({
                    email: `${userDoc.employeeId}@valckenburgschule.de`,
                    cn: userDoc.displayName || p.name
                });
            }
            // No email found → attendance-only participant, skip CalDAV
        }
    }

    let creatorEmail = '';
    if (ticket.creator) {
        const creatorDoc = await User.findOne({ username: ticket.creator.toLowerCase() });
        const creatorAccount = (creatorDoc && creatorDoc.employeeId) ? creatorDoc.employeeId : ticket.creator.toLowerCase();
        creatorEmail = `${creatorAccount}@valckenburgschule.de`;
    }

    return { attendees, creatorEmail };
}

/**
 * Bot: eintragen
 * Triggered when a new Konferenz ticket is created (state: offen.neu).
 * Creates sub-tickets for Raumreservierung and/or Bewirtungsauftrag if requested.
 */
async function eintragen(ticket) {
    if (ticket.state !== 'offen.neu') return;

    const date = ticket.get('date');
    const timeStart = ticket.get('timeStart');
    const timeEnd = ticket.get('timeEnd');

    // Create event on creator's personal calendar
    try {
        const { attendees, creatorEmail } = await getAttendeesAndCreatorEmail(ticket);
        if (creatorEmail) {
            await addEvent(
                'personal',
                ticket.id,
                date,
                timeStart,
                timeEnd,
                ticket.title || 'Konferenz',
                attendees,
                creatorEmail
            );
            console.log(`[Konferenz] Event for ${ticket.id} added to creator's personal calendar (${creatorEmail}).`);
        } else {
            console.warn(`[Konferenz] No creator found for ticket ${ticket.id}, calendar event skipped.`);
        }
    } catch (err) {
        console.warn(`[Konferenz] Failed to create calendar event for creator (possibly missing SOGo superuser permissions for the service account):`, err.message);
    }

    ticket.state = 'offen.eingetragen';
    console.log(`[Konferenz] Ticket ${ticket.id} eingetragen.`);
}

/**
 * Bot: stornieren
 * Triggered when a Konferenz is cancelled (state: offen.storniert).
 * Cascading: finds and cancels all open sub-tickets.
 */
async function stornieren(ticket) {
    if (ticket.state !== 'offen.storniert') return;

    // Delete event from creator's personal calendar
    try {
        const { creatorEmail } = await getAttendeesAndCreatorEmail(ticket);
        if (creatorEmail) {
            await deleteEvent('personal', ticket.id, creatorEmail);
            console.log(`[Konferenz] Event for ${ticket.id} deleted from creator's personal calendar.`);
        }
    } catch (err) {
        console.warn(`[Konferenz] Failed to delete calendar event for creator (possibly missing SOGo superuser permissions):`, err.message);
    }

    // Find all open sub-tickets of this conference
    const subTickets = await Ticket.find({
        parentTicket: ticket.id,
        state: { $regex: /^offen\./ }
    });

    const { runBotsForTicket } = require('./bots');

    for (const sub of subTickets) {
        sub.state = 'offen.storniert';
        await sub.save();
        await runBotsForTicket(sub);
        console.log(`[Konferenz] Subticket ${sub.id} (${sub.type}) storniert.`);
    }

    ticket.state = 'geschlossen.storniert';
    console.log(`[Konferenz] Ticket ${ticket.id} und ${subTickets.length} Subticket(s) storniert.`);
}

/**
 * Bot: syncDate
 * Triggered insync whenever the conference ticket is saved in offen.eingetragen.
 * Propagates date, room, catering, and attendee changes to all open sub-tickets and CalDAV.
 */
async function syncDate(ticket) {
    if (ticket.state !== 'offen.eingetragen') return;

    const date = ticket.get('date');
    if (!date) return;

    const timeStart = ticket.get('timeStart');
    const timeEnd = ticket.get('timeEnd');

    // Update event on creator's personal calendar (including updated attendees & times)
    try {
        const { attendees, creatorEmail } = await getAttendeesAndCreatorEmail(ticket);
        if (creatorEmail && timeStart && timeEnd) {
            await addEvent(
                'personal',
                ticket.id,
                date,
                timeStart,
                timeEnd,
                ticket.title || 'Konferenz',
                attendees,
                creatorEmail
            );
            console.log(`[Konferenz] Calendar event for ${ticket.id} rescheduled on creator's calendar.`);
        }
    } catch (err) {
        console.warn(`[Konferenz] Failed to reschedule calendar event for creator (possibly missing SOGo superuser permissions):`, err.message);
    }

    // Sync date to all open sub-tickets
    const subTickets = await Ticket.find({
        parentTicket: ticket.id,
        state: { $regex: /^offen\./ }
    });

    const { runBotsForTicket } = require('./bots');

    for (const sub of subTickets) {
        let changed = false;

        // Date sync
        if (sub.get('date') !== date) {
            sub.set('date', date);
            sub.markModified('date');
            changed = true;
        }

        // Raumreservierung specific sync
        if (sub.type === 'Raumreservierung') {
            const termin = ticket.get('termin');
            if (termin && JSON.stringify(sub.get('termin')) !== JSON.stringify(termin)) {
                sub.set('termin', termin);
                sub.markModified('termin');
                changed = true;
            }
            if (changed && sub.state === 'offen.eingetragen') {
                sub.state = 'offen.verschoben';
            }
        }

        if (changed) {
            await sub.save();
            await runBotsForTicket(sub);
            console.log(`[Konferenz] Subticket ${sub.id} (${sub.type}) synchronisiert.`);
        }
    }
}

/**
 * Bot: abschliessen
 * Scheduled daily. Closes conferences whose date has passed.
 */
async function abschliessen(ticket) {
    if (ticket.state !== 'offen.eingetragen') return;

    const date = ticket.get('date');
    if (!date) return;

    const ticketDate = parseISO(date);
    ticketDate.setHours(23, 59, 59, 999);

    if (isBefore(ticketDate, new Date())) {
        ticket.state = 'geschlossen.ok';
        console.log(`[Konferenz] Datums-Timeout erreicht. Ticket ${ticket.id} abgeschlossen.`);
    }
}

/**
 * Bot: checkResponses
 * Triggered periodically. Queries CalDAV event for attendee responses and updates participant statuses.
 */
async function checkResponses(ticket) {
    if (ticket.state !== 'offen.eingetragen') return;

    try {
        const { creatorEmail } = await getAttendeesAndCreatorEmail(ticket);
        if (!creatorEmail) return;

        const attendees = await getEventAttendees('personal', ticket.id, creatorEmail);
        if (!attendees || attendees.length === 0) {
            console.log(`[Konferenz] No attendees found in calendar event for ${ticket.id}`);
            return;
        }

        let updated = false;
        const participants = ticket.get('participants') || [];

        for (const attendee of attendees) {
            const username = attendee.email.split('@')[0].toLowerCase();
            const partstat = attendee.partstat ? attendee.partstat.toUpperCase() : 'NEEDS-ACTION';

            // Find participant using either name or resolving employeeId back to username
            let participant = participants.find(p => p.name && p.name.toLowerCase() === username);
            if (!participant) {
                // If username didn't match directly, the email might be employeeId. Find user by employeeId.
                const userDoc = await User.findOne({ employeeId: username });
                if (userDoc) {
                    participant = participants.find(p => p.name && p.name.toLowerCase() === userDoc.username);
                }
            }

            if (participant) {
                let targetStatus = 'eingeladen';
                if (partstat === 'ACCEPTED') {
                    targetStatus = 'anwesend';
                } else if (partstat === 'DECLINED') {
                    targetStatus = 'entschuldigt';
                }

                if (participant.status !== targetStatus) {
                    participant.status = targetStatus;
                    updated = true;
                    console.log(`[Konferenz] Participant ${participant.name} status updated to ${targetStatus} via CalDAV.`);
                }
            }
        }

        if (updated) {
            ticket.set('participants', participants);
            ticket.markModified('participants');
        }
    } catch (err) {
        console.warn(`[Konferenz] Failed to check attendee responses for ${ticket.id} (possibly missing SOGo superuser permissions):`, err.message);
    }
}

module.exports = {
    eintragen,
    stornieren,
    syncDate,
    abschliessen,
    checkResponses
};
