# Subtickets in Tix

Subtickets ermöglichen das Erzeugen von gekoppelten "Kind-Tickets" direkt aus einem bestehenden Ticket (Parent) heraus. Dies ist ideal, um Aufgaben, die einem Hauptticket zugeordnet sind, an andere Abteilungen (z. B. IT oder Hausmeister) zu delegieren.

## 1. Konfiguration im Workflow (`actions`)

Subtickets werden organisch als "Aktionen" in den Workflow-Block des jeweiligen Parent-Tickets eingebettet. Das bedeutet, dass die Berechtigung zur Erstellung von Subtickets durch denselben Mechanismus gesteuert wird wie reguläre Status-Buttons (Rollenbasiert und Statusabhängig).

**Beispiel in `config/it.json`:**
```json
"workflow": [
    {
        "states": ["offen.neu", "offen.inArbeit"],
        "actions": [
            {
                "name": "Subticket erstellen",
                "groups": ["@assignee", "Netzwerkteam"],
                "subTickets": ["IT-Ticket"]
            }
        ]
    }
]
```
Diese Konfiguration blendet im Frontend einen Subticket-Dropdown für autorisierte Nutzer (`@assignee` oder `Netzwerkteam`) ein, wenn das Ticket im Status `neu` oder `inArbeit` ist. Erlaubt ist die Erstellung von `IT-Ticket` Subtickets.

## 2. Log-Schatten-Kopien (Parent Logging)

Oft soll das Hauptticket den globalen Überblick behalten. Tix bietet die Eigenschaft `logStatusToParent`, die im Hauptblock der Workflow-Config eines Typs aktiviert wird.

```json
{
    "type": "IT-Ticket",
    "subTickets": {
        "logStatusToParent": true
    },
    ...
}
```

Ist dies `true`, überwacht die Backend-Route für Ticket-Aktionen (`POST /api/tickets/:id/action`) jeden Statuswechsel eines *Subtickets*. Ändert sich der Status, schreibt der System-Bot automatisch einen Kommentar im verbundenen Parent-Ticket (z. B. "Subticket ITT-5 ist nun im Status offen.inArbeit"). So bleibt das Mutterticket jederzeit auf dem neuesten Stand, ohne dass die Akteure manuell Report erstatten müssen.

## 3. Datenmodell

Subtickets speichern einen direkten Verweis auf ihr Parent-Ticket über das Feld `parentTicket`. 

```javascript
parentTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }
```
Um Inkonsistenzen zu vermeiden (Single Source of Truth), speichert das Parent-Ticket *kein* Array seiner Kinder. Die Zuweisung wird bei Bedarf per `Ticket.find({ parentTicket: req.query.id })` zusammengesucht und an die Frontend-Response angehängt.

Im Frontend (`TicketView.vue`) werden Subtickets und Parent-Tickets klar per Hierarchie-Badge (`⮡` für Subtickets, `⮤` für Parent-Link) gekennzeichnet.
