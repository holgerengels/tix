# Ticket Relations, Follow-ups, Duplicates & Starred

Tix provides a comprehensive set of mechanisms for linking, organizing, and tracking tickets beyond simple single-ticket lifecycles. This document details how **Subtickets**, **Duplicates**, **Follow-ups (Reopen)**, and **Starred (Bookmarks)** are configured, stored, visualized, and secured.

---

## 1. Overview of Connection Types

Connections between tickets fall into two architectural categories:

| Relation | Mechanism | Direction / Cardinality | Target Closed State | UI Representation |
| :--- | :--- | :--- | :--- | :--- |
| **Subticket** | Hierarchical (`parentTicket` & `subTickets`) | 1:N (Parent has multiple child tickets) | Standard workflow states | `⮤ <ParentId>` on child<br/>`⮡ <SubId>` on parent |
| **Follow-up (Reopen)** | Directed link (`type: 'follows'`) | 1:1 directed chain (`prev ← next`) | `geschlossen.wiedereröffnet` | `↶ Fortsetzung von <prev>`<br/>`↷ Wiedereröffnet als <next>` |
| **Duplicate** | Directed link (`type: 'duplicates'`) | N:1 (`duplicate → master`) | `geschlossen.redundant` | `⧉ Duplikat von <master>`<br/>`⧉ Duplikat: <duplicate>` |
| **Related** | Directed link (`type: 'relates'`) | N:N generic reference | Active / Any | `↔ Verwandt mit <id>` |
| **Starred** | Bookmark array (`starredBy: [user]`) | N:M (Users bookmark tickets) | N/A (Bookmark) | Star icon ★ / Filter `filter=starred` |

---

## 2. Subtickets (Hierarchical Delegation)

Subtickets allow decomposing large or cross-departmental requests (e.g. organizing a conference or setting up an event) into distinct child tasks assigned to separate workflows (e.g., room reservations, catering, IT support).

### 2.1 Configuration
Subtickets are defined at two levels in the parent workflow JSON:
1. **Action level (`workflow[].actions[].subTickets`)**: Dictates in which state and to which user groups the "Subticket erstellen" dropdown is visible.
2. **Root level (`subTickets: [...]`)**: Configures field mappings and event propagation from parent to child.

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
    }
]
```

### 2.2 Lifecycle & Status Logging (`logStatusToParent`)
* When creating a subticket, the frontend routes to `/tickets/new?type=<ChildType>&parent=<ParentId>` and prefills mapped fields.
* The child ticket stores `parentTicket: "<ParentId>"`.
* When `"logStatusToParent": true` is enabled, any status change on the child ticket automatically logs an audit comment to the parent ticket (e.g., *„Subticket RES-4 (Raumreservierung) hat den Status zu 'in Arbeit' gewechselt.“*).
* See [`subtickets.md`](subtickets.md) for full mapping details and bot synchronization patterns.

---

## 3. Duplicates (`link: "duplicate"`)

When multiple users report the same issue or submit identical requests, tickets can be merged/closed as duplicates of a primary "master" ticket.

### 3.1 Workflow Configuration
To enable duplicate handling in a workflow:
1. Include the state `geschlossen.redundant` in the workflow's `states` array.
2. Add an action with `"link": "duplicate"` to the desired open states:

```json
{
    "states": ["offen.neu", "offen.inArbeit"],
    "actions": [
        {
            "name": "als Duplikat schließen",
            "groups": ["@assignee", "Netzwerkteam", "Hausmeister"],
            "optional": true,
            "link": "duplicate"
        }
    ]
}
```

### 3.2 Duplicate Dialog (`DuplicateTicketDialog.vue`)
Executing the duplicate action opens an interactive dialog:
* **Target Ticket Search**: Search and select the master ticket by ID or title.
* **Role Swap (⇄)**: Users can easily swap which ticket is closed as the duplicate and which ticket remains active as the master.
* **Add Creator to Favorites (Starred)**: An optional checkbox allows adding the duplicate ticket's creator to the `starredBy` list of the master ticket, ensuring they receive updates on the issue.
* **Closing Comment**: A comment explaining the duplication can be added to the duplicate ticket.

### 3.3 Backend Execution & Undoability
When confirmed:
* The duplicate ticket's state transitions to `geschlossen.redundant`.
* A directed link is stored on the duplicate ticket: `{ type: 'duplicates', ticket: target.id, created, creator }`.
* Audit log entries are written to both tickets (e.g. *„ITT-12 als Duplikat markiert von ITT-5“*).
* The action is **undoable**: an authorized user can click *Undo* on the duplicate ticket to revert the state to its previous value, remove the duplicate link, and clean up the master ticket's favorites if applicable.

---

## 4. Follow-ups / Reopen (`link: "reopen"`)

In Tix, **closed tickets are immutable**: once a ticket reaches a closed state (`geschlossen.*`), fields cannot be edited and comments cannot be posted. This preserves audit history.

When a closed issue reoccurs or requires further action, a **reopen / follow-up** action is used. Instead of mutating the closed ticket, it creates a **new ticket in state `offen.neu`** that links back to the predecessor.

### 4.1 Workflow Configuration
1. Include the state `geschlossen.wiedereröffnet` in the workflow's `states` array.
2. Add an action with `"link": "reopen"` to eligible closed states:

```json
{
    "states": ["geschlossen.erledigt", "geschlossen.abgelehnt"],
    "actions": [
        {
            "name": "wiedereröffnen",
            "groups": ["@creator", "Hausmeister", "Schulleitung"],
            "optional": true,
            "link": "reopen"
        }
    ]
}
```

> [!IMPORTANT]
> The target state `geschlossen.wiedereröffnet` must **never** offer a reopen action itself. This rule prevents reopening the same ticket multiple times and avoids branching histories.

### 4.2 Reopen Execution Flow
1. Clicking the action navigates to `/tickets/new?type=<type>&reopen=<id>`.
2. The form is prefilled with all user-entered data from the predecessor (excluding `state`, `assignee`, and `parentTicket`).
3. The user can adjust fields and add an explanation for why the ticket was reopened.
4. When submitted (`POST /api/tickets` with `reopenOf: "<id>"`):
   * The backend atomically transitions the predecessor to `geschlossen.wiedereröffnet`.
   * The new ticket is created with `{ type: 'follows', ticket: predecessor.id, created, creator }`.
   * **Creator preservation**: The new ticket retains the original `creator` of the predecessor.
   * **Reopening user attribution**: If a different user reopened the ticket, they are recorded as the link `creator` and automatically added to `starredBy`.

---

## 5. Starred / Favorites (`starredBy`)

Users can bookmark tickets by clicking the star icon in the ticket header or detail views.

### 5.1 Functionality
* **Bookmarking**: Quickly access watched tickets via `/api/tickets?filter=starred` or the navigation menu.
* **Notification Subscription**: Users listed in `starredBy` receive email / WebPush / Nextcloud Talk notifications when the ticket is updated or commented on.
* **Automatic Favoriting**: Reopening users and creators of duplicate tickets are automatically added to `starredBy` to keep them informed.

### 5.2 ⚠️ Security Constraint: No Read Access
> [!CAUTION]
> `starredBy` is **strictly a personal bookmark and notification hook**; it **NEVER grants read permissions**.
>
> Even if a user's username is present in a ticket's `starredBy` array, they cannot view the ticket, its comments, its attachments, or its audit logs unless they are explicitly authorized by the workflow's `access.read` rules or are the ticket's `creator` or `assignee`.
>
> Any endpoint querying `filter=starred` automatically enforces read-permission scoping.

---

## 6. Data Model & REST API

### 6.1 Database Schema (`Ticket.js`)
```javascript
// Hierarchical Parent Link
parentTicket: { type: String, index: true },

