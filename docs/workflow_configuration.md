# Workflow Configuration

The heart of Tix is the dynamic workflow engine. Each workflow (or "ticket type") is defined by a JSON file in the `config/` folder. In addition, backend actions (bots) can be provided as context-loaded JavaScript snippets that react asynchronously to state changes.

This documentation describes the overall structure of the JSON configuration for a workflow.

---

## 1. Ticket Type Basic Data

Every workflow starts with basic information and metadata:

```json
{
    "type": "Raumreservierung",
    "typeVerbose": "Raumreservierung (Besprechungsräume)",
    "abbreviation": "RES",
    "template": "{{ticket.termin.room || 'Raum'}} - {{ticket.date}}"
}
```

* **`type`**: The full, unique identifier and title of the workflow.
* **`typeVerbose`** *(optional)*: A more descriptive display name used in the ticket creation wizard (`NewTicketView`), helpful when differentiating similar workflows (e.g., `Abwesenheit (Sonstiges)` vs. `Abwesenheit (Krankmeldung)`).
* **`abbreviation`**: A short code from which human-readable ticket IDs are generated (e.g., `RES-1`, `KNF-4`).
* **`template`**: A JavaScript expression that dynamically generates the primary title of a ticket in list views. Placeholders can access ticket fields here (like `ticket.date` or `ticket.termin.room`).

---

## 2. Fields and Layout (Forms)

The forms are structured generically. You define the data fields under `fields` and arrange them visually under `grid`.

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
        "date date timeStart timeEnd"
    ]
