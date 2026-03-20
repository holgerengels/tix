<template>
  <div class="list-view" :class="{ 'is-mobile': ui.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>{{ pageTitle }}</h2>
    </div>

    <div class="ticket-list-container">
        <TicketFilter
            v-model:type="filterType"
            v-model:status="filterStatus"
            v-model:creator="filterCreator"
            v-model:dateRange="filterDateRange"
            v-model:dateFrom="filterDateFrom"
            v-model:dateTo="filterDateTo"
            v-model:badges="filterBadges"
            @apply="applyFilters"
            @apply-debounced="applyFiltersDebounced"
            @reset="resetFilters"
        >
            <template #actions>
                <wa-button appearance="plain" @click="saveCurrentFilter">Speichern</wa-button>
            </template>
            <template #footer>
                <div class="saved-filters" v-if="savedFilters.length > 0">
                    <span class="saved-filters-label">Gespeicherte Filter:</span>
                    <wa-tag 
                        v-for="(filter, index) in savedFilters" 
                        :key="index" 
                        with-remove 
                        @wa-remove="deleteSavedFilter(index)"
                        @click="applySavedFilter(filter)"
                        class="saved-filter-tag"
                        variant="brand"
                    >
                        {{ filter.name }}
                    </wa-tag>
                </div>
            </template>
        </TicketFilter>

        <wa-spinner v-if="loading"></wa-spinner>
        
        <div v-else-if="tickets.length === 0" class="empty-state">Keine Tickets gefunden.</div>

        <div v-else class="table-container">
            <table class="ticket-table">
            <thead>
                <tr>
                <th>ID</th>
                <th class="sortable" @click="toggleSort('type')">Typ <span class="sort-icon">{{ getSortIcon('type') }}</span></th>
                <th class="sortable" @click="toggleSort('title')">Titel <span class="sort-icon">{{ getSortIcon('title') }}</span></th>
                <th class="sortable" @click="toggleSort('state')">Status <span class="sort-icon">{{ getSortIcon('state') }}</span></th>
                <th class="sortable" @click="toggleSort('creator')">Ersteller <span class="sort-icon">{{ getSortIcon('creator') }}</span></th>
                <th class="sortable" @click="toggleSort('data')">Daten <span class="sort-icon">{{ getSortIcon('data') }}</span></th>
                <th>Aktionen</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="ticket in sortedTickets" :key="ticket._id">
                <td data-label="ID">
                    <router-link :to="'/tickets/' + ticket.id + '/view'" @click.stop class="ticket-link">
                        {{ ticket.id }}
                    </router-link>
                </td>
                <td data-label="Typ">{{ ticket.type }}</td>
                <td data-label="Titel" class="title-cell"><span><strong>{{ ticket.title }}</strong>
                        <span 
                            v-for="badge in ticket.badges" 
                            :key="badge" 
                            class="badge-pill"
                            :class="getBadgeColorClass(badge)"
                        >
                            {{ badge }}
                        </span>
                </span></td>
                <td data-label="Status"><wa-tag :variant="getStatusColor(ticket)" size="small">{{ getStatusLabel(ticket) }}</wa-tag></td>
                <td data-label="Ersteller">{{ usersStore.getDisplayName(ticket.creator) }}</td>
                <td data-label="Daten">
                    <div class="dynamic-data">
                        <div v-if="hasTemplate(ticket)" class="template-data">
                            {{ getFormattedData(ticket) }}
                        </div>
                        <span v-else v-for="(val, key) in getDynamicFields(ticket)" :key="key" class="data-item">
                            <strong>{{ key }}:</strong> {{ val }}
                        </span>
                    </div>
                </td>
                <td class="actions-cell">
                    <template v-for="action in getActions(ticket)" :key="action.name">
                        <template v-if="action.inline === 'comment'">
                            <wa-button 
                                :id="'trigger-' + ticket._id + '-' + action.name"
                                size="small" 
                                appearance="plain" class="action"
                            >
                                {{ action.name }}
                            </wa-button>
                            
                            <wa-popover 
                                :id="'popover-' + ticket._id + '-' + action.name"
                                :for="'trigger-' + ticket._id + '-' + action.name"
                                placement="left" 
                                distance="5" 
                                skidding="0"
                                @wa-show="e => { if (e.target.tagName === 'WA-POPOVER') popoverStates[ticket._id + '-' + action.name] = true }"
                                @wa-hide="e => { if (e.target.tagName === 'WA-POPOVER') popoverStates[ticket._id + '-' + action.name] = false }"
                            >
                                    <wa-textarea 
                                        :value="popoverComments[ticket._id + '-' + action.name] || ''"
                                        @input="e => popoverComments[ticket._id + '-' + action.name] = e.target.value"
                                        placeholder="Kommentar..."
                                        resize="auto"
                                        rows="2"
                                        autofocus
                                    ></wa-textarea>
                                    <div class="popover-actions">
                                        <wa-button appearance="plain" size="small" @click="(e) => e.target.closest('wa-popover').open = false">Abbrechen</wa-button>
                                        <wa-button 
                                            size="small" 
                                            variant="primary" 
                                            :loading="executingActionId === (ticket._id + '-' + action.name)"
                                            @click="confirmActionComment(ticket, action, popoverComments[ticket._id + '-' + action.name])"
                                        >
                                            {{ action.name }}
                                        </wa-button>
                                    </div>
                            </wa-popover>
                        </template>

                        <template v-else-if="action.inline === 'assign'">
                            <wa-button 
                                :id="'trigger-' + ticket._id + '-' + action.name"
                                size="small" 
                                appearance="plain" class="action"
                            >
                                {{ action.name }}
                            </wa-button>
                            
                            <wa-popover 
                                :id="'popover-' + ticket._id + '-' + action.name"
                                :for="'trigger-' + ticket._id + '-' + action.name"
                                placement="left" 
                                distance="5" 
                                skidding="0"
                                @wa-show="e => { if (e.target.tagName === 'WA-POPOVER') openAssignPopover(ticket._id + '-' + action.name, ticket.assignee) }"
                                @wa-hide="e => { if (e.target.tagName === 'WA-POPOVER') popoverStates[ticket._id + '-' + action.name] = false }"
                            >
                                    <wa-select 
                                        :value="popoverAssignees[ticket._id + '-' + action.name] || ''"
                                        @change="e => handleAssigneeSelect(ticket._id + '-' + action.name, e)"
                                        placeholder="Benutzer auswählen..."
                                        hoist
                                    >
                                        <wa-option v-for="u in getAvailableAssignees(ticket)" :key="u.username" :value="u.username">
                                            {{ u.displayName || u.username }}
                                        </wa-option>
                                    </wa-select>
                                    <div class="popover-actions">
                                        <wa-button appearance="plain" size="small" @click="(e) => e.target.closest('wa-popover').open = false">Abbrechen</wa-button>
                                        <wa-button
                                            size="small" 
                                            variant="primary" 
                                            :loading="executingActionId === (ticket._id + '-' + action.name)"
                                            :disabled="!popoverAssignees[ticket._id + '-' + action.name]"
                                            @click="confirmActionAssign(ticket, action, popoverAssignees[ticket._id + '-' + action.name])"
                                        >
                                            Zuweisen
                                        </wa-button>
                                    </div>
                            </wa-popover>
                        </template>

                        <wa-button 
                            v-else
                            size="small"
                            appearance="plain" class="action"
                            :loading="executingActionId === (ticket._id + '-' + action.name)"
                            @click="handleAction(ticket, action)"
                        >
                            {{ action.name }}
                        </wa-button>
                    </template>
                </td>
                </tr>
            </tbody>
            </table>
        </div>
    </div>
    </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { format, subDays, subMonths } from 'date-fns';
