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
  if (typeof evaluateTemplate !== 'undefined' && typeof currentWorkflow !== 'undefined' && currentWorkflow.template) {
    text = evaluateTemplate(currentWorkflow.template, ticket);
  }
  text = text.trim();
  if (text) {
    ticket.description = "Aus Stundenplan-Ticket: " + text + "\n" + (ticket.description || "");
  }
  ticket.type = "Vertretungsplan-Ticket";
}

module.exports = {
  dringend,
  convert
};