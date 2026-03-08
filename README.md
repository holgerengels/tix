# Tix Workflow-Engine: Konfiguration & Flexibilität

Dieses Dokument beschreibt die Struktur der Workflow-JSON-Dateien (z.B. `stundenplan.json`, `it.json`), die das Herzstück des Tix-Ticket-Systems bilden. Durch diese flexiblen Konfigurationsdateien lassen sich das Datenmodell, die Benutzeroberfläche (Grid, Views), die Zugriffskontrolle, Statusübergänge und automatisierte Aktionen für verschiedene Ticket-Typen vollständig und dynamisch definieren.

## 1. Grundstruktur einer Workflow-JSON

Jede Workflow-Datei definiert einen spezifischen Ticket-Typ und besteht aus folgenden Hauptbereichen:

| Eigenschaft | Typ | Beschreibung |
| :--- | :--- | :--- |
| `type` | String | Der Anzeigename des Ticket-Typs (z.B. "IT-Ticket"). |
| `abbreviation` | String | Ein Kürzel für die Ticket-Nummer (z.B. "ITT"). |
| `template` | String | Eine dynamische Vorlage für den Ticket-Titel in Listen. Unterstützt JavaScript-Ausdrücke (z.B. `{{ticket.location}} {{ticket.category}}`). |
| `fields` | Array | Definition aller Datenfelder, die ein Ticket dieses Typs besitzt. Optionen umfassen Eingabetypen (Select, Autocomplete, etc.) und Bedingungen. |
| `validations` | Array | (Optional) Globale, feldübergreifende Validierungsregeln mit Ausdrücken. |
| `grid` | Array | Definition des Layouts für die Detailansicht mittels CSS-Grid-Areas. |
| `workflow` | Array | Definiert die Statusübergänge und verfügbaren Aktionen in Abhängigkeit vom aktuellen Status und der Rechtegruppe. |
| `bots` | Array | (Optional) Definition von Hintergrund-Bots, die periodisch (z.B. bei einem bestimmten Status) ausgeführt werden. |
| `access` | Array | Rollen- und Rechtekonfiguration für Basis-Operationen (`create`, `read`, `edit`, `delete`, `undo`, `comment`). |
| `forms` | Array | (Optional) Definition von dynamischen Unterformularen, die bei bestimmten Workflow-Aktionen aufgerufen werden. |
| `states` | Array | Definition aller möglichen Statuswerte, ihrer Bezeichnungen und farblichen Kennzeichnungen (z.B. für Badges). |

---

## 2. Flexibilität & Möglichkeiten (mit Beispielen)

Die wahre Stärke des Systems liegt in der Unterstützung von dynamischen JavaScript-Ausdrücken innerhalb der Konfiguration. Hierdurch lassen sich äußerst komplexe Abhängigkeiten und Geschäftslogiken abbilden, ohne den Quellcode der Anwendung ändern zu müssen.

### A. Dynamische Templates (Template Expressions)
Titel und Darstellungen können mithilfe von Ternary-Operatoren oder Funktionen dynamisch anhand der Eingabedaten generiert werden.

**Beispiel:**
```json
"template": "{{ticket.day}} {{ ticket.lessons ? (ticket.lessons.min == ticket.lessons.max ? ticket.lessons.min : ticket.lessons.min + '..' + ticket.lessons.max) : (ticket.dateFrom + ' ' + ticket.lessonFrom + ' - ' + ticket.dateUntil + ' ' + ticket.lessonUntil) }}"
```
*Erklärung:* Es wird einzeilig abgebildet: Gibt es feste `lessons`, wird abgeleitet, ob es nur eine oder mehrere sind. Wenn es keine `lessons` gibt, fällt das Template automatisch auf Datumswerte (`dateFrom` bis `dateUntil`) zurück.

### B. Dynamische Skripte & Aktionen (Workflows)
Statusübergänge und komplexe Aktionen werden direkt und transparent als JavaScript-Code (`script`) in den Aktionen definiert.

**Beispiel:**
```json
"workflow": [
    {
        "states": ["offen.neu", "offen.inArbeit"],
        "actions": [
            {
                "name": "bearbeiten",
                "groups": ["@assignee", "Schulleitung", "Netzwerkteam"],
                "form": "bearbeiten"
            }
        ]
    }
]
```
*Erklärung:* Die Aktion "bearbeiten" steht nur im neu- oder inArbeit-Status zur Verfügung und das auch nur für explizite Rollen/Personen (`@assignee` referenziert flexibel den Besitzer des Tickets). Die Aktion öffnet lediglich das zugehörige Formular (ActionView). Ein Statusübergang erfolgt erst, wenn der Benutzer im Formular einen Button anklickt und dessen spezifisches Skript ausgeführt wird.