```

### 2.1 Field Properties

| Property | Type | Description |
| :--- | :--- | :--- |
| `name` | String | Property name of the field in the ticket data object. |
| `label` | String | Label displayed above/next to the form input. |
| `type` | String | Data type and input component (see [Supported Field Types](#24-supported-field-types)). |
| `required` | Boolean / Expression | Indicates whether this field is mandatory. Can be dynamic (e.g. `"{{ ticket.wantsRoom === true }}"`). |
| `visible` | Boolean / Expression | Dynamic visibility. If `false`, the field is hidden and skipped during validation. |
| `readonly` | Boolean / Expression | Readonly flag. If `true`, the field remains visible but disabled. |
| `default` | Any / Expression | Initial value applied **only if the field is currently empty** (see [Default vs. Computed](#22-default-vs-computed)). |
| `computed` | String (Expression) | Derived value **always re-evaluated and overwriting** the field (see [Default vs. Computed](#22-default-vs-computed)). |
| `validation` | Object | Field-level validation: `{ "expression": "...", "message": "..." }`. |
| `hint` / `help` | String | Helper text displayed below the field. |
| `options` | Array | Option values for `Select` or `Autocomplete` fields. |
| `multiple` | Boolean | For `Select` fields: enables multi-select (stores array of values). |
| `groups` | Array of Strings | For `User` fields: filters selectable accounts by AD/LDAP groups (e.g. `["Lehrkräfte"]`). |
| `allowFreetext` | Boolean | For `User` / `Autocomplete`: allows typing arbitrary text not present in the options list. |
| `rooms` | Array of Strings | For `Termin` fields: restricts available room options in the interactive schedule picker. |
| `indicator` | String / Expression | For `LessonSlider`: `'from'` or `'until'` to format slider tooltips as start or end time. |
| `layout` / `minWidth` | String | For `Array` fields: `layout: "columns"` or `"rows"`, with responsive CSS minWidth. |

---

### 2.2 `default` vs. `computed`

Tix distinguishes cleanly between initial default values and continuously computed fields via `computeFills()`:

```json
{
    "name": "email",
    "label": "E-Mail",
    "type": "Email",
    "default": "{{ lookupUserEmail(name) }}"
},
{
    "name": "title",
    "label": "Titel",
    "type": "Text",
    "computed": "{{ ticket.level + ': ' + ticket.name }}"
}
```

* **`default` (Only fills when empty)**:
  * Applied when the ticket or row is initialized, or whenever sibling fields change and the target field is currently empty (`null`, `undefined`, `""`, or contains an unevaluated template string).
  * Can be a **static value** (e.g. `"eingeladen"`, `1`, `true`, `["Lehrkräfte"]`) or a **dynamic template expression** (`"{{ lookupUserEmail(name) }}"`).
  * **User Overwrite Allowed**: Because it only fills when empty, users can manually modify the populated value afterwards without it being overwritten.
  * In `ObjectArray` subfields, dynamic template defaults are evaluated per row when dependencies are fulfilled and are **not** written verbatim into empty skeleton rows.

* **`computed` (Always overwrites)**:
  * Always calculated from expressions and **strictly overwrites** any existing value whenever dependencies change.
  * Ideal for derived values, formatted display titles, summaries, or fields strictly derived from other inputs.
  * The user cannot manually diverge from the computed result because each form change recomputes the field.

---

### 2.3 Template Expressions & Helpers

Template expressions (`{{ ... }}`) have direct access to:
1. `ticket`: The reactive ticket object (e.g. `ticket.date`, `ticket.state`).
2. Sibling properties directly (e.g. `name`, `level` inside `ObjectArray` row context).
3. Built-in helper functions:

| Helper | Signature | Description |
| :--- | :--- | :--- |
| `lookupUserEmail(username)` | `(username: string) => string \| null` | Resolves the school email (`employeeId@valckenburgschule.de`) from the users store. |
| `firstName(username)` | `(username: string) => string` | Resolves the first name from the user's display name or username. |
| `lastName(username)` | `(username: string) => string` | Resolves the last name from the user's display name or username. |
| `format(date, fmt)` | `(date, fmt: string) => string` | Formats a date using `date-fns` with German locale (`de`). |
| `formatDistance(d1, d2)` | `(d1, d2) => string` | Formats distance between two dates in German. |
| `addDays(date, amount)` | `(date, amount: number) => Date` | Adds days to a date. |
| `subDays(date, amount)` | `(date, amount: number) => Date` | Subtracts days from a date. |
| `now` | `Date` | Current timestamp instance. |
| `currentUser()` | `() => Object` | Currently authenticated user object from `localStorage` (e.g. `{ username, displayName, groups }`). |
| `context.user` | `string \| null` | Username of the logged-in user. |

---

### 2.4 Supported Field Types

* **`Text` / `Email`**: Standard single-line inputs.
* **`Integer` / `Decimal`**: Numeric inputs with step validation.
* **`Boolean`**: Checkbox toggle.
* **`Date` / `Time`**: HTML5 date picker and 24-hour time selector.
* **`Select`**: Dropdown select. Supports `multiple: true` for multi-value arrays (e.g., drinks and food).
* **`Autocomplete`**: Filterable dropdown with `options` array and optional `allowFreetext: true`.
* **`User`**: Specialized autocomplete for school users with `groups: ["Lehrkräfte"]` filter and optional `allowFreetext: true`.
* **`RichText`**: Full WYSIWYG Quill editor for formatted text (e.g. agendas, protocols).
* **`Attachments`**: File upload and attachment manager.
* **`Badges`**: Interactive tag/badge list for quick labeling.
* **`Lesson` / `Lessons`**: School period selector or range slider (1st to 11th period). Supports dynamic `indicator`.
* **`Weekday`**: Day of the week selector.
* **`Termin`**: Interactive CalDAV room and schedule picker with `rooms` filter and date binding.
* **`Array`**: List editor for repeating single values (e.g. list of user names). Supports `layout: "columns"`.
* **`ObjectArray`**: Multi-column table editor for complex repeating objects (see below).

#### `ObjectArray` Configuration
```json
{
    "name": "participants",
    "label": "Teilnehmer*innen",
    "type": "ObjectArray",
    "fixedLength": "{{ ticket.state !== 'offen.neu' }}",
    "fixedOrder": "{{ ticket.state !== 'offen.neu' }}",
    "items": {
        "fields": [
            { "name": "name", "label": "Name", "type": "User", "groups": ["Lehrkräfte"] },
            { "name": "email", "label": "E-Mail", "type": "Email", "default": "{{ lookupUserEmail(name) }}" },
            { "name": "status", "label": "Status", "type": "Select", "options": ["eingeladen", "anwesend", "abwesend"], "default": "eingeladen" }
        ],
        "validation": {
            "expression": "name || email",
            "message": "Name oder E-Mail muss angegeben werden"
        }
    }
}
```
* **`items.fields`**: Array of sub-field definitions. Each subfield can have its own `type`, `default`, `computed`, `readonly`, `visible`, and validation.
* **`fixedLength`**: Disables adding/deleting rows (can be boolean or dynamic template expression).
* **`fixedOrder`**: Disables row drag-and-drop reordering.
* **Row-Level `computeFills`**: When a subfield changes (e.g. `name`), sibling fields in the same row evaluate their `default` and `computed` expressions using the row object as context.

---

## 3. Cross-Field Validations (`validations`)

In addition to field-level validation, workflows support global cross-field validations at the root level:

```json
"validations": [
    {
        "name": "validDateRange",
        "expression": "ticket.dateUntil >= ticket.dateFrom",
        "message": "Das Bis-Datum muss am oder nach dem Von-Datum liegen"
    },
    {
        "name": "validLessonRange",
        "expression": "ticket.dateUntil > ticket.dateFrom || ticket.lessonUntil >= ticket.lessonFrom",
        "message": "Die Bis-Stunde muss nach oder gleich der Von-Stunde sein"
    }
]
```

These validations evaluate reactively on every form change and prevent form submission when any expression evaluates to false.

---

## 4. States

The possible phases or states of a ticket in the workflow are stored under `states`:

```json
    "states": [
        {
            "name": "offen.neu",
            "label": "neu",
            "color": "blue"
        },
        {
            "name": "offen.eingetragen",
            "label": "eingetragen",
            "color": "green"
        },
        {
            "name": "geschlossen.ok",
            "label": "abgeschlossen",
            "color": "green"
        },
        {
            "name": "geschlossen.storniert",
            "label": "storniert",
            "color": "red"
        }
    ]
