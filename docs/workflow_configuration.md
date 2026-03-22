# Workflow Configuration

The heart of Tix is the dynamic workflow engine. Each workflow (or "ticket type") is defined by a JSON file in the `config/` folder. In addition, backend actions (bots) can be provided as context-loaded JavaScript snippets that react asynchronously to state changes.

This documentation describes the overall structure of the JSON configuration for a workflow.

## 1. Ticket Type Basic Data

Every workflow starts with basic information and metadata:

```json
{
    "type": "Raumreservierung",
    "abbreviation": "RES",
    "template": "{{ticket.termin.room || 'Raum'}} - {{ticket.date}}"
}
```

* **type**: The full, human-readable name of the workflow.
* **abbreviation**: A short code from which the ticket IDs are generated (e.g., RES-1, RES-2).
* **template**: A JavaScript expression that dynamically generates the primary title of a ticket in list views. Placeholders can access ticket fields here (like `ticket.date`).

---

## 2. Fields and Layout (Forms)

The forms are structured generically. You define the data fields under `fields` and arrange them under `grid`.

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

* **name**: The property name of the field in the ticket object.
* **type**: The data type (e.g., `String`, `Date`, `Number`, `Boolean`, or complex types like `Termin`).
* **required**: Indicates whether this field is mandatory.
* **validation / visible / readonly**: JavaScript expressions that are evaluated dynamically in the frontend by Vue reactivity. See also [Frontend & UI Details](frontend_forms.md).
* **grid**: Defines the layout. Spacers (`.`) can be used to align elements in the grid.

---

## 3. States

The possible phases or states of a ticket in the workflow are stored under `states`. They define the current step and the visual feedback (like colors) in the UI:

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
Each state gets an internal name (`name`), a label for the user interface, and a color (`color` like blue, green, yellow, red, etc.). The naming structure (e.g., `offen.xyz`, `geschlossen.xyz`) helps categorize open and closed processes.

---

## 4. Permissions (Access)

Access rights determine which user groups can view, create, edit, or delete the ticket:

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

The abbreviation `@creator` is a dynamic group, meaning that the ticket creator has the corresponding rights, even if they have no other global privileges.

---

## 5. Actions (Workflow & Actions)

Actions represent the arrows or transitions between states. They are executed manually by users in the detail view.

Actions are attached to the `workflow` array on a state basis:

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

* **states**: Array of states (from `#3`) in which these actions should be offered.
* At the **action** level:
  * **name**: The button text for the action.
  * **groups**: Who is allowed to click this button? `@creator` is also possible here.
  * **optional**: Indicates whether the action is not the regular workflow path (Green button), but rather a cancellation or postponement, for example (Gray/Red button).
  * **script**: Direct model updates via JS code (often setting a subsequent state: `ticket.state = ...`).
  * **form** (optional): If an action requires a sub-dialog (e.g., entering further details for postponement), the name of a sub-form is specified here.

### Sub-forms (Forms in Actions)

If an action refers to a `form`, this form must be defined separately in the JSON's `forms` array. The dialog box then appears when the action is clicked:

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

Such pop-up forms behave similarly to the base view and can load their own `fields` array and `grid` before the actual hook executes via the inner `script`.

---

## 6. Automations (Bots)

Bots are asynchronous background processes that start on state transitions or periodically.

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

* **name**: Helps identify the bot. Often named after the JS function to be called.
* **states**: The ticket state in which the bot is allowed to trigger the code.
* **schedule** (optional): A CRON expression for bots that are not executed immediately but check at periodic intervals (e.g., nightly closure).
* **script**: The script call. The JavaScript function referenced here (like `abschliessen(ticket)`) must be defined and exported in the corresponding `.js` file of the same name (e.g., `config/raumreservierung.js`).

Further information on the mechanics behind the bots can be found in [Backend & Bots](backend_and_bots.md).
