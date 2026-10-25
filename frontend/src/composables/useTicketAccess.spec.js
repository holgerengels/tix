import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import {
    isClosedState,
    getReopenRoute,
    isAdmin,
    matchesActionGroups,
    hasAccess,
    useTicketAccess
} from './useTicketAccess';

const admin = { username: 'admin', groups: ['Administration'] };
const lehrer = { username: 'lehrer1', groups: ['Lehrer'] };
const lehrer2 = { username: 'lehrer2', groups: ['Lehrer'] };
const netz = { username: 'netz', groups: ['Netzwerkteam'] };
const nobody = { username: 'nobody', groups: [] };

const itConf = {
    access: [
        { name: 'create', groups: ['Lehrer'] },
        { name: 'edit', groups: ['Netzwerkteam'] },
        { name: 'delete', groups: ['Netzwerkteam'] },
        { name: 'comment', groups: ['Netzwerkteam'] },
        { name: 'empty', groups: [] }
    ],
    states: [
        { name: 'offen.neu', label: 'Neu', color: 'blue' },
        { name: 'geschlossen.erledigt', label: 'Erledigt', color: 'green' }
    ],
    workflow: [
        {
            states: ['offen.neu'],
            actions: [
                { name: 'zurückziehen', groups: ['@creator'] },
                { name: 'erledigen', groups: ['@assignee', 'Netzwerkteam'] },
                { name: 'unteraufgabe', groups: ['Netzwerkteam'], subTickets: ['hausmeister'] },
                { name: 'frage', subTickets: ['frage'] }
            ]
        }
    ]
};

const ticketOf = (overrides = {}) => ({
    type: 'it',
    id: 'IT-1',
    state: 'offen.neu',
    creator: 'lehrer1',
    ...overrides
});

describe('helpers', () => {
    it('isClosedState detects geschlossen.* states only', () => {
        expect(isClosedState('geschlossen.erledigt')).toBe(true);
        expect(isClosedState('offen.neu')).toBe(false);
        expect(isClosedState(undefined)).toBe(false);
    });

    it('getReopenRoute links to the prefilled creation form', () => {
        expect(getReopenRoute({ type: 'it', id: 'IT-7' }))
            .toEqual({ path: '/tickets/new', query: { type: 'it', reopen: 'IT-7' } });
    });

    it('isAdmin checks the Administration group', () => {
        expect(isAdmin(admin)).toBe(true);
        expect(isAdmin(lehrer)).toBe(false);
        expect(isAdmin(undefined)).toBe(false);
        expect(isAdmin({})).toBe(false);
    });
});

describe('hasAccess', () => {
    it('grants access on group match', () => {
        expect(hasAccess(itConf, 'create', lehrer)).toBe(true);
        expect(hasAccess(itConf, 'edit', netz)).toBe(true);
    });

    it('denies access without group match', () => {
        expect(hasAccess(itConf, 'edit', lehrer)).toBe(false);
        expect(hasAccess(itConf, 'create', nobody)).toBe(false);
    });

    it('denies access for missing rules, empty rules or missing config', () => {
        expect(hasAccess(itConf, 'undo', netz)).toBe(false);
        expect(hasAccess(itConf, 'empty', netz)).toBe(false);
        expect(hasAccess(null, 'create', lehrer)).toBe(false);
        expect(hasAccess({}, 'create', lehrer)).toBe(false);
        expect(hasAccess(itConf, 'create', undefined)).toBe(false);
    });

    it('always grants access to admins', () => {
        expect(hasAccess(itConf, 'edit', admin)).toBe(true);
        expect(hasAccess(itConf, 'undo', admin)).toBe(true);
        expect(hasAccess(null, 'create', admin)).toBe(true);
    });
});

