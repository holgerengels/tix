# TIX Ticket System

Tix is a highly flexible, JSON-driven ticket and workflow management system built for educational and administrative environments.

Instead of hardcoding workflows or forms, Tix relies on an intelligent **JSON Schema Engine**. This allows administrators to dynamically design ticket types, complex forms, user permissions, and custom state machines without writing frontend or backend code.

![Tix Overview](frontend/public/vu.svg) <!-- Ergänze hier gerne ein Logo oder Screenshot -->

## 🚀 Key Features
- **Dynamic Forms**: Vue 3 powered interface interpreting JSON grids with conditional field visibility via Vue proxy reactivity.
- **Bot Automation Engine**: Node.js `vm` sandboxing executes JavaScript snippets in the background to handle auto-approvals, notifications, and logic processing based on ticket states.
- **Deep External Integrations**: Built-in support for LDAP (Active Directory), CalDAV (Nextcloud/SOGo) room reservations, and WebUntis 2FA authentication.
- **Workflow Consistency**: Access control is deeply ingrained into the workflow states, seamlessly updating permissions as a ticket life-cycle progresses.

## 📚 System Documentation
Die Dokumentation des Systems wurde in detaillierte Module im `docs/` Ordner aufgeteilt. Bitte wähle ein Themengebiet:

| Bereich | Beschreibung | Link |
| :--- | :--- | :--- |
| **Architektur** | High-Level Überblick über Systemkomponenten, "Sparsity" und das Sandbox-Konzept. | [architecture_overview.md](docs/architecture_overview.md) |
| **Workflow Konfiguration**| Zusammenhängende Beschreibung: Ticket Typen, States, Actions (inkl. Forms), Bots, Accesses. | [workflow_configuration.md](docs/workflow_configuration.md) |
| **Frontend & UI** | Vue 3 Dynamic Forms, Grid-Layouts, Conditional Readonly und Sibling Dependencies. | [frontend_forms.md](docs/frontend_forms.md) |
| **Backend & Bots** | JS Sandbox Module, Synchronous vs. Asynchronous Bots, Mongoose Dynamic Fields. | [backend_und_bots.md](docs/backend_und_bots.md) |
| **Integrationen** | LDAP Auth-Flow, CalDAV Raumbuchung & Zeitzonen, WebUntis, und Axios Proxies. | [integrations_caldav_ldap.md](docs/integrations_caldav_ldap.md) |
| **Testing** | Strategien für Integration-Tests, Stateful Mocks für CalDAV und Idempotenz von Bots. | [testing_and_verification.md](docs/testing_and_verification.md) |
| **Subtickets** | Delegation von Aufgaben via Kind-Tickets und automatisches Parent-Logging. | [subtickets.md](docs/subtickets.md) |

## 🛠️ Tech Stack
- **Frontend**: Vue 3, Vite, Pinia, Web Awesome Components
- **Backend**: Node.js, Express.js, Mongoose (MongoDB)
- **Integrations**: `axios`, `otpauth` (WebUntis), `xml-js` (CalDAV), `passport-ldapauth`

## 🏃 Getting Started
*(Für Anweisungen zur Installation via Docker oder lokalem npm-Setup siehe die entsprechenden künftigen Deployment-Guides im docs Ordner)*

```bash
# 1. Backend starten
cd backend
npm install
npm run dev

# 2. Frontend starten
cd frontend
npm install
npm run dev
```

---
*Tix Workflow-Engine: Configure. Automate. Simplify.*