import { useUiStore } from '../stores/ui';
import { useWorkflowStore } from '../stores/workflow';
import { useUsersStore } from '../stores/users';
import TicketFilter from '../components/TicketFilter.vue';
import { toast, confirm, prompt } from '../composables/useToast';

const ui = useUiStore();
const workflow = useWorkflowStore();
const usersStore = useUsersStore();

const route = useRoute();
const router = useRouter();
const config = computed(() => workflow.config);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const tickets = ref([]);
const loading = ref(false);

const filterType = ref([]);
const filterStatus = ref('');
const filterCreator = ref('');
const filterDateRange = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');
const filterBadges = ref([]);

const savedFilters = ref([]);
const executingActionId = ref(null);

const popoverComments = ref({});
const popoverAssignees = ref({});
const popoverStates = ref({});
const executingActionComment = ref(false);
const availableUsers = ref([]);

const sortColumn = ref(null);
const sortDirection = ref(1);

const toggleSort = (col) => {
    if (sortColumn.value === col) {
        if (sortDirection.value === 1) {
            sortDirection.value = -1; // 2nd click: desc
        } else {
            sortColumn.value = null; // 3rd click: no sort
            sortDirection.value = 1;
        }
    } else {
        sortColumn.value = col;
        sortDirection.value = 1; // 1st click: asc
    }
};

