import { computed } from 'vue';

// Closed tickets (geschlossen.*) are final: they can be read but not commented.
export const isClosedState = (state) => typeof state === 'string' && state.startsWith('geschlossen.');

// Reopen actions don't change the ticket; they open the creation form prefilled with a copy.
export const getReopenRoute = (t) => ({ path: '/tickets/new', query: { type: t.type, reopen: t.id } });

// Administration may do everything (access rules, workflow actions, undo). Mirrors backend/src/workflow.js.
export const isAdmin = (user) => (user?.groups || []).includes('Administration');

// Checks whether a user matches an action's groups (incl. dynamic roles @creator / @assignee).
export const matchesActionGroups = (groups, t, user) => {
    if (isAdmin(user)) return true;
    const userGroups = user.groups || [];
    return (groups || []).some(g => {
        if (g === '@creator') return t.creator === user.username;
        if (g === '@assignee') return t.assignee === user.username;
        return userGroups.includes(g);
    });
};

// Generic access check against a workflow's `access` rule `name` (create, read, edit, delete, comment, undo).
// Missing workflows or rules deny access. Mirrors backend/src/workflow.js.
export const hasAccess = (conf, name, user) => {
    if (isAdmin(user)) return true;
    const userGroups = user?.groups || [];
    const rule = conf?.access?.find(r => r.name === name);
    return !!rule && (rule.groups || []).some(g => userGroups.includes(g));
};

export function useTicketAccess(ticket, config, user) {
    if (!user) {
        user = JSON.parse(localStorage.getItem('user') || '{}');
    }

    const ticketConf = () => (ticket.value && config.value) ? config.value[ticket.value.type] : null;

    const canEdit = computed(() => !!ticket.value && hasAccess(ticketConf(), 'edit', user));

    const canDelete = computed(() => !!ticket.value && hasAccess(ticketConf(), 'delete', user));

    // Controls writing comments only. Reading comments follows ticket read access.
    const canComment = computed(() => {
        if (!ticket.value || !config.value) return false;
        if (isClosedState(ticket.value.state)) return false;
        if (ticket.value.creator === user.username) return true;
        if (ticket.value.assignee === user.username) return true;
        return hasAccess(ticketConf(), 'comment', user);
    });

    const allowedSubticketTypes = computed(() => {
        if (!ticket.value || !config.value) return [];
        const conf = config.value[ticket.value.type];
        if (!conf || !conf.workflow) return [];
        
        const matchingBlocks = conf.workflow.filter(w => w.states.includes(ticket.value.state));
        
        let allowedTypes = new Set();
        
        matchingBlocks.forEach(block => {
            const subActions = (block.actions || []).filter(a => a.subTickets);
            subActions.forEach(action => {
                // Actions without groups allow everyone to create the subticket
                const groups = action.groups || [];
                if (groups.length === 0 || matchesActionGroups(groups, ticket.value, user)) {
                    action.subTickets.forEach(t => allowedTypes.add(t));
                }
            });
        });
        
        return Array.from(allowedTypes);
    });

    const getStatusColor = (t) => {
        if (!t || !config.value) return 'neutral';
        const conf = config.value[t.type];
        if (!conf || !conf.states) return 'neutral';
        const stateDef = conf.states.find(s => s.name === t.state);
        const colorMap = {
            'blue': 'brand',
            'green': 'success',
            'yellow': 'warning',
            'red': 'danger',
            'gray': 'neutral'
        };
        return stateDef ? (colorMap[stateDef.color] || 'neutral') : 'neutral';
    };

    const getStatusLabel = (t) => {
        if (!t || !config.value) return t?.state || '';
        const conf = config.value[t.type];
        if (!conf || !conf.states) return t.state;
        const stateDef = conf.states.find(s => s.name === t.state);
        return stateDef ? stateDef.label : t.state;
    };

    const getActions = (t) => {
        if (!t || !config.value) return [];
        const conf = config.value[t.type];
        if (!conf || !conf.workflow) return [];
        
        const matchingBlocks = conf.workflow.filter(s => s.states.includes(t.state));
        if (matchingBlocks.length === 0) return [];
        
        const allActions = matchingBlocks.flatMap(block => block.actions);

        const authorizedActions = allActions.filter(action => {
            if (action.subTickets) return false;
            return matchesActionGroups(action.groups, t, user);
        });

        return authorizedActions;
    };

    return {
        canEdit,
        canDelete,
        canComment,
        allowedSubticketTypes,
        getStatusColor,
        getStatusLabel,
        getActions
    };
}
