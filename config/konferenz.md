## Konferenz

Ein Konferenz-Ticket wird verwendet, um Konferenzen und Dienstbesprechungen zu planen, Teilnehmer*innen einzuladen, Räume und Bewirtung zu buchen und das Protokoll zu führen.

### Beispiele

* Gesamtlehrerkonferenz (GLK) zum Schuljahresbeginn (z. B. für alle Lehrkräfte, ohne separate Zusage-Aufforderung)
* Fachschaftssitzung Mathematik am 24.10.
* Abteilungsleiterbesprechung im Konferenzraum (mit RSVP/Einladungen)

### Kalender-Optionen (`calendarMode`)

Beim Anlegen kann festgelegt werden, wie der Termin im Kalender gehandhabt werden soll:
* **nicht eintragen** (`none`): Es wird kein Kalendereintrag erzeugt (z. B. reine Dokumentation/internes Ticket).
* **nur eintragen** (`entry`): Der Termin wird im persönlichen Kalender des Erstellers eingetragen, es werden jedoch **keine** Einladungen oder E-Mails an die Teilnehmer*innen versendet.
* **Einladung versenden** (`invite`, Standard): Der Termin wird angelegt und Kalendereinladungen (RSVP) werden an alle gelisteten Teilnehmer*innen verschickt. Der Antwortstatus (zugesagt/abgesagt) wird regelmäßig im Ticket synchronisiert.

### Zielgruppen & Teilnehmerliste (`groups` & `participants`)

* Über das Mehrfachauswahlfeld **Gruppen** (`groups`) können eine oder mehrere Zielgruppen gewählt werden (z. B. *\<alle\>*, *Lehrkräfte*, *Schulleitung*).
* Bei einer Änderung der Gruppenauswahl wird die Teilnehmerliste (`participants`) automatisch mit den Mitgliedern der gewählten Gruppen befüllt (vorherige Einträge werden ersetzt).
* In der Tabelle `participants` können anschließend weiterhin einzelne Personen manuell hinzugefügt oder entfernt werden.

### Rollen und Protokoll

* **Schulleitung / Ersteller\*in**: Plant den Termin, legt Kalender-Option und Teilnehmer fest und weist bei Bedarf eine\*n **Protokollant\*in** (`assignee`, aus der Gruppe *Lehrkräfte*) zu.
* **Protokollant\*in**: Hat Leserechte auf das Ticket und kann nach Durchführung der Konferenz das Protokoll erfassen und zur Genehmigung einreichen (`protokollieren`).
* **Absegnen & Abschließen**: Die finale Freigabe (`absegnen`) des Protokolls verbleibt bei der Schulleitung bzw. dem/der Ersteller\*in.

### Prozess

[neu] → [eingetragen] → [durchgeführt] → [protokolliert] → [abgeschlossen]

[eingetragen] → [storniert]

* Das Eintragen in den Kalender erfolgt je nach gewählter Kalender-Option automatisch per Bot.
* Die Erstellung von Subtickets (Raumreservierung, Bewirtungsauftrag) erfolgt bei Bedarf durch den Ersteller, die Schulleitung oder das Netzwerkteam.
* Die tatsächliche Anwesenheit der Teilnehmer*innen kann bei der Durchführung im Ticket festgehalten werden.
* Die Stornierung erfolgt durch den Ersteller, die Schulleitung oder das Netzwerkteam.