const getSortIcon = (col) => {
    if (sortColumn.value !== col) return '↕';
    return sortDirection.value === 1 ? '↑' : '↓';
};

const sortedTickets = computed(() => {
    if (!sortColumn.value) return tickets.value;

    return [...tickets.value].sort((a, b) => {
        let valA = '';
        let valB = '';

        if (sortColumn.value === 'id') {
            valA = a.id || 0;
            valB = b.id || 0;
            return (valA - valB) * sortDirection.value;
        } else if (sortColumn.value === 'type') {
            valA = a.type || '';
            valB = b.type || '';
        } else if (sortColumn.value === 'title') {
            valA = a.title || '';
            valB = b.title || '';
        } else if (sortColumn.value === 'state') {
            valA = getStatusLabel(a);
            valB = getStatusLabel(b);
        } else if (sortColumn.value === 'creator') {
            valA = a.creator || '';
            valB = b.creator || '';
        } else if (sortColumn.value === 'data') {
            // Sort by the rendered text representation
            valA = hasTemplate(a) ? getFormattedData(a) : JSON.stringify(getDynamicFields(a));
            valB = hasTemplate(b) ? getFormattedData(b) : JSON.stringify(getDynamicFields(b));
        }
        
        if (typeof valA === 'string' && typeof valB === 'string') {
            return valA.localeCompare(valB) * sortDirection.value;
        }
        return 0;
    });
});




const loadSavedFilters = () => {
    const key = `vin_saved_filters_${currentFilter.value}`;
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            savedFilters.value = JSON.parse(saved);
        } else {
            savedFilters.value = [];
        }
    } catch (e) {
        console.error('Error loading saved filters:', e);
        savedFilters.value = [];
    }
};

const saveCurrentFilter = async () => {
    const name = await prompt('Bitte gib einen Namen für diesen Filter ein:');
    if (!name) return;

    const newFilter = {
        name,
        type: filterType.value,
        status: filterStatus.value,
        creator: filterCreator.value,
        dateRange: filterDateRange.value,
        dateFrom: filterDateFrom.value,
        dateTo: filterDateTo.value,
        badges: [...filterBadges.value]
    };

    savedFilters.value.push(newFilter);
    const key = `vin_saved_filters_${currentFilter.value}`;
    localStorage.setItem(key, JSON.stringify(savedFilters.value));
};

const deleteSavedFilter = async (index) => {
    if (await confirm('Soll der Filter wirklich gelöscht werden?')) {
        savedFilters.value.splice(index, 1);
        const key = `vin_saved_filters_${currentFilter.value}`;
        localStorage.setItem(key, JSON.stringify(savedFilters.value));
    }
};