```
States follow a `category.state` convention (e.g., `offen.*` for active tickets, `geschlossen.*` for resolved/cancelled tickets).

---

## 5. Permissions (Access)

Access rights determine which user groups can perform specific operations on the ticket:

```json
    "access": [
        {
            "name": "create",
            "groups": ["Lehrkräfte", "Schulleitung"]
        },
        {
            "name": "read",
            "groups": ["@creator", "Schulleitung"]
        },
        {
            "name": "edit",
            "groups": ["@creator", "Schulleitung"]
        },
        {
            "name": "delete",
            "groups": ["Schulleitung"]
        },
        {
            "name": "comment",
            "groups": ["@creator", "Schulleitung"]
        },
        {
            "name": "undo",
            "groups": ["Schulleitung", "Vertretungsplanung"]
        }
    ]
```

* **Supported Operations**:
  * **`create`**: Permission to initiate a new ticket of this type.
  * **`read`**: Permission to view the ticket and its history.
  * **`edit`**: Permission to modify form fields in an open state.
  * **`delete`**: Permission to permanently delete the ticket.
  * **`comment`**: Permission to add comments.
  * **`undo`**: Permission to roll back the most recent workflow action or state change via `/api/tickets/:id/undo`.
* **Dynamic Roles**:
  * **`@creator`**: Grants permission to the user who initially filed the ticket.
  * **`@assignee`**: Grants permission to the currently assigned agent.

---

## 6. Actions (Workflow & State Transitions)

Actions represent user-triggered state transitions in the ticket detail view:

```json
    "workflow": [
        {
            "states": ["offen.neu"],
            "actions": [
                {
                    "name": "genehmigen",
                    "groups": ["Schulleitung"],
                    "script": "ticket.state = 'offen.genehmigt'"
                },
                {
                    "name": "ablehnen",
                    "groups": ["Schulleitung"],
                    "inline": "comment",
                    "script": "ticket.state = 'geschlossen.abgelehnt'"
                },
                {
                    "name": "an Stundenplanung",
                    "groups": ["Vertretungsplanung"],
                    "script": "convert(ticket)"
                },
                {
                    "name": "stornieren",
                    "groups": ["@creator"],
                    "optional": true,
                    "script": "ticket.state = 'geschlossen.storniert'"
                }
            ]
        }
    ]