// Non-hierarchical Directed Links
links: [{
    type: { type: String, enum: ['follows', 'duplicates', 'relates'], required: true },
    ticket: { type: String, required: true },
    created: { type: Date, default: Date.now },
    creator: { type: String }
}],

// Bookmarks / Watchers
starredBy: [{ type: String, lowercase: true, index: true }]
```

### 6.2 Virtual Property: `relatedTickets`
Non-hierarchical links are stored only on the source ticket. When tickets are retrieved via `GET /api/tickets` or `GET /api/tickets/:id`, the backend automatically resolves both incoming and outgoing connections into a unified `relatedTickets` array:

```json
"relatedTickets": [
    {
        "id": "HSM-1",
        "type": "Hausmeisterauftrag",
        "state": "geschlossen.wiedereröffnet",
        "title": "Schloss defekt",
        "linkType": "follows",
        "direction": "out"
    },
    {
        "id": "HSM-4",
        "type": "Hausmeisterauftrag",
        "state": "geschlossen.redundant",
        "title": "Schloss klemmt",
        "linkType": "duplicates",
        "direction": "in"
    }
]
```

### 6.3 Star Endpoints
* `POST /api/tickets/:id/star`: Adds the current user to `starredBy`.
* `DELETE /api/tickets/:id/star`: Removes the current user from `starredBy`.
* `GET /api/tickets?filter=starred`: Returns all starred tickets the user is permitted to read.

---

## 7. Frontend Integration

* **[RelatedTicketTags.vue](file:///home/holger/jdevel/tix/frontend/src/components/RelatedTicketTags.vue)**: Renders non-hierarchical connection tags with clear directional glyphs:
  * `follows` (`out`): `↶ Fortsetzung von <ID>`
  * `follows` (`in`): `↷ Wiedereröffnet als <ID>`
  * `duplicates` (`out`): `⧉ Duplikat von <ID>`
  * `duplicates` (`in`): `⧉ Duplikat: <ID>`
  * `relates`: `↔ Verwandt mit <ID>`
* **Parent & Subticket Tags**: Rendered with tree hierarchy symbols:
  * `⮤ <ParentID>`
  * `⮡ <SubID> (<Status>)`
* **[DuplicateTicketDialog.vue](file:///home/holger/jdevel/tix/frontend/src/components/DuplicateTicketDialog.vue)**: Interactive dialog for searching and linking duplicate tickets.