const applySavedFilter = (filter) => {
    filterType.value = filter.type || [];
    filterStatus.value = filter.status || '';
    filterCreator.value = filter.creator || '';
    filterDateRange.value = filter.dateRange || '';
    filterDateFrom.value = filter.dateFrom || '';
    filterDateTo.value = filter.dateTo || '';
    filterBadges.value = filter.badges || [];
    applyFilters();
};

let lastRequestId = 0;
let debounceTimer = null;

const currentFilter = computed(() => route.query.filter || 'my');

const pageTitle = computed(() => {
    switch(currentFilter.value) {
        case 'my': return 'Meine Tickets';
        case 'assigned': return 'Mir zugewiesen';
        case 'all': return 'Alle Tickets';
        default: return 'Tickets';
    }
});



const fetchTickets = async () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    loading.value = true;
    
    debounceTimer = setTimeout(async () => {
        const requestId = ++lastRequestId;
        
        try {
            const params = {
                filter: currentFilter.value,
                type: filterType.value,
                status: filterStatus.value,
                creator: filterCreator.value,
                dateFrom: filterDateFrom.value,
                dateTo: filterDateTo.value,
                badge: filterBadges.value
            };

            const res = await axios.get('/api/tickets', {
                params: params,
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            if (requestId === lastRequestId) {
                tickets.value = res.data;
                loading.value = false;
            }
        } catch (err) {
            console.error(err);
             if (requestId === lastRequestId) {
                loading.value = false;
            }
        }
    }, 300);
};

const applyFilters = () => {
    fetchTickets();
};

const applyFiltersDebounced = () => {
    fetchTickets();
};



const resetFilters = () => {
    filterType.value = [];
    filterStatus.value = '';
    filterCreator.value = '';
    filterDateRange.value = '';
    filterDateFrom.value = '';
    filterDateTo.value = '';
    filterBadges.value = [];
    applyFilters();
};

const getBadgeColorClass = (badge) => {
    switch (badge) {
        case 'dringend':
        case 'wichtig':
        case 'eskaliert':
            return 'badge-red';
        case 'langfristig':
        case 'unwichtig':
            return 'badge-blue';
        case 'obsolet':
        case 'wartet':
            return 'badge-green';
        default:
            return 'badge-gray';
    }
};

const getBadgeVariant = (badge) => {
    switch (badge) {
        case 'dringend':
        case 'wichtig':
        case 'eskaliert':
            return 'danger';
        case 'langfristig':
        case 'unwichtig':
            return 'brand';
        case 'obsolet':
        case 'wartet':
            return 'success';
        default:
            return 'neutral';
    }
};

const getStatusColor = (ticket) => {
    const stateDef = config.value[ticket.type]?.states?.find(s => s.name === ticket.state);
    const colorMap = {
        'blue': 'brand',
        'green': 'success',
        'yellow': 'warning',
        'red': 'danger',
        'gray': 'neutral'
    };
    return stateDef ? (colorMap[stateDef.color] || 'neutral') : 'neutral';
};

const getStatusLabel = (ticket) => {
    if (!config.value || !config.value[ticket.type] || !config.value[ticket.type].states) {
        return ticket.state;
    }
    const stateDef = config.value[ticket.type].states.find(s => s.name === ticket.state);
    return stateDef ? stateDef.label : ticket.state;
};

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

const getDynamicFields = (ticket) => {
    const { _id, __v, type, state, title, description, creator, created, updated, log, ...rest } = ticket;
    return rest;
};

const hasTemplate = (ticket) => {
    return config.value && config.value[ticket.type] && config.value[ticket.type].template;
};

const getFormattedData = (ticket) => {
    if (!hasTemplate(ticket)) return '';
    let template = config.value[ticket.type].template;
    const fields = getDynamicFields(ticket);
    const fieldDefs = config.value[ticket.type].fields || [];

    // Helper for safe evaluation
    const evaluateExpression = (expr, context, ticketData) => {
        try {
            const keys = Object.keys(context);
            const values = Object.values(context);
            // Add helper functions
            keys.push('format');
            values.push(format);
            
            // Add ticket object
            keys.push('ticket');
            values.push(ticketData);
            
            // Check for valid identifiers in context keys to avoid syntax errors
            const validKeys = keys.filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
            const validValues = validKeys.map(k => {
                const idx = keys.indexOf(k);
                return values[idx];
            });

            const func = new Function(...validKeys, `return ${expr}`);
            return func(...validValues);
        } catch (e) {
            console.error(`Error evaluating expression "${expr}":`, e);
            return `{${expr}}`; // Return original on error equivalent
        }
    };

    // Replace {{ expression }}
    template = template.replace(/\{\{(.*?)\}\}/g, (match, expr) => {
        // First check if it's a simple key that needs Date formatting
        const key = expr.trim();
        const val = fields[key];
        const fieldDef = fieldDefs.find(f => f.name === key);
        
        if (fieldDef && fieldDef.type === 'Date' && val) {
             try {
                return format(new Date(val), 'dd.MM.yyyy');
            } catch (e) {
                return val;
            }
        }
        
        // If not a simple date field, try evaluating as expression
        const result = evaluateExpression(key, fields, ticket);
        if (result === undefined || result === null) return '';
        if (typeof result === 'object' && result.min !== undefined && result.max !== undefined) {
             // Implicit formatting for range objects if user just uses {{lessons}}
             if (result.min === result.max) return result.min;
             return `${result.min}..${result.max}`;
        }
        return result;
    });

    return template;
};

const getActions = (ticket) => {
    if (!config.value || !config.value[ticket.type]) return [];
    
    const workflow = config.value[ticket.type].workflow;
    const matchingBlocks = workflow.filter(s => s.states.includes(ticket.state));
    
    if (matchingBlocks.length === 0) return [];
    
    const allActions = matchingBlocks.flatMap(block => block.actions);

    const authorizedActions = allActions.filter(action => {
        const allowedByCreator = action.groups.includes('@creator') && ticket.creator === user.username;
        const allowedByAssignee = action.groups.includes('@assignee') && ticket.assignee === user.username;
        const allowedByGroup = action.groups.some(g => (user.groups || []).includes(g));
        return allowedByCreator || allowedByAssignee || allowedByGroup;
    });

    if (currentFilter.value === 'assigned') {
        const actions = authorizedActions.filter(a => !a.optional);
        return actions.map(processAction);
    } else if (currentFilter.value === 'my') {
        const actions = authorizedActions.filter(a => a.optional === true);
        return actions.map(processAction);
    }
    
    const wf = config.value[ticket.type];
    const actions = [...authorizedActions];
    
    return actions.map(processAction);
};

const processAction = (action) => {
    // Add unique ID for popover checking
    return { ...action, _id: action.name };
};

const executeAction = async (ticket, action) => {
    // ... existing logic ...
    const actionId = ticket._id + '-' + action.name;
    
    // Allow re-entry if we are already "executing" this specific action (e.g. from confirmActionComment)
    if (executingActionId.value && executingActionId.value !== actionId) return; 
    
    executingActionId.value = actionId;
    
    try {
        const { _id, __v, type, state, creator, created, updated, log, badges, ...rest } = ticket;
        const payload = {
            actionName: action.name,
            formData: { 
                title: ticket.title,
                description: ticket.description,
                assignee: ticket.assignee,
                ...rest 
            }
        };

        await axios.post(`/api/tickets/${ticket._id}/action`, payload, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        // Refresh list
        fetchTickets();
    } catch (err) {
        console.error(err);
        toast.error('Fehler: ' + (err.response?.data?.message || err.message));
    } finally {
        executingActionId.value = null;
    }
};

const handleAction = async (ticket, action) => {
    if (action.form === 'read') {
        router.push(`/tickets/${ticket.id}/view`);
    } else if (action.form === 'edit') {
        router.push(`/tickets/${ticket.id}/edit`);
    } else if (action.form) {
        router.push(`/tickets/${ticket.id}/action/${action.name}`);
    } else {
        // Direct execution
        executeAction(ticket, action);
    }
};

const openAssignPopover = async (actionId, currentAssignee) => {
    popoverStates.value[actionId] = true;
    if (!popoverAssignees.value[actionId]) {
        popoverAssignees.value[actionId] = currentAssignee || '';
    }
    if (availableUsers.value.length === 0) {
        try {
            availableUsers.value = await usersStore.fetchUsersByGroup([]);
        } catch (err) {
            console.error('Error fetching users:', err);
        }
    }
};

const handleAssigneeSelect = (actionId, e) => {
    popoverAssignees.value[actionId] = e.target.value;
};

const getAvailableAssignees = (ticket) => {
    let users = availableUsers.value;
    if (!config.value || !config.value[ticket.type] || !config.value[ticket.type].fields) {
        return users;
    }
    const assigneeField = config.value[ticket.type].fields.find(f => f.name === 'assignee');
    if (assigneeField && assigneeField.groups && assigneeField.groups.length > 0) {
        users = users.filter(u => {
            if (!u.groups) return false;
            return u.groups.some(g => assigneeField.groups.includes(g));
        });
    }
    return users;
};


const confirmActionAssign = async (ticket, action, assignee) => {
    const actionId = ticket._id + '-' + action.name;
    executingActionId.value = actionId;
    
    try {
        if (assignee) {
            ticket.assignee = assignee; // optimistic local update for action payload
            await executeAction(ticket, action);
        }
        
        const popoverEl = document.getElementById('popover-' + actionId);
        if (popoverEl) popoverEl.open = false;

        if (popoverAssignees.value[actionId]) {
            delete popoverAssignees.value[actionId];
        }
    } catch (err) {
        console.error(err);
        executingActionId.value = null;
    }
};

const confirmActionComment = async (ticket, action, comment) => {
    const actionId = ticket._id + '-' + action.name;
    
    // Set loading state on the button via executingActionId
    executingActionId.value = actionId;
    
    try {
        if (comment && comment.trim()) {
            await axios.post(`/api/tickets/${ticket._id}/comments`, {
                text: comment, 
                silent: true
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
        }
        
        await executeAction(ticket, action);
        
        const popoverEl = document.getElementById('popover-' + actionId);
        if (popoverEl) popoverEl.open = false;

        // Clear comment
        if (popoverComments.value[actionId]) {
            delete popoverComments.value[actionId];
        }

    } catch (err) {
        console.error(err);
        toast.error('Fehler: ' + (err.response?.data?.message || err.message));
        executingActionId.value = null; // Reset loading if error
    } 
    // If success, fetchTickets in executeAction will refresh list, 
    // and ideally the popover is gone because the ticket row is re-rendered? 
    // Or we need to manually close it? 
    // Re-rendering list should reset popover state if it's not persistent.
};

watch(currentFilter, () => {
    loading.value = true; // Show loading immediately
    loadSavedFilters();
    fetchTickets();
});

onMounted(async () => {
    await workflow.fetchConfig();
    loadSavedFilters();
    fetchTickets();
});
</script>

<style scoped>
.list-view {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1rem;
    flex-shrink: 0;
}
.header h2 {
    margin: 0;
}
.ticket-list-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100% - 82px);
    margin: 0 1rem 1rem 1rem;
}

.table-container {
    width: 100%;
    height: 100%;
    overflow: auto;
}

.ticket-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: white;
    box-shadow: var(--wa-shadow-x-small);
    border-radius: var(--wa-border-radius-large);
    border: 1px solid var(--wa-color-neutral-90);
}

.ticket-table th, .ticket-table td {
    padding: 0.5rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--wa-color-neutral-90);
    vertical-align: middle;
}

