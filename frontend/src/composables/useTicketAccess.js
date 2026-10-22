import { computed } from 'vue';

// Closed tickets (geschlossen.*) are final: they can be read but not commented.
export const isClosedState = (state) => typeof state === 'string' && state.startsWith('geschlossen.');

// Reopen actions don't change the ticket; they open the creation form prefilled with a copy.
export const getReopenRoute = (t) => ({ path: '/tickets/new', query: { type: t.type, reopen: t.id } });

export function useTicketAccess(ticket, config, user) {
    if (!user) {
        user = JSON.parse(localStorage.getItem('user') || '{}');
    }

    const canEdit = computed(() => {
        if (!ticket.value || !config.value) return false;
        const conf = config.value[ticket.value.type];
        if (!conf) return false;

        const uGroups = user.groups || [];
        if (uGroups.includes('Administration')) return true;
        
        const access = conf.access;
        if (!access) return false;

        const rule = access.find(r => r.name === 'edit');
        if (!rule) return false;

        return rule.groups.some(g => uGroups.includes(g));
    });

    const canDelete = computed(() => {
        if (!ticket.value || !config.value) return false;
        const conf = config.value[ticket.value.type];
        if (!conf) return false;

        const uGroups = user.groups || [];
        if (uGroups.includes('Administration')) return true;
        
        const access = conf.access;
        if (!access) return false;
        
        const rule = access.find(r => r.name === 'delete');
        if (!rule) return false;
        
        return rule.groups.some(g => uGroups.includes(g));
    });

    const isClosed = computed(() => isClosedState(ticket.value?.state));

    // Controls writing comments only. Reading comments follows ticket read access.
    const canComment = computed(() => {
        if (!ticket.value || !config.value) return false;
        if (isClosed.value) return false;
        const conf = config.value[ticket.value.type];
        if (!conf) return false;
        
        if (ticket.value.creator === user.username) return true;
        if (ticket.value.assignee === user.username) return true;

        const access = conf.access;
        if (!access) return false;
        
        const rule = access.find(r => r.name === 'comment');
        if (!rule) return false;
        
        return rule.groups.some(g => (user.groups || []).includes(g));
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
                const groups = action.groups || [];
                const isCreator = ticket.value.creator === user.username;
                const isAssignee = ticket.value.assignee === user.username;
                const userGroups = user.groups || [];
                
                const allowed = groups.length === 0 || groups.some(g => {
                    if (g === '@creator' && isCreator) return true;
                    if (g === '@assignee' && isAssignee) return true;
                    if (userGroups.includes(g)) return true;
                    return false;
                });
                
                if (allowed) {
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

            const allowedByCreator = action.groups.includes('@creator') && t.creator === user.username;
            const allowedByAssignee = action.groups.includes('@assignee') && t.assignee === user.username;
            const allowedByGroup = action.groups.some(g => (user.groups || []).includes(g));
            return allowedByCreator || allowedByAssignee || allowedByGroup;
        });

        return authorizedActions;
    };

    return {
        canEdit,
        canDelete,
        canComment,
        isClosed,
        allowedSubticketTypes,
        getStatusColor,
        getStatusLabel,
        getActions
    };
}
