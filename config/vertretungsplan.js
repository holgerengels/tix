const { startOfDay, isBefore, differenceInBusinessDays } = require('date-fns');

function dringend(ticket) {
  if (isUrgent(ticket.dateFrom)) {
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

function isUrgent(dateInput) {
  if (!dateInput) return false;
  const targetDate = startOfDay(new Date(dateInput));
  const today = startOfDay(new Date());

  if (isBefore(targetDate, today) || targetDate.getTime() === today.getTime()) {
    return true;
  }

  const diff = differenceInBusinessDays(targetDate, today);
  return diff < 2;
}

function convert(ticket) {
  let text = "";
  if (ticket.dateFrom) text += ticket.dateFrom;
  if (ticket.lessonFrom) text += " " + ticket.lessonFrom;

  let untilText = "";
  if (ticket.dateUntil) untilText += ticket.dateUntil;
  if (ticket.lessonUntil) untilText += " " + ticket.lessonUntil;
  untilText = untilText.trim();

  if (untilText) {
    text += " - " + untilText;
  }

  text = text.trim();
  if (text) {
    ticket.description = "[" + text + "] " + (ticket.description || "");
  }
  ticket.type = "Stundenplan-Ticket";
}

module.exports = {
  dringend,
  convert
};