### C. Dynamische Pflichtfelder & Sichtbarkeiten
Die Konfiguration des Layouts kann ebenfalls Logik enthalten. Ob ein Feld ein Pflichtfeld ist, kann von den Werten in anderen Feldern abhängen.

**Beispiel:**
```json
{
    "name": "lessonFrom",
    "label": "Stunde von",
    "type": "Lesson",
    "required": "{{ticket.dateFrom ? true : false}}",
    "indicator": "{{ticket.dateUntil > ticket.dateFrom ? 'from' : ''}}"
}
```
*Erklärung:* Das Feld `lessonFrom` wird erst und nur dann zu einem echten Pflichtfeld (`required`), wenn das Feld `dateFrom` ausgefüllt wurde.

### D. Komplexe Validierungen
Es gibt sowohl Validierungen auf Feldebene als auch ticketweite (`validations`). Beide überprüfen Nutzereingaben in Echtzeit über JS.

**Beispiel auf Feldebene (mit Datumsfunktion):**
```json
{
    "name": "dateFrom",
    "type": "Date",
    "validation": {
        "expression": "!ticket.dateFrom || ticket.dateFrom >= format(now, 'yyyy-MM-dd')",
        "message": "Datum von kann nicht in der Vergangenheit liegen"
    }
}
```

**Beispiel Ticket-weit (Abhängigkeiten zwischen Feldern):**
```json
"validations": [
    {
        "name": "dateRange",
        "expression": "!ticket.dateFrom || !ticket.dateUntil || ticket.dateFrom <= ticket.dateUntil",
        "message": "Datum von kann nicht nach Datum bis liegen"
    }
]
```

### E. Dynamisches UI Layout (Grid)
Anstelle komplexer HTML-Strukturen, lässt sich das Layout der Detailansicht wie ein standardisiertes CSS-Grid auf String-Basis textuell arrangieren:

**Beispiel:**
```json
"grid": [
    "title title title title",
    "badges badges badges badges",
    "description description description description",
    "location location category category",
    "assignee assignee assignee assignee"
]
```
*Erklärung:* Das Layout hat 4 semantische Spalten. Das Feld `description` nimmt die volle Breite (4 Spalten) ein, während sich `location` und `category` die Breite exakt in der Mitte teilen (jeweils 2 abgedeckte Spalten namens "location" und "category").

### F. Automatisierte Hintergrund-Bots
Das System erlaubt die Definition von unerschrockenen Hintergrund-Bots, die bestimmte Skripte außerhalb der eigentlichen Nutzer-Benutzeroberfläche triggern.

**Beispiel:**
```json
"bots": [
    {
        "name": "dringend",
        "states": ["offen.neu"],
        "script": "dringend(ticket)"
    }
]
```
*Erklärung:* Für alle Tickets, die im Status `offen.neu` stehen (und ggf. zu lange unangetastet ausharren), wird periodisch das Backend-Skript `dringend(ticket)` ausgeführt, was beispielsweise Emails triggert oder Eskalations-Badges setzt.

### G. Formular-Einbettung in Aktionen
Anstatt nur einen Status blind von A nach B umzuschalten, können Workflow-Schritte von der Eingabe zusätzlicher Informationen abhängig gemacht werden (`forms`).

**Beispiel:**
```json
"forms": [
    {
        "name": "aufgabe.bearbeiten",
        "title": "Aufgabe bearbeiten",
        "fields": [
            { "name": "badges", "visible": true }
        ],
        "actions": [
            { "name": "abgelehnt", "script": "ticket.state = 'offen.abgelehnt'" },
            { "name": "erledigt", "script": "ticket.state = 'offen.erledigt'" },
            { "name": "in Arbeit", "script": "ticket.state = 'offen.inArbeit'" }
        ]
    }
]
```
*Erklärung:* Bei Auswahl einer Aktion (die auf dieses Form verweist), öffnet sich ein modulares, auf die Aktion reduziertes Unterformular. Es ist auf das Wesentliche (`badges`) beschränkt und bietet wiederum Unter-Aktionen (Submit-Buttons) an, mit denen ein Ticket präzise abgewickelt werden kann.

---
**Fazit:**
Durch diese strikt JSON-gesteuerte Architektur agiert Tix als mächtige Low-Code-Engine. Komplett neue Geschäftsprozesse, neue Ticketarten, oder Berechtigungsmasken können einfach durch das Hinzufügen oder Anpassen einer einzigen JSON-Datei in `/config/` implementiert werden. Die dynamische Auswertung von `{{ ... }}`-JavaScript-Ausdrücken garantiert höchste Flexibilität in der Datenvalidierung, Berechtigung und bedingten Anzeigen.
