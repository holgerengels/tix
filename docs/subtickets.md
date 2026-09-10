# Subtickets in Tix

Subtickets allow the creation of linked "child tickets" directly from an existing ticket (parent). This is ideal for delegating tasks assigned to a main ticket to other departments (e.g., IT, janitor, catering, or room reservations).

---

## 1. Workflow Configuration

Subtickets are configured at two levels in the parent workflow JSON:

### 1.1 Action-Level Declaration
In `workflow[].actions[]`, actions with a `subTickets` array define who is allowed to create subtickets and in which states:

```json
"workflow": [
    {
        "states": ["offen.neu", "offen.eingetragen"],
        "actions": [
            {
                "name": "Subticket erstellen",
                "groups": ["@creator", "Schulleitung", "Netzwerkteam"],
                "subTickets": [
                    "Raumreservierung",
                    "Bewirtungsauftrag"
                ]
            }
        ]
    }
]
```

When an authorized user views the ticket in an eligible state, the frontend renders a "Subticket erstellen" dropdown offering the allowed ticket types.

---

### 1.2 Root-Level Subticket Definitions (`subTickets`)
At the root level of the workflow JSON, the `subTickets` array configures field mapping and event propagation for each child type:

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
            "numberOfPersons": "{{ (ticket.participants || []).length }}",
            "breakfastTime": "{{ ticket.timeStart }}",
            "endTime": "{{ ticket.timeEnd }}"
        },
        "logStatusToParent": true
    }
]
```

---

## 2. Features and Capabilities

### 2.1 Generic Field Mapping
When a subticket is created from a parent ticket, the frontend navigates to `/tickets/new?type=<ChildType>&parent=<ParentId>`. The `NewTicketView` evaluates each mapping expression against the parent ticket data:

* **Dot-Notation Support**: Target paths like `termin.start` or `nested.obj.prop` are automatically resolved and constructed into deep object structures.
* **Dynamic Template Expressions**: Values are evaluated using the standard `{{ ... }}` template engine (e.g. accessing parent ticket attributes, formatting dates, or calculating list lengths `{{ (ticket.participants || []).length }}`).
* **Graceful Skipping**: If a mapping expression evaluates to `null`, `undefined`, or `""`, the property is omitted, leaving the field empty for manual user entry.

### 2.2 Status Logging (`logStatusToParent`)
When `"logStatusToParent": true` is configured:
Whenever the state of a subticket changes (e.g. `offen.neu` → `offen.inArbeit` → `geschlossen.erledigt`), the backend automatically creates an audit comment in the parent ticket:

> *"Subticket RES-4 (Raumreservierung) hat den Status zu 'in Arbeit' gewechselt."*

This allows coordinators of the parent ticket to track the progress of all delegated tasks without opening each child ticket individually.

---

## 3. Bot Automations & Lifecycle Synchronization

Workflows with subtickets (such as `Konferenz`) often implement backend bots to synchronize lifecycle events:

### 3.1 Date & Time Synchronization (`syncDate`)
If the date or time of a parent event changes, an `insync` bot propagates the updates to all open subtickets:

```javascript
// In config/konferenz.js
async function syncDate(ticket) {
    if (ticket.state !== 'offen.eingetragen') return;
    const date = ticket.get('date');
    const timeStart = ticket.get('timeStart');
    const timeEnd = ticket.get('timeEnd');

    // Find all open subtickets belonging to this parent
    const subTickets = await Ticket.find({
        parentTicket: ticket.id,
        state: { $regex: /^offen\./ }
    });

    for (const sub of subTickets) {
        let changed = false;
        if (sub.get('date') !== date) {
            sub.set('date', date);
            changed = true;
        }
        if (sub.type === 'Raumreservierung' && sub.get('termin')) {
            const termin = { ...sub.get('termin'), start: timeStart, end: timeEnd };
            sub.set('termin', termin);
            changed = true;
        }
        if (changed) {
            await sub.save();
            await runBotsForTicket(sub);
        }
    }
}
```

### 3.2 Cascading Cancellation (`stornieren`)
When a parent ticket is cancelled (e.g. conference cancelled), all open child tickets are automatically cancelled as well:

```javascript
// In config/konferenz.js
async function stornieren(ticket) {
    if (ticket.state !== 'offen.storniert') return;

    const subTickets = await Ticket.find({
        parentTicket: ticket.id,
        state: { $regex: /^offen\./ }
    });

    for (const sub of subTickets) {
        sub.state = 'offen.storniert';
        await sub.save();
        await runBotsForTicket(sub);
    }

    ticket.state = 'geschlossen.storniert';
}
```

---

## 4. Data Model & Architecture

Subtickets store a single direct reference to their parent ticket via the `parentTicket` string field:

```javascript
parentTicket: { type: String, index: true }
```

* **Single Source of Truth**: The parent ticket does **not** store an array of child IDs.
* **Fast Querying**: Children are queried on demand via `Ticket.find({ parentTicket: parentId })`.
* **API Integration**: When retrieving a ticket via `/api/tickets/:id`, the backend automatically queries for child tickets and attaches them as `subTickets: [...]` in the JSON response.

---

## 5. Frontend & UI Representation

* **Breadcrumbs & Badges**:
  * Subtickets display a parent reference badge (`⮤ Übergeordnetes Ticket: KNF-3`). Clicking it navigates directly to the parent.
  * Parent tickets display a collapsible **Subtickets** card listing all active child tickets with their type, current state, and title.
* **Child Ticket Creation Flow**:
  * Selecting a subticket type from the action dropdown opens the standard `/tickets/new` creation page with the parent context preloaded.
  * Pre-filled mapping fields are immediately visible and can be further refined by the user before creating the ticket.