describe('matchesActionGroups', () => {
    const t = ticketOf({ assignee: 'netz2' });

    it('resolves @creator', () => {
        expect(matchesActionGroups(['@creator'], t, lehrer)).toBe(true);
        expect(matchesActionGroups(['@creator'], t, lehrer2)).toBe(false);
    });

    it('resolves @assignee', () => {
        const assignee = { username: 'netz2', groups: [] };
        expect(matchesActionGroups(['@assignee'], t, assignee)).toBe(true);
        expect(matchesActionGroups(['@assignee'], t, lehrer)).toBe(false);
    });

    it('matches regular groups', () => {
        expect(matchesActionGroups(['Netzwerkteam'], t, netz)).toBe(true);
        expect(matchesActionGroups(['Netzwerkteam'], t, lehrer)).toBe(false);
    });

    it('does not match empty or missing groups (except for admins)', () => {
        expect(matchesActionGroups([], t, lehrer)).toBe(false);
        expect(matchesActionGroups(undefined, t, lehrer)).toBe(false);
        expect(matchesActionGroups(undefined, t, admin)).toBe(true);
    });

    it('always matches for admins', () => {
        expect(matchesActionGroups(['@creator'], t, admin)).toBe(true);
        expect(matchesActionGroups(['Netzwerkteam'], t, admin)).toBe(true);
    });
});

describe('useTicketAccess', () => {
    const setup = (ticket, user) =>
        useTicketAccess(ref(ticket), ref({ it: itConf }), user);

    it('canEdit / canDelete follow access rules', () => {
        expect(setup(ticketOf(), netz).canEdit.value).toBe(true);
        expect(setup(ticketOf(), netz).canDelete.value).toBe(true);
        expect(setup(ticketOf(), lehrer).canEdit.value).toBe(false);
        expect(setup(ticketOf(), admin).canDelete.value).toBe(true);
        expect(setup(null, admin).canEdit.value).toBe(false);
    });

    it('canComment allows creator, assignee, comment group and admins', () => {
        expect(setup(ticketOf(), lehrer).canComment.value).toBe(true);
        expect(setup(ticketOf({ assignee: 'lehrer2' }), lehrer2).canComment.value).toBe(true);
        expect(setup(ticketOf(), netz).canComment.value).toBe(true);
        expect(setup(ticketOf(), admin).canComment.value).toBe(true);
        expect(setup(ticketOf(), lehrer2).canComment.value).toBe(false);
    });

    it('canComment is false for closed tickets, even for admins', () => {
        const closed = ticketOf({ state: 'geschlossen.erledigt' });
        expect(setup(closed, lehrer).canComment.value).toBe(false);
        expect(setup(closed, admin).canComment.value).toBe(false);
    });

    it('getActions returns authorized non-subticket actions', () => {
        const names = (user, t = ticketOf()) => setup(t, user).getActions(t).map(a => a.name);
        expect(names(lehrer)).toEqual(['zurückziehen']);
        expect(names(netz)).toEqual(['erledigen']);
        expect(names(lehrer2)).toEqual([]);
        expect(names(admin)).toEqual(['zurückziehen', 'erledigen']);
        expect(names(netz, ticketOf({ state: 'geschlossen.erledigt' }))).toEqual([]);
    });

    it('allowedSubticketTypes respects groups; actions without groups allow everyone', () => {
        expect(setup(ticketOf(), lehrer).allowedSubticketTypes.value).toEqual(['frage']);
        expect(setup(ticketOf(), netz).allowedSubticketTypes.value.sort()).toEqual(['frage', 'hausmeister']);
        expect(setup(ticketOf(), admin).allowedSubticketTypes.value.sort()).toEqual(['frage', 'hausmeister']);
    });

    it('maps status color and label', () => {
        const { getStatusColor, getStatusLabel } = setup(ticketOf(), lehrer);
        expect(getStatusColor(ticketOf())).toBe('brand');
        expect(getStatusLabel(ticketOf())).toBe('Neu');
        expect(getStatusColor(ticketOf({ state: 'unbekannt' }))).toBe('neutral');
        expect(getStatusLabel(ticketOf({ state: 'unbekannt' }))).toBe('unbekannt');
    });
});
