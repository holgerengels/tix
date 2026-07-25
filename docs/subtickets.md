# Subtickets in Tix

Subtickets allow the creation of linked "child tickets" directly from an existing ticket (parent). This is ideal for delegating tasks assigned to a main ticket to other departments (e.g., IT or janitor).

## 1. Configuration in the Workflow (`actions`)

Subtickets are seamlessly embedded as "actions" into the workflow block of the respective parent ticket. This means that the permission to create subtickets is controlled by the same mechanism as regular status buttons (role-based and state-dependent).

**Example in `config/it.json`:**
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
This configuration shows a subticket dropdown in the frontend for authorized users (`@assignee` or `Netzwerkteam`) when the ticket is in the `neu` or `inArbeit` state. It allows the creation of `IT-Ticket` subtickets.

## 2. Subticket Configuration (`subTickets`)

The `subTickets` property in the main config block defines allowed subticket types, optional field mapping, and per-type flags. It is an **array of objects**:

```json
"subTickets": [
    {
        "type": "Bewirtungsauftrag",
        "mapping": {
            "date": "{{ ticket.date }}",
            "room": "{{ ticket.termin ? ticket.termin.room : '' }}",
            "numberOfPersons": "{{ (ticket.participants || []).length }}"
        },
        "logStatusToParent": true
    }
]
```

### Field Mapping

The `mapping` property defines a **generic field-to-expression mapping**. When a user creates a subticket from a parent ticket, the frontend evaluates each mapping expression against the parent ticket data and pre-fills the corresponding fields in the new ticket form.

- Keys are target field names in the subticket (dot-notation supported, e.g., `termin.start`).
- Values are `{{ }}` expressions evaluated against the parent ticket using the standard template engine.
- Empty/null results are skipped (the user fills the field manually).

### `logStatusToParent`

If `logStatusToParent` is `true` for a subticket type, every state change of a subticket of that type automatically writes a comment in the linked parent ticket (e.g., "Subticket ITT-5 is now in state offen.inArbeit").

## 3. Data Model

Subtickets store a direct reference to their parent ticket via the `parentTicket` field using the readable string `id` (z.B. `IT-1`). This field is indexed for performant lookups.

```javascript
parentTicket: { type: String, index: true }
```
To avoid inconsistencies (Single Source of Truth), the parent ticket does *not* store an array of its children. The assignment is gathered on demand via `Ticket.find({ parentTicket: req.query.id })` and attached to the frontend response.

In the frontend (`TicketView.vue`), subtickets and parent tickets are clearly marked with a hierarchy badge (`⮡` for subtickets, `⮤` for parent link).