.ticket-table th {
    background-color: var(--wa-color-neutral-95);
    font-weight: 600;
    color: var(--wa-color-neutral-30);
    text-transform: uppercase;
    font-size: 0.8rem;
    position: sticky;
    top: 0;
    z-index: 10;
    user-select: none;
    white-space: nowrap;
    border-bottom: 1px solid var(--wa-color-neutral-80);
}

.ticket-table th:first-child {
    border-top-left-radius: var(--wa-border-radius-large);
}

.ticket-table th:last-child {
    border-top-right-radius: var(--wa-border-radius-large);
}
.ticket-table th.sortable {
    cursor: pointer;
}
.ticket-table th.sortable:hover {
    background-color: var(--wa-color-neutral-80);
}
.sort-icon {
    font-size: 1em;
    margin-left: 0.2rem;
}

.ticket-table tr {
    transition: background-color 0.2s;
}

.ticket-table tr:hover {
    background-color: var(--wa-color-brand-90);
}

.ticket-table tr:last-child td {
    border-bottom: none;
}

.dynamic-data {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.data-item {
    font-size: 0.9em;
    padding: 0;
    white-space: nowrap;
    line-height: 1;
    color: var(--wa-color-neutral-30);
}
.actions-cell wa-button {
    margin-right: 0;
    margin-left: -0.5rem;
}

.empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--wa-color-neutral-40);
    background: white;
    border-radius: var(--wa-border-radius-large);
    border: 1px dashed var(--wa-color-neutral-60);
}

