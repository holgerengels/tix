# Tix Backend, Bots and Workflows

The Tix backend operates in potentially restricted environments (e.g., school Docker containers with internal proxies) and uses sandboxed execution for flexible workflow logic.

## 1. Mongoose Dynamic Field Access

Tix uses Mongoose with `strict: false` to allow arbitrary fields based on the JSON workflow configuration. However, fields not explicitly defined in the `schema` (like `date`, `termin`, or `dateFrom`) are **not** automatically exposed as direct properties on the Mongoose document instance.

**The Pitfall**: 
Accessing `ticket.termin` within a bot script will likely return `undefined`, even if the field was just updated via `ticket.set('termin', ...)`. If a bot relies on truthy checks for branching, it may silently skip execution or operate on stale data, leading to the "one update behind" synchronization bug.

**The Rule**:
Always use `ticket.get('fieldName')` or `ticket.toObject().fieldName` to retrieve properties that are not explicitly defined in the Mongoose schema.

## 2. VM Sandbox Module Injection

The backend executes custom JavaScript for bot logic and workflow actions using the Node.js `vm` module. By default, these sandboxes are empty and do not have access to standard Node.js globals or modules.

For scripts to work, specific modules must be explicitly passed into the `sandbox`:
- `path`, `fs`: File system access for settings.
- `otpauth`: Generating TOTP tokens.
- `process`: Accessing environment variables.
- `console`: Logging.

## 3. Bot Runtime Architecture

Bots are triggered by `runBotsForTicket(ticket)` immediately after `ticket.save()` in the API routes.

### Execution Modes
- **Synchronous (`onChange: 'insync'`)**: 
  - Executed sequentially in the request-response cycle. 
  - Blocks the final API response until finished.
  - If the bot modifies the ticket (detected via `ticket.isModified()`), a second `await ticket.save()` is triggered automatically.
- **Asynchronous (`onChange: 'async'`)**: 
  - Executed in the background via non-blocking closure.
  - **Pattern**: Must fetch a fresh ticket instance (`Ticket.findById`) to avoid version conflicts and ensure they work with the persisted state.

### Shared Sandbox Race Condition
Bot script files are evaluated once, and their `sandbox` context is **reused** for subsequent script calls to improve performance.
**Vulnerability**: If a bot script uses `await`, the shared `sandbox.ticket` reference can be overwritten by a concurrent execution for a different ticket.
**Remedy**: Make bot scripts strictly synchronous within the VM, or ensure localized cloning per execution if async logic is required.

## 4. Workflow Design & Consistency

### Group Consistency Checks
- **The "Read" Rule**: Any user who can create a ticket (`@creator`) should also be able to read it. Always include `@creator` in the `read` permission group list.
- **Function over Visibility**: Never grant `edit`, `comment`, or `delete` permissions to a group without also granting them `read` permissions.

### Automated Approval Patterns (`automatisch_genehmigen`)
If a workflow includes a formal approval step (e.g., `genehmigen`) and the ticket's `creator` already possesses the approval group, the system should not force redundant manual approval.

**Implementation**:
Add an `insync` bot that triggers in the `offen.neu` state. The script verifies if the `ticket.creator` possesses the necessary groups to "approve". If they do, it moves the state forward automatically.
