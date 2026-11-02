# TIX Ticket System

Tix is a highly flexible, JSON-driven ticket and workflow management system built for educational and administrative environments.

Instead of hardcoding workflows or forms, Tix relies on an intelligent **JSON Schema Engine**. This allows administrators to dynamically design ticket types, complex forms, user permissions, and custom state machines without writing frontend or backend code.

![Tix Overview](frontend/public/vu.svg) <!-- Feel free to add a logo or screenshot here -->

## 🚀 Key Features
- **Dynamic Forms**: Vue 3 powered interface interpreting JSON grids with conditional field visibility via Vue proxy reactivity.
- **Workflow & State Engine**: Granular state transitions, interactive sub-forms, inline actions, and access control scoped directly to state lifecycles.
- **Ticket Relations & Linking**:
  - **Subtickets**: Hierarchical delegation with field mapping and automatic status event propagation to parents.
  - **Duplicates**: Merge redundant reports with interactive target selection, role swapping, and bookmark transfer.
  - **Follow-ups (Reopen)**: Immutable closed tickets; reopening creates clean successor copies in `offen.neu` with audit trail links.
  - **Starred Bookmarks**: Personal watchlist and notification hooks with strict security boundaries.
- **Bot Automation Engine**: Node.js `vm` sandboxing executes JavaScript snippets in the background to handle auto-approvals, notifications, and logic processing based on ticket states.
- **Deep External Integrations**: Built-in support for LDAP (Active Directory), CalDAV (Nextcloud/SOGo) room reservations, and WebUntis 2FA authentication.

## 📚 System Documentation
The system's documentation has been divided into detailed modules in the `docs/` folder:

| Area | Description | Link |
| :--- | :--- | :--- |
| **Architecture** | High-level overview of system components, 'sparsity', and the sandbox concept. | [architecture_overview.md](docs/architecture_overview.md) |
| **Workflow Configuration** | Cohesive description: ticket types, states, actions (incl. forms), bots, accesses. | [workflow_configuration.md](docs/workflow_configuration.md) |
| **Relations & Bookmarks** | Subtickets, duplicates, follow-ups (reopen), links, and starred bookmarks. | [ticket_relations.md](docs/ticket_relations.md) |
| **Subtickets** | Delegation of tasks via child tickets, field mappings, and parent status logging. | [subtickets.md](docs/subtickets.md) |
| **Frontend & UI** | Vue 3 Dynamic Forms, grid layouts, conditional readonly, and sibling dependencies. | [frontend_forms.md](docs/frontend_forms.md) |
| **Backend & Bots** | JS sandbox module, synchronous vs. asynchronous bots, Mongoose dynamic fields. | [backend_and_bots.md](docs/backend_and_bots.md) |
| **Integrations** | LDAP auth flow, CalDAV room booking & time zones, WebUntis, and Axios proxies. | [integrations_caldav_ldap.md](docs/integrations_caldav_ldap.md) |
| **Testing** | Strategies for integration tests, stateful mocks for CalDAV, and bot idempotency. | [testing_and_verification.md](docs/testing_and_verification.md) |

## 🛠️ Tech Stack
- **Frontend**: Vue 3, Vite, Pinia, Web Awesome Components
- **Backend**: Node.js, Express.js, Mongoose (MongoDB)
- **Integrations**: `axios`, `otpauth` (WebUntis), `xml-js` (CalDAV), `passport-ldapauth`

## 🏃 Getting Started
*(For installation instructions via Docker or local npm setup, see the corresponding future deployment guides in the docs folder)*

```bash
# 1. Start backend
cd backend
npm install
npm run dev

# 2. Start frontend
cd frontend
npm install
npm run dev
```

---
*Tix Workflow-Engine: Configure. Automate. Simplify.*
