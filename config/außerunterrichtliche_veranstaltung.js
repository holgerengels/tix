const { startOfDay, isBefore, differenceInBusinessDays } = require('date-fns');

function dringend(ticket) {
  if (isUrgent(ticket.get('dateFrom'))) {
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

const { getUsers } = require('./auth');

async function acrossDepartments(ticket) {
  if (ticket.acrossDepartments || ticket.dateFrom < ticket.dateUntil) {
    const slUsers = await getUsers(['Schulleitung']);
    if (slUsers && slUsers.length > 0) {
      ticket.assignee = slUsers[0].username;
    } else {
      console.warn("No user found in Schulleitung group for ticket assignment");
    }
  }
}

module.exports = {
  dringend,
  acrossDepartments
};