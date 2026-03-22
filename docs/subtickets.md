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

## 2. Log Shadow Copies (Parent Logging)

Often, the main ticket should keep a global overview. Tix offers the `logStatusToParent` property, which is activated in the main block of the workflow configuration of a type.

```json
{
    "type": "IT-Ticket",
    "subTickets": {
        "logStatusToParent": true
    },
    ...
}
```

If this is `true`, the backend route for ticket actions (`POST /api/tickets/:id/action`) monitors every state change of a *subticket*. If the state changes, the system bot automatically writes a comment in the linked parent ticket (e.g., "Subticket ITT-5 is now in state offen.inArbeit"). This keeps the parent ticket up to date at all times without the actors having to report manually.

## 3. Data Model

Subtickets store a direct reference to their parent ticket via the `parentTicket` field. 

```javascript
parentTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }
```
To avoid inconsistencies (Single Source of Truth), the parent ticket does *not* store an array of its children. The assignment is gathered on demand via `Ticket.find({ parentTicket: req.query.id })` and attached to the frontend response.

In the frontend (`TicketView.vue`), subtickets and parent tickets are clearly marked with a hierarchy badge (`⮡` for subtickets, `⮤` for parent link).
