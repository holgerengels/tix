# Tix System Architecture: Unified Overview

The Tix Ticket System is built as a flexible, JSON-driven platform for managing school administrative workflows. The core design philosophy centers on **Sparsity**, **Dynamic Evaluation**, and **Resilient Integration**.

## 1. System Layers

| Layer | Technology | Primary Role |
| :--- | :--- | :--- |
| **Frontend** | Vue 3, Web Awesome Components | Renders dynamic forms with grid-based layouts and complex interactive components (e.g., Timeline). |
| **Form Engine** | `evaluation.js` (Sandboxed `with` blocks) | Evaluates JSON-defined visibility and validation expressions using native Vue 3 proxy reactivity. |
| **Backend** | Node.js, Express, MongoDB (Mongoose) | Provides a REST API for ticket management, user authentication (LDAP/WebUntis), and workflow execution. |
| **Workflow Engine** | Node.js `vm` (Sandbox) | Executes custom JavaScript logic for bots and actions, ensuring per-ticket automation and state transitions. |
| **Relations & Graph Engine** | MongoDB embedded links & reverse queries | Manages hierarchical subtickets and directed graph links (duplicates, follow-ups/reopens, relations, bookmarks). |
| **Integrations** | Axios, `https-proxy-agent` | Connects the system to external services like LDAP (Active Directory), CalDAV (SOGo/Nextcloud), and WebUntis. |

## 2. Core Technical Concepts

### JSON-Defined UI and Grid Layout
The system uses a `grid` array to describe multi-column layouts. Spacers (`.`) allow horizontal alignment of related fields while maintaining a logical vertical flow for mobile devices. Forms are dynamically generated based on standard configuration files, enabling complete ticket types without code changes.

### Dynamic Reactivity (Proxy-Based)
Field visibility is determined by JavaScript expressions (embedded in `{{ }}`). By evaluating these expressions within a `with(proxy) { ... }` block, the system uses Vue's native dependency tracking to detect when fields should appear or disappear as the user types.

### Linked Graph Relations & Immutability
- **Subtickets**: Hierarchical delegation (`parentTicket` ↔ `subTickets`) with field mapping and automatic status event propagation to parents.
- **Follow-ups (Reopen)**: Closed tickets (`geschlossen.*`) are strictly immutable. Reopening spawns a new ticket in `offen.neu` that links back via `type: 'follows'` (`↶ Fortsetzung von`), atomically moving the predecessor to `geschlossen.wiedereröffnet`.
- **Duplicates**: Consolidates multiple reports via `type: 'duplicates'` (`⧉ Duplikat von`), moving redundant tickets to `geschlossen.redundant`.
- **Starred Bookmarks**: Personal watchlist (`starredBy`) for quick access and notifications. Designed with a strict security boundary: bookmarks never grant read authorization.

### Resilient Integrations in Restricted Environments
The backend is designed for high-security environments, featuring:
- **Mongoose Dynamic Fields**: Using `strict: false` and `ticket.get()`/`toObject()` to reliably access workflow-specific data that is not part of the base schema.
- **Namespace-Agnostic WebDAV Parsing**: Supports both Nextcloud and SOGo's varying XML response patterns for Calendar integration.
- **Sequential Request Processing**: Prevents socket hangs caused by concurrent connection limits on internal Nginx or Mailcow servers.
- **Manual Cookie and Proxy Interceptors**: Overcomes conflicts between standard cookie jars and HTTPS proxy agents in Axios.

## 3. Documentation Directory

The system is documented in the following in-depth files:
- **Workflow Configuration**: [`workflow_configuration.md`](workflow_configuration.md)
- **Ticket Relations & Bookmarks**: [`ticket_relations.md`](ticket_relations.md)
- **Subtickets**: [`subtickets.md`](subtickets.md)
- **Frontend & UI Forms**: [`frontend_forms.md`](frontend_forms.md)
- **Backend & Bots**: [`backend_and_bots.md`](backend_and_bots.md)
- **Integrations**: [`integrations_caldav_ldap.md`](integrations_caldav_ldap.md)
- **Testing & Verification**: [`testing_and_verification.md`](testing_and_verification.md)
