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

async function korrekturtag(ticket) {
  if (ticket.reason === 'Korrekturtag') {
    const slUsers = await getUsers(['Stellvertretende_Schulleitung']);
    if (slUsers && slUsers.length > 0) {
      ticket.assignee = slUsers[0].username;
    } else {
      console.warn("No user found in Stellvertretende_Schulleitung group for ticket assignment");
    }
  }
}


module.exports = {
  dringend,
  korrekturtag
};