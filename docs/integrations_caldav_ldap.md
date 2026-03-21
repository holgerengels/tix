# Tix Integrations: CalDAV, LDAP, and WebUntis

The Tix system integrates with multiple external services to synchronize authentications and schedules.

## 1. CalDAV Room Reservation System

A lightweight CalDAV client (`caldav.js`) handles synchronization.
- **Calendar Discovery**: Uses `PROPFIND` to list SOGo or Nextcloud nested calendars.
- **Event Management**: Adds via `PUT`, deletes via `DELETE`.
    - **UID-based Linkage**: The persistent `ticket.id` (e.g., `RR-1`) is embedded in the event UID as `TIX-<id>`.
    - **Global Event Deletion**: Moving a reservation triggers `deleteEventByTicketId(ticketId)` across all calendars before inserting into the new calendar.

### Handling SOGo and Mailcow Quirks
1. **Namespace-Agnostic XML Parsing**: Handles case-insensitive key lookups (`<d:propstat>` vs `<D:propstat>`).
2. **Sequential fetching**: To prevent strict concurrent connection limits on Nginx/Mailcow, room capacities and calendars are fetched sequentially in a `for...of` loop.
3. **Floating Time**: Generates ICS in Floating Time (`DTSTART:20260312T075000`) or standardizes to `TZID=Europe/Berlin` to avoid timezone offset discrepancies between Node.js and SOGo.

## 2. LDAP Integration

The system integrates with Active Directory for authentication and role-based access control.

### Authentication Flow
1. **Bind Service**: Authenticate the system's service account to allow searching.
2. **Search User**: Find the user `sAMAccountName`.
3. **Bind User**: Verify password by binding as that user.

### Group Parsing
Groups are extracted from the `memberOf` array by parsing the `CN` part and stripping pre-configured prefixes.

### Watcher Stability in Frontend
To prevent redundant LDAP calls from Vue 3 dynamic forms, watchers on the LDAP user field use conservative triggers on a derived key string (`groups.join(',')`) instead of object reference changes.

## 3. WebUntis Integration

The WebUntis API allows lookup of room occupancy.
- **2FA and TOTP**: Uses the `otpauth` library injected into the backend Sandbox to generate time-based one-time passwords for the `j_spring_security_check` endpoint.
- **Session Management**: Parses cookies (e.g., `JSESSIONID`) returned by WebUntis and manually manages them across requests via Axios interceptors.

## 4. Proxies and Interceptors (`Axios`)

Using standard cookie jar libraries alongside `https-proxy-agent` often leads to conflicts.
**Solution**: Manual Axios interceptors injected with a tough-cookie jar and an explicit `HttpsProxyAgent`. 

```javascript
const client = axios.create({
    httpsAgent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : null,
    proxy: false, // Prevents axios from handling proxying
});
// Interceptors manually set Cookie and extract Set-Cookie
```
