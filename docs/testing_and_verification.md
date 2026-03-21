# Testing and Verification Strategies

Testing the Tix system requires a combination of unit tests for expression logic, component tests for the UI, and integration tests for complete end-to-end workflows.

## 1. Integration Testing (Jest and Supertest)

Backend integration tests (e.g., `raumreservierung.test.js`) simulate the lifecycle of a ticket across multiple actors (user, approver, bot).

### Stateful Mocking of External Services
For integrations that sync state (like CalDAV), using a stateful mock allows verifying that resources are correctly moved or cleaned up across different "calendars" or categories.

```javascript
// Stateful mock for CalDAV
const mockEvents = {
    'Raum 101': []
};
jest.mock('../../src/caldav', () => ({
    _mockEvents: mockEvents,
    addEvent: jest.fn().mockImplementation(async (calendarName, ticketId, targetDate, startHHMM, endHHMM) => {
        if (!mockEvents[calendarName]) mockEvents[calendarName] = [];
        mockEvents[calendarName].push({ id: ticketId, targetDate, startHHMM, endHHMM });
        return true;
    }),
    deleteEventByTicketId: jest.fn().mockImplementation(async (ticketId) => {
        // Iterate all calendars to delete the event by UID
        Object.keys(mockEvents).forEach(cal => {
            mockEvents[cal] = mockEvents[cal].filter(e => e.id !== ticketId);
        });
        return true;
    })
}));
```

### Simulating Lifecycle Actions
1. **Creation**: Use `POST /api/tickets` to initialize a ticket.
2. **Action Execution**: Use `POST /api/tickets/:id/action` to simulate user decisions.
3. **Verifying Bots**: Check mock arrays (`mockEvents['Room']`) after a trigger to verify state moved successfully without retaining ghost data.

## 2. Bot Idempotency and State Parity

Bots should be designed to be idempotent and state-aware:
- **Specific Initial State Check**: Avoid generic truthy checks. Explicitly check for the expected state (e.g., `if (ticket.state !== 'offen.neu') return;`).
- **UID Linkage**: Always use persistent system IDs (like `RR-1`) for external integration linkage.

### State Lag and Synchronization Issues
If bots appear to "lag" behind ticket updates (processing previous values):
1. **Accessor Reliability**: Ensure all Bot files use `ticket.get('fieldName')`, as dynamic schema fields aren't immediate properties on `_doc`.
2. **Sandbox Isolation**: Check for async logic without sandbox isolation leading to variables leaking between events.
