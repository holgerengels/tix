const API_BASE_URL = 'https://tix.valckenburgschule.de/api';
const args = process.argv.slice(2);
if (args.length < 2) {
    console.error("Fehler: Bitte Benutzername und Passwort als Argumente übergeben!");
    console.error("Aufruf: node migrate_ok_tickets.js <username> <password>");
    process.exit(1);
}

const ADMIN_USERNAME = args[0];
const ADMIN_PASSWORD = args[1];

async function migrateOkTickets() {
    console.log('Starte Migration für "geschlossen.ok" Tickets...');

    try {
        // 1. Login
        console.log(`Logge ein als ${ADMIN_USERNAME}...`);
        const loginRes = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: ADMIN_USERNAME,
                password: ADMIN_PASSWORD,
                isPwa: false
            })
        });

        if (!loginRes.ok) throw new Error(`Login fehlgeschlagen: ${loginRes.status}`);

        const loginData = await loginRes.json();
        const token = loginData.accessToken || loginData.token;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        console.log('Login erfolgreich.');

        // 2. Tickets abrufen
        console.log('\nSuche nach Tickets im Status "geschlossen.ok"...');
        const ticketsRes = await fetch(`${API_BASE_URL}/tickets?filter=admin&status=geschlossen.ok`, { headers });
        const tickets = await ticketsRes.json();

        if (tickets.length === 0) {
            console.log('Keine Tickets im Status "geschlossen.ok" gefunden. Nichts zu tun!');
            return;
        }
        console.log(`${tickets.length} Tickets gefunden.`);

        // 3. Typen der betroffenen Tickets ermitteln
        const types = [...new Set(tickets.map(t => t.type))];

        // 4. Logs tageweise abfragen (um das Limit von 100 pro Request zu umgehen)
        // Wir suchen ab heute rückwärts bis zum Erstellungsdatum des ältesten Tickets
        const oldestTicketDate = new Date(Math.min(...tickets.map(t => new Date(t.created).getTime())));
        console.log(`Ältestes Ticket ist vom ${oldestTicketDate.toISOString().split('T')[0]}. Beginne Log-Extraktion...`);

        const logsByTicket = {};

        for (const type of types) {
            let currentDate = new Date();
            console.log(`Lade Logs für Typ: ${type}...`);

            while (currentDate >= oldestTicketDate) {
                const dateString = currentDate.toISOString().split('T')[0];

                const logRes = await fetch(`${API_BASE_URL}/logs?type=${encodeURIComponent(type)}&dateTo=${dateString}`, { headers });
                const logs = await logRes.json();

                if (logs.length > 0) {
                    for (const log of logs) {
                        if (log.ticket && log.ticket._id) {
                            if (!logsByTicket[log.ticket._id]) logsByTicket[log.ticket._id] = [];
                            logsByTicket[log.ticket._id].push(log);
                        }
                    }
                }

                // Einen Tag zurückgehen
                currentDate.setDate(currentDate.getDate() - 1);
            }
        }

        // 5. Tickets auswerten und updaten
        let updatedCount = 0;

        for (const ticket of tickets) {
            let newState = 'geschlossen.erledigt'; // Fallback

            // Abwesenheit/Bewirtung haben Badges, da brauchen wir keine Logs
            if (ticket.badges && ticket.badges.includes('abgelehnt')) {
                newState = 'geschlossen.abgelehnt';
            } else if (ticket.badges && ticket.badges.includes('genehmigt')) {
                newState = 'geschlossen.erledigt';
            } else {
                // In den Logs nach "abgelehnt" oder "ablehnen" suchen
                const tLogs = logsByTicket[ticket._id] || [];
                // Sortiere nach Zeitstempel absteigend (neueste zuerst)
                tLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                for (const log of tLogs) {
                    const action = (log.action || '').toLowerCase();
                    if (action.includes('abgelehnt') || action.includes('ablehnen')) {
                        newState = 'geschlossen.abgelehnt';
                        break;
                    } else if (action.includes('erledigt') || action.includes('genehmigt')) {
                        newState = 'geschlossen.erledigt';
                        break;
                    }
                }
            }

            console.log(`Ticket ${ticket.id} (${ticket.type}) wird auf '${newState}' gesetzt...`);

            try {
                await fetch(`${API_BASE_URL}/tickets/${ticket._id}/action`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        actionName: 'editieren',
                        formData: { state: newState }
                    })
                });
                updatedCount++;
            } catch (err) {
                console.error(`❌ Fehler bei Ticket ${ticket.id}:`, err.message);
            }

            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`\nFertig! Es wurden ${updatedCount} von ${tickets.length} "geschlossen.ok" Tickets migriert.`);

    } catch (err) {
        console.error('Kritischer Fehler:', err.message);
    }
}

migrateOkTickets();
