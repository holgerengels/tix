# Workflow Konfiguration

Das Herzstück von Tix ist die dynamische Workflow-Engine. Jeder Workflow (oder "Ticket-Typ") wird durch eine JSON-Datei im `config/` Ordner definiert. Ergänzend können Backend-Aktionen (Bots) als kontextgeladene JavaScript-Snippets hinterlegt werden, die asynchron auf Statuswechsel reagieren.

Diese Dokumentation beschreibt den Gesamtaufbau der JSON-Konfiguration für einen Workflow.

## 1. Ticket-Typ Basisdaten

Jeder Workflow beginnt mit grundlegenden Informationen und Metadaten:

```json
{
    "type": "Raumreservierung",
    "abbreviation": "RES",
    "template": "{{ticket.termin.room || 'Raum'}} - {{ticket.date}}"
}
```

* **type**: Der vollständige, menschenlesbare Name des Workflows.
* **abbreviation**: Ein Kürzel, aus dem die Ticket-IDs generiert werden (z.B. RES-1, RES-2).
* **template**: Ein JavaScript-Ausdruck, der dynamisch den primären Titel eines Tickets in Listenansichten generiert. Hier können Platzhalter auf Ticket-Felder (wie `ticket.date`) zugreifen.

---

## 2. Felder und Layout (Forms)

Die Formulare werden generisch aufgebaut. Man definiert die Datenfelder unter `fields` und ordnet sie unter `grid` an.

```json
    "fields": [
        {
            "name": "date",
            "label": "Datum",
            "type": "Date",
            "required": true,
            "validation": {
                "expression": "ticket.date >= format(now, 'yyyy-MM-dd')",
                "message": "Datum kann nicht in der Vergangenheit liegen"
            }
        }
    ],
    "grid": [
        "date date"
    ]
```

* **name**: Der Eigenschaftenname des Feldes im Ticket-Objekt.
* **type**: Der Datentyp (z.B. `String`, `Date`, `Number`, `Boolean`, oder komplexe Typen wie `Termin`).
* **required**: Gibt an, ob dieses Feld ein Pflichtfeld ist.
* **validation / visible / readonly**: JavaScript-Ausdrücke, die im Frontend dynamisch durch die Vue-Reaktivität ausgewertet werden. Siehe auch [Frontend & UI Details](frontend_forms.md).
* **grid**: Definiert das Layout. Spacers (`.`) können verwendet werden, um Elemente im Grid auszurichten.

---

## 3. Zustände (States)

Die möglichen Phasen oder Zustände eines Tickets im Ablauf werden unter `states` hinterlegt. Sie definieren den aktuellen Schritt und das visuelle Feedback (wie Farben) in der UI:

```json
    "states": [
        {
            "name": "offen.neu",
            "label": "neu",
            "color": "blue"
        },
        {
            "name": "geschlossen.ok",
            "label": "abgeschlossen",
            "color": "green"
        }
    ]
```
Jeder Zustand erhält einen internen Namen (`name`), ein Label für die Benutzeroberfläche und eine Farbe (`color` wie blue, green, yellow, red etc.). Die Bezeichnungs-Struktur (z.B. `offen.xyz`, `geschlossen.xyz`) hilft bei der Kategorisierung von offenen und beendeten Vorgängen.

---

## 4. Berechtigungen (Access)

Zugriffsrechte legen fest, welche Benutzergruppen das Ticket einsehen, erstellen, bearbeiten oder löschen können:

```json
    "access": [
        {
            "name": "create",
            "groups": ["Lehrkräfte", "Schulleitung"]
        },
        {
            "name": "read",
            "groups": ["@creator", "Schulleitung"]
        }
    ]
```

Das Kürzel `@creator` ist eine dynamische Gruppe, das bedeutet, dass der Ersteller des Tickets die entsprechenden Rechte hat, auch wenn er keine weiteren globalen Privilegien besitzt.

---

## 5. Aktionen (Workflow & Actions)

Aktionen stellen die Pfeile oder Transitionen zwischen den Zuständen dar. Sie werden von Benutzern manuell in der Detailansicht ausgeführt.

Aktionen werden auf Statusbasis in das `workflow` Array gehängt:

```json
    "workflow": [
        {
            "states": ["offen.eingetragen"],
            "actions": [
                {
                    "name": "verschieben",
                    "groups": ["@creator"],
                    "optional": true,
                    "form": "verschieben",
                    "script": "ticket.state = 'offen.verschoben'"
                }
            ]
        }
    ]
```

* **states**: Array an Zuständen (aus `#3`), in denen diese Aktionen angeboten werden sollen.
* Auf Ebene der **action**:
  * **name**: Der Button-Text der Aktion.
  * **groups**: Wer darf diesen Button klicken? Auch hier ist `@creator` möglich.
  * **optional**: Gibt an, ob die Aktion nicht der reguläre Workflow-Pfad (Grüner Button) ist, sondern z.B. eine Stornierung oder Verschiebung (Grauer/Roter Button).
  * **script**: Direkte Aktualisierungen des Modells per JS-Code (oft das Setzen eines Folge-Status: `ticket.state = ...`).
  * **form** (optional): Wenn eine Aktion einen Unter-Dialog benötigt (z.B. Eingabe von weiteren Details zur Verschiebung), dann wird hier der Name eines Unter-Formulars angegeben.

### Unter-Formulare (Forms in Actions)

Bezieht sich eine Aktion auf ein `form`, so muss dieses Formular separat im `forms`-Array der JSON definiert sein. Die Dialogbox erscheint dann beim Klick auf die Aktion:

```json
    "forms": [
        {
            "name": "verschieben",
            "title": "Termin verschieben",
            "actions": [
                {
                    "name": "verschieben",
                    "script": "ticket.state = 'offen.verschoben'"
                }
            ]
        }
    ]
```

Solche Pop-Up Formulare verhalten sich ähnlich zur Basisansicht und können ein eigenes `fields`-Array sowie `grid` laden, bevor der eigentliche Hook über das innere `script` ausführt.

---

## 6. Automatisierungen (Bots)

Bots sind asynchrone Hintergrund-Prozesse, die bei Statusübergängen oder periodisch starten.

```json
    "bots": [
        {
            "name": "eintragen",
            "states": ["offen.neu"],
            "script": "eintragen(ticket)"
        },
        {
            "name": "abschliessen",
            "states": ["offen.eingetragen"],
            "onChange": "async",
            "schedule": "0 1 * * *",
            "script": "abschliessen(ticket)"
        }
    ]
```

* **name**: Hilft bei der Identifizierung des Bots. Häufig benannt nach der JS-Funktion, die aufgerufen werden soll.
* **states**: Der Ticket-Status, in dem der Bot den Code triggern darf.
* **schedule** (optional): Ein CRON-Ausdruck für Bots, die nicht sofort ausgeführt werden, sondern in periodischen Intervallen prüfen (z.B. nachts abschließen).
* **script**: Der Skriptaufruf. Die hier referenzierte JavaScript-Funktion (wie `abschliessen(ticket)`) muss in der korrespondierenden `.js` Datei gleichen Namens (z.B. `config/raumreservierung.js`) definiert und exportiert sein.

Weitere Infos zur Mechanik hinter den Bots finden sich in [Backend & Bots](backend_und_bots.md).