.ticket-link {
    text-decoration: none;
    white-space: nowrap;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
}
.ticket-link:hover {
    opacity: 0.8;
    text-decoration: underline;
}
[data-label=Typ] {
    white-space: nowrap;
}

.badges-container {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-left: 8px;
    vertical-align: middle;
}

.badge-pill {
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 9999px;
    font-weight: 500;
    line-height: 1;
    border: 1px solid transparent;
    margin-left: 1ch;
}

.badge-red {
    background-color: #fee2e2;
    color: #991b1b;
    border-color: #fecaca;
}

.badge-blue {
    background-color: #dbeafe;
    color: #1e40af;
    border-color: #bfdbfe;
}

.badge-green {
    background-color: #dcfce7;
    color: #166534;
    border-color: #bbf7d0;
}

.badge-gray {
    background-color: #f3f4f6;
    color: #374151;
    border-color: #e5e7eb;
}

.saved-filters {
    padding: 0 1.5rem 1rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
}

.saved-filters-label {
    font-size: 0.85rem;
    color: var(--wa-color-neutral-40);
    margin-right: 0.5rem;
}

.saved-filter-tag {
    cursor: pointer;
    transition: all 0.2s;
}

.saved-filter-tag:hover {
    transform: translateY(-1px);
    box-shadow: var(--wa-shadow-small);
}