```

* **`states`**: Array of states in which these actions are visible.
* **`name`**: Action button label.
* **`groups`**: Allowed user groups or roles (`@creator`, `@assignee`, etc.).
* **`optional`**: Boolean. If `true`, renders as secondary/danger button (e.g. cancellation or postponement).
* **`script`**: JavaScript statement executed on the backend:
  * State transition: `ticket.state = '...'`
  * Workflow conversion: `convert(ticket)` (converts ticket type between related workflows, e.g. Vertretungsplan ↔ Stundenplan).
* **`form`**: Name of a sub-form defined in the `forms` array (opens a dialog to collect input before transition).
* **`inline`**:
  * `"comment"`: Prompts for a mandatory/optional comment before executing the action.
  * `"assign"`: Prompts for assignee selection.
* **`subTickets`**: Array of ticket types that can be spawned from this action (see [Subtickets](#7-subtickets)).

---

## 7. Subtickets

Subtickets allow decomposing large tasks into linked child tickets for different departments (e.g. room booking or catering for a conference).

### 7.1 Root Configuration (`subTickets`)
Defined at the root level of the workflow JSON:

```json
"subTickets": [
    {
        "type": "Raumreservierung",
        "mapping": {
            "title": "{{ ticket.title }}",
            "date": "{{ ticket.date }}",
            "termin.start": "{{ ticket.timeStart }}",
            "termin.end": "{{ ticket.timeEnd }}"
        },
        "logStatusToParent": true
    },
    {
        "type": "Bewirtungsauftrag",
        "mapping": {
            "title": "{{ ticket.title }}",
            "date": "{{ ticket.date }}",
            "numberOfPersons": "{{ (ticket.participants || []).length }}"
        },
        "logStatusToParent": true
    }
]
```

* **`type`**: Target child ticket type.
* **`mapping`**: Key-value map where keys are target field paths (supports dot-notation, e.g. `termin.start`) and values are `{{ ... }}` expressions evaluated against the parent ticket.
* **`logStatusToParent`**: When `true`, any state change of the subticket automatically posts an audit comment into the parent ticket.

### 7.2 Action-Level Subtickets
Expose subticket creation as an action button:

```json
{
    "name": "Subticket erstellen",
    "groups": ["@creator", "Schulleitung"],
    "subTickets": [
        "Raumreservierung",
        "Bewirtungsauftrag"
    ]
}
```

Detailed architecture, database model, and synchronization bot patterns are documented in [Subtickets in Tix](subtickets.md).

---

## 8. Automations (Bots)

Bots execute backend JavaScript hooks asynchronously or synchronously upon ticket changes, or on a schedule:

```json
    "bots": [
        {
            "name": "eintragen",
            "states": ["offen.neu"],
            "script": "await eintragen(ticket)"
        },
        {
            "name": "syncDate",
            "states": ["offen.eingetragen"],
            "onChange": "insync",
            "script": "await syncDate(ticket)"
        },
        {
            "name": "abschliessen",
            "states": ["offen.eingetragen"],
            "onChange": "async",
            "schedule": "0 1 * * *",
            "script": "await abschliessen(ticket)"
        }
    ]
```

* **`name`**: Bot identifier.
* **`states`**: Array of ticket states in which the bot triggers.
* **`onChange`**:
  * `"insync"`: Executes synchronously inside the ticket save transaction. If it mutates fields or child tickets, changes are persisted before the HTTP response.
  * `"async"`: Runs in the background after the response is returned.
* **`schedule`**: Optional 5-field CRON expression for periodic background runs (e.g. nightly checks).
* **`script`**: JavaScript function call. The function must be implemented and exported in the companion `config/<workflow>.js` file.

See [Backend & Bots](backend_and_bots.md) for deeper lifecycle details.

---

## 9. Process Documentation (`<workflow>.md`)

Every workflow JSON in `config/` is accompanied by a markdown file of the same name (e.g., `config/konferenz.json` ↔ `config/konferenz.md`). 

* **API Endpoint**: Served via `GET /api/config/:type/doc`.
* **UI Integration**: Displayed in `NewTicketView` as a helpful reference sidebar while creating a ticket.
* **Standardized Structure**:
  1. `## <Titel>`: Human-readable name of the process.
  2. Description paragraph: Purpose and scope of the workflow.
  3. `### Beispiele`: Bulleted list of realistic scenarios.
  4. `### Prozess`: Flow diagrams showing transitions (e.g., `[neu] → [genehmigt] → [in Arbeit] → [erledigt]`).
  5. Action assignments: Bulleted summary specifying which user group performs which action.
