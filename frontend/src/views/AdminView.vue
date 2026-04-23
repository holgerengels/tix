<template>
  <div class="list-view" :class="{ 'is-mobile': ui.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>Administration</h2>
        <div style="margin-left: auto;" v-if="selectedTickets.length > 0">
            <wa-button variant="danger" size="small" appearance="filled" @click="deleteSelected">
                <wa-icon slot="start" name="x-lg"></wa-icon> {{ selectedTickets.length }} Löschen
            </wa-button>
        </div>
    </div>

    <div class="ticket-list-container">
        <TicketListConfig 
            ref="ticketConfigRef"
            @update="handleViewUpdate"
            @fetch="handleFetchRequest"
        >
            <template #actions v-if="selectedTickets.length > 0">
                <span style="font-weight: 500; color: var(--wa-color-brand-20);">{{ selectedTickets.length }} ausgewählt</span>
            </template>
        </TicketListConfig>

        <wa-spinner v-if="loading"></wa-spinner>
        
        <div v-else-if="tickets.length === 0" class="empty-state">Keine Tickets gefunden.</div>

        <div v-else class="table-container">
            <table class="ticket-table">
            <thead>
                <tr>
                <th style="width: 40px; position: sticky; left: 0; z-index: 11;">
                    <wa-checkbox :checked.prop="allSelected" @change="toggleSelectAll"></wa-checkbox>
                </th>
                <th v-for="col in visibleColumns" :key="col.id" :class="{ sortable: col.sortable }" @click="col.sortable ? toggleSort(col.id) : null">
                    {{ col.label }} <span v-if="col.sortable" class="sort-icon">{{ getSortIcon(col.id) }}</span>
                </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="ticket in sortedTickets" :key="ticket._id" :class="{ 'selected': selectedTickets.includes(ticket._id) }" @click="toggleSelection(ticket._id)">
                <td @click.stop style="position: sticky; left: 0; z-index: 1; background: inherit;">
                    <wa-checkbox :checked.prop="selectedTickets.includes(ticket._id)" @change="toggleSelection(ticket._id)"></wa-checkbox>
                </td>
                <td v-for="col in visibleColumns" :key="col.id" :data-label="col.label" :class="{ 'title-cell': col.id === 'title', 'actions-cell': col.id === 'actions' }">
                    <template v-if="col.id === 'id'">
                        <router-link :to="'/tickets/' + ticket.id + '/view'" @click.stop class="ticket-link">
                            {{ ticket.id }}
                        </router-link>
                    </template>
                    <template v-else-if="col.id === 'type'">{{ ticket.type }}</template>
                    <template v-else-if="col.id === 'title'">
                        <span><strong>{{ ticket.title }}</strong>
                            <span v-for="badge in ticket.badges" :key="badge" class="badge-pill" :class="getBadgeColorClass(badge)">
                                {{ badge }}
                            </span>
                        </span>
                    </template>
                    <template v-else-if="col.id === 'state'">
                        <wa-tag :variant="getStatusColor(ticket)" size="small">{{ getStatusLabel(ticket) }}</wa-tag>
                    </template>
                    <template v-else-if="col.id === 'creator'">{{ usersStore.getDisplayName(ticket.creator) }}</template>
                    <template v-else-if="col.id === 'assignee'">{{ ticket.assignee ? usersStore.getDisplayName(ticket.assignee) : '-' }}</template>
                    <template v-else-if="col.id === 'created'">{{ formatDate(ticket.created) }}</template>
                    <template v-else-if="col.id === 'data'">
                        <div class="dynamic-data">
                            <div v-if="hasTemplate(ticket)" class="template-data">
                                {{ getFormattedData(ticket) }}
                            </div>
                            <span v-else v-for="(val, key) in getDynamicFields(ticket)" :key="key" class="data-item">
                                <strong>{{ key }}:</strong> {{ val }}
                            </span>
                        </div>
                    </template>
                    <template v-else-if="col.id === 'actions'">
                        <!-- No actions in admin view typically -->
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
import TicketListConfig from '../components/TicketListConfig.vue';
import { toast, confirm } from '../composables/useToast';
import { useTicketAccess } from '../composables/useTicketAccess';

const ui = useUiStore();
const workflow = useWorkflowStore();
const usersStore = useUsersStore();

const route = useRoute();
const router = useRouter();
const config = computed(() => workflow.config);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const tickets = ref([]);
const loading = ref(false);

const dummyTicket = ref(null);
const { getStatusColor, getStatusLabel } = useTicketAccess(dummyTicket, config, user);

const visibleColumns = ref([]);
const sort = ref('');
const fetchParams = ref({});
const ticketConfigRef = ref(null);

const selectedTickets = ref([]);

let lastRequestId = 0;
let debounceTimer = null;

const handleViewUpdate = (payload) => {
    visibleColumns.value = payload.visibleColumns;
    sort.value = payload.sort;
};

const handleFetchRequest = (params) => {
    fetchParams.value = params;
    fetchTickets();
};

