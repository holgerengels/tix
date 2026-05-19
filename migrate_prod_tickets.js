const API_BASE_URL = 'https://tix.valckenburgschule.de/api';
// Ersetze diese Zugangsdaten durch den echten Admin-Benutzer
const ADMIN_USERNAME = 'holger_engels';
const ADMIN_PASSWORD = '3f3l@nt!';

async function migrateTickets() {
    console.log('Starte Ticket-Migration...');

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

        if (!loginRes.ok) {
            throw new Error(`Login fehlgeschlagen: ${loginRes.status} ${loginRes.statusText}`);
        }

        const loginData = await loginRes.json();
        const token = loginData.accessToken || loginData.token;
        if (!token) throw new Error("Kein Token in der Login-Antwort gefunden: " + JSON.stringify(loginData));
        console.log('Login erfolgreich.');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // 2. Migration-Map definieren
        const stateMapping = {
            'offen.erledigt': 'geschlossen.erledigt',
            'offen.abgelehnt': 'geschlossen.abgelehnt'
        };

        // 3. Tickets für jeden Status migrieren
        for (const [oldState, newState] of Object.entries(stateMapping)) {
            let hasMore = true;
            let migratedCount = 0;

            while (hasMore) {
                console.log(`\nSuche nach Tickets im Status '${oldState}'...`);
                const response = await fetch(`${API_BASE_URL}/tickets?filter=admin&status=${oldState}`, {
                    method: 'GET',
                    headers
                });

                if (!response.ok) {
                    throw new Error(`Fehler beim Abrufen der Tickets: ${response.status} ${response.statusText}`);
                }

                const tickets = await response.json();

                if (tickets.length === 0) {
                    console.log(`Keine weiteren Tickets im Status '${oldState}' gefunden.`);
                    hasMore = false;
                    break;
                }

                console.log(`${tickets.length} Tickets im Status '${oldState}' gefunden. Beginne Update auf '${newState}'...`);

                for (const ticket of tickets) {
                    try {
                        const updateRes = await fetch(`${API_BASE_URL}/tickets/${ticket._id}/action`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                actionName: 'editieren',
                                formData: { state: newState }
                            })
                        });

                        if (!updateRes.ok) {
                            const errorData = await updateRes.text();
                            throw new Error(`HTTP ${updateRes.status}: ${errorData}`);
                        }

                        console.log(`✅ Ticket ${ticket.id} (${ticket._id}) aktualisiert auf '${newState}'.`);
                        migratedCount++;
                    } catch (err) {
                        console.error(`❌ Fehler beim Update von Ticket ${ticket.id} (${ticket._id}):`, err.message);
                    }

                    // Kurze Pause, um die Serverlast in der Produktion niedrig zu halten
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            console.log(`\nZusammenfassung: ${migratedCount} Tickets von '${oldState}' auf '${newState}' migriert.`);
        }

        console.log('\nMigration abgeschlossen!');

    } catch (err) {
        console.error('\nKritischer Fehler während der Migration:', err.message);
    }
}

// Skript ausführen
migrateTickets();
