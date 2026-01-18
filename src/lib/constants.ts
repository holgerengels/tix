export const ROLES = {
    ADMIN: "ADMIN",
    TEACHER: "TEACHER",
    DEPT_HEAD: "DEPT_HEAD",
} as const;

export type Role = keyof typeof ROLES;

export const TICKET_STATUSES = {
    OPEN: "OPEN",
    APPROVED: "APPROVED",
    FORWARDED_TO_ADMIN: "FORWARDED_TO_ADMIN",
    CLOSED: "CLOSED",
    REJECTED: "REJECTED",
} as const;

export type TicketStatus = keyof typeof TICKET_STATUSES;