const fetchTickets = async () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    loading.value = true;
    
    debounceTimer = setTimeout(async () => {
        const requestId = ++lastRequestId;
        
        try {
            const params = {
                filter: 'admin', // Admin view sees all tickets, skipping workflow access checks
                ...fetchParams.value
            };

            const res = await axios.get('/api/tickets', {
                params: params,
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            if (requestId === lastRequestId) {
                tickets.value = res.data;
                loading.value = false;
                // Clear selection on reload/filter change? Maybe better UX to keep if possible, but IDs might disappear.
                // For now, let's keep IDs in selection even if not visible, or filter them out.
                // Let's keep it simple: keep selection.
            }
        } catch (err) {
            console.error(err);
             if (requestId === lastRequestId) {
                loading.value = false;
            }
        }
    }, 300);
};

// Selection Logic
const toggleSelection = (id) => {
    const index = selectedTickets.value.indexOf(id);
    if (index === -1) {
        selectedTickets.value.push(id);
    } else {
        selectedTickets.value.splice(index, 1);
    }
};

const allSelected = computed(() => {
    return tickets.value.length > 0 && tickets.value.every(t => selectedTickets.value.includes(t._id));
});

const toggleSelectAll = (e) => {
    if (allSelected.value) {
        selectedTickets.value = [];
    } else {
        selectedTickets.value = tickets.value.map(t => t._id);
    }
};

const toggleSort = (col) => {
    if (ticketConfigRef.value) {
        ticketConfigRef.value.toggleSort(col);
    }
};

const getSortIcon = (col) => {
    if (sort.value === col) return '↑';
    if (sort.value === '-' + col) return '↓';
    return '↕';
};

const sortedTickets = computed(() => {
    if (!sort.value) return tickets.value;

    const isDesc = sort.value.startsWith('-');
    const sortCol = isDesc ? sort.value.substring(1) : sort.value;
    const direction = isDesc ? -1 : 1;

    return [...tickets.value].sort((a, b) => {
        let valA = '';
        let valB = '';

        if (sortCol === 'id') {
            valA = a.id || 0;
            valB = b.id || 0;
            return (valA - valB) * direction;
        } else if (sortCol === 'type') {
            valA = a.type || '';
            valB = b.type || '';
        } else if (sortCol === 'title') {
            valA = a.title || '';
            valB = b.title || '';
        } else if (sortCol === 'state') {
            valA = getStatusLabel(a);
            valB = getStatusLabel(b);
        } else if (sortCol === 'creator') {
            valA = usersStore.getDisplayName(a.creator) || '';
            valB = usersStore.getDisplayName(b.creator) || '';
        } else if (sortCol === 'assignee') {
            valA = usersStore.getDisplayName(a.assignee) || '';
            valB = usersStore.getDisplayName(b.assignee) || '';
        } else if (sortCol === 'created') {
            valA = new Date(a.created || 0).getTime();
            valB = new Date(b.created || 0).getTime();
            return (valA - valB) * direction;
        } else if (sortCol === 'data') {
            valA = hasTemplate(a) ? getFormattedData(a) : JSON.stringify(getDynamicFields(a));
            valB = hasTemplate(b) ? getFormattedData(b) : JSON.stringify(getDynamicFields(b));
        }
        
        if (typeof valA === 'string' && typeof valB === 'string') {
            return valA.localeCompare(valB) * direction;
        }
        return 0;
    });
});

const deleteSelected = async () => {
    if (!await confirm(`Sollen die ${selectedTickets.value.length} ausgewählten Tickets wirklich unwiderruflich gelöscht werden?`)) {
        return;
    }

    loading.value = true;
    try {
        // Execute deletions in parallel
        const promises = selectedTickets.value.map(id => 
            axios.delete(`/api/tickets/${id}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
        );

        await Promise.all(promises);

        // Success
        selectedTickets.value = [];
        fetchTickets();
        
    } catch (err) {
        console.error('Error deleting tickets:', err);
        toast.error('Fehler beim Löschen einiger Tickets: ' + err.message);
        // Refresh anyway to show what's left
        fetchTickets();
    } finally {
        loading.value = false;
    }
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

onMounted(async () => {
    // Basic Access Control
    if (!(user.groups || []).includes('Administration')) {
        toast.error('Kein Zugriff.');
        router.push('/');
        return;
    }

    // Load users if needed
    if (Object.keys(usersStore.users).length === 0) {
        usersStore.fetchUsers();
    }

    await workflow.fetchConfig();
    // fetchTickets will be triggered by TicketListConfig component emitting @fetch
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
    cursor: pointer;
}

.ticket-table tr:hover {
    background-color: var(--wa-color-brand-90);
}

.ticket-table tr.selected {
    background-color: var(--wa-color-brand-80);
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


.id-tag {
    white-space: nowrap;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
}
.id-tag:hover {
    opacity: 0.8;
    text-decoration: underline;
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
    border: 1px solid var(--wa-color-neutral-70);
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    padding: 1rem;
    gap: 0.5rem;
}

.is-mobile .ticket-table td {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    align-items: flex-start;
    justify-items: start;
    padding: 0.25rem 0;
    border: none;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
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
.is-mobile .header h2 {
    font-size: 1.2rem;
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
</style>