/* Mobile Styles using .is-mobile class */
.is-mobile .header {
    margin: 1rem;
}

.is-mobile .ticket-table {
    display: block;
    background: transparent;
    box-shadow: none;
    border: none;
}

.is-mobile .ticket-table thead {
    display: none;
}

.is-mobile .ticket-table tbody {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.is-mobile .ticket-table tr {
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid var(--wa-color-neutral-80);
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    padding: 1rem;
    gap: 0.5rem;
}

.is-mobile .ticket-table td {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: flex-start;
    justify-items: start;
    padding: 0.25rem 0;
    border: none;
    text-align: left;
}

.is-mobile .ticket-table td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--wa-color-neutral-30);
    margin-right: 1rem;
    flex-shrink: 0;
    font-size: 0.85rem;
    margin-top: 0.1rem;
}

.is-mobile .ticket-table td.actions-cell {
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--wa-color-neutral-80);
    justify-items: end;
    gap: 0.5rem;
    flex-wrap: wrap;
}

/* Actions content wrapper to align buttons */
.is-mobile .actions-cell wa-button {
    margin: 0;
}

.popover-card {
    --padding: 0;
    min-width: 300px;
}

.popover-content {
    background: white;
    border: 1px solid var(--wa-color-neutral-80);
    border-radius: var(--wa-border-radius-medium);
    padding: 1rem;
    box-shadow: var(--wa-shadow-large);
    min-width: 250px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.popover-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
    gap: 1.5rem;
}
.is-mobile .header h2 {
    font-size: 1.2rem;
}
</style>
