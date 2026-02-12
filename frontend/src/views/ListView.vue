<template>
  <div class="list-view">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>{{ pageTitle }}</h2>
    </div>

    <div class="ticket-list-container">
        <details class="filter-details">
            <summary>Filter</summary>
            <div class="filters">
                <div class="filter-group">
                    <label>Typ:</label>
                    <div style="min-width: 200px;">
                        <wa-select multiple clearable v-model="filterType" @change="handleTypeChange">
                            <wa-option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</wa-option>
                        </wa-select>
                    </div>
                </div>
                <div class="filter-group">
                    <label>Status:</label>
                    <select v-model="filterStatus" @change="applyFilters">
                        <option value="">Alle</option>
                        <option v-for="status in availableStatuses" :key="status" :value="status">{{ status }}</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Ersteller:</label>
                    <input type="text" v-model="filterCreator" @input="applyFiltersDebounced" placeholder="Name..." />
                </div>
                <div class="filter-group">
                    <select v-model="filterDateRange" @change="handleDateRangeChange">
                        <option value="">Zeitraum wählen</option>
                        <option value="week">Letzte Woche</option>
                        <option value="month">Letzter Monat</option>
                        <option value="custom">Benutzerdefiniert</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Label:</label>
                    <div style="min-width: 200px;">
                        <wa-select multiple clearable v-model="filterBadges" @change="applyFilters">
                            <wa-option v-for="badge in availableBadges" :key="badge" :value="badge">
                                <wa-badge :variant="getBadgeVariant(badge)" size="small" appearance="filled-outlined" pill>{{ badge }}</wa-badge>
                            </wa-option>
                        </wa-select>
                    </div>
                </div>
                <div class="filter-group" v-if="filterDateRange === 'custom'">
                    <input type="date" v-model="filterDateFrom" @change="applyFilters" />
                    <span>-</span>
                    <input type="date" v-model="filterDateTo" @change="applyFilters" />
                </div>
                <div class="filter-group">
                    <wa-button appearance="plain" @click="resetFilters">Reset</wa-button>
                    <wa-button appearance="plain" @click="saveCurrentFilter">Speichern</wa-button>
                </div>
            </div>
            
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
        </details>

        <wa-spinner v-if="loading"></wa-spinner>
        
        <div v-else-if="tickets.length === 0" class="empty-state">Keine Tickets gefunden.</div>

        <div v-else class="table-container">
            <table class="ticket-table">
            <thead>
                <tr>
                <th>ID</th>
                <th>Typ</th>
                <th>Titel</th>
                <th>Status</th>
                <th>Ersteller</th>
                <th>Erstellt</th>
                <th>Daten</th>
                <th>Aktionen</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="ticket in tickets" :key="ticket._id">
                <td data-label="ID">
                    <router-link :to="'/tickets/' + ticket.id + '/view'" style="text-decoration: none;" @click.stop>
                        <span class="id-tag">{{ ticket.id }}</span>
                    </router-link>
                </td>
                <td data-label="Typ">{{ ticket.type }}</td>
                <td data-label="Titel" class="title-cell"><strong>{{ ticket.title }}</strong>
                        <span 
                            v-for="badge in ticket.badges" 
                            :key="badge" 
                            class="badge-pill"
                            :class="getBadgeColorClass(badge)"
                        >
                            {{ badge }}
                        </span>
                </td>
                <td data-label="Status"><wa-tag :variant="getStatusColor(ticket)" size="small">{{ getStatusLabel(ticket) }}</wa-tag></td>
                <td data-label="Ersteller">{{ ticket.creator }}</td>
                <td data-label="Erstellt">{{ formatDate(ticket.created) }}</td>
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
                    <wa-button 
                        v-for="action in getActions(ticket)" 
                        :key="action.name"
                        size="small"
                        appearance="plain"
                        :loading="executingActionId === (ticket._id + '-' + action.name)"
                        @click="handleAction(ticket, action)"
                    >
                        {{ action.name }}
                    </wa-button>
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
import { ui } from '../state/ui';
import { workflow } from '../state/workflow';

const route = useRoute();
const router = useRouter();
const config = workflow.config;
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

const saveCurrentFilter = () => {
    const name = prompt('Bitte geben Sie einen Namen für diesen Filter ein:');
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

const deleteSavedFilter = (index) => {
    if (confirm('Soll der Filter wirklich gelöscht werden?')) {
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

const availableTypes = computed(() => {
    return config.value ? Object.keys(config.value) : [];
});

const availableStatuses = computed(() => {
    if (!filterType.value || filterType.value.length === 0) {
        return ['offen.*', 'geschlossen.*'];
    }
    
    const types = Array.isArray(filterType.value) ? filterType.value : [filterType.value];
    const states = new Set();
    
    types.forEach(t => {
        if (config.value && config.value[t] && config.value[t].states) {
            config.value[t].states.forEach(s => states.add(s.name));
        }
    });
    
    if (states.size === 0) return ['offen.*', 'geschlossen.*'];
    return Array.from(states);
});

const availableBadges = [
  'dringend', 'wichtig', 'eskaliert', 
  'langfristig', 'unwichtig', 
  'obsolet', 'wartet'
];



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

const handleDateRangeChange = () => {
    const now = new Date();
    if (filterDateRange.value === 'week') {
        filterDateFrom.value = format(subDays(now, 7), 'yyyy-MM-dd');
        filterDateTo.value = format(now, 'yyyy-MM-dd');
    } else if (filterDateRange.value === 'month') {
        filterDateFrom.value = format(subMonths(now, 1), 'yyyy-MM-dd');
        filterDateTo.value = format(now, 'yyyy-MM-dd');
    } else if (filterDateRange.value === '') {
        filterDateFrom.value = '';
        filterDateTo.value = '';
    }
    applyFilters();
};

const handleTypeChange = () => {
    filterStatus.value = ''; 
    applyFilters();
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
    
    for (const [key, val] of Object.entries(fields)) {
        let displayVal = val;
        
        const fieldDef = fieldDefs.find(f => f.name === key);

        if (fieldDef && fieldDef.type === 'Date' && val) {
            try {
                displayVal = format(new Date(val), 'dd.MM.yyyy');
            } catch (e) {
                console.error(`[debug] Date format error for ${key}:`, e);
            }
        }

        template = template.replace(new RegExp(`{{${key}}}`, 'g'), displayVal);
        template = template.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), displayVal);
    }
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
        return authorizedActions.filter(a => !a.optional);
    } else if (currentFilter.value === 'my') {
        return authorizedActions.filter(a => a.optional === true);
    }
    
    const wf = config.value[ticket.type];
    const editAccess = wf.access ? wf.access.find(a => a.name === 'edit') : null;
    if (editAccess && editAccess.groups.some(g => (user.groups || []).includes(g))) {
        authorizedActions.push({
            name: 'editieren',
            form: 'edit',
            groups: editAccess.groups 
        });
    }

    return authorizedActions;
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
        if (executingActionId.value) return; 
        
        const actionId = ticket._id + '-' + action.name;
        executingActionId.value = actionId;
        
        try {
            const { _id, __v, type, state, creator, created, updated, log, ...rest } = ticket;
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
            alert('Fehler: ' + (err.response?.data?.message || err.message));
        } finally {
            executingActionId.value = null;
        }
    }
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
    flex-shrink: 0;
    margin-bottom: 1rem;
}
.header h2 {
    margin: 0;
}
.ticket-list-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100% - 70px);
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
    box-shadow: var(--wa-shadow-small);
    border-radius: var(--wa-border-radius-large);
    border: 1px solid var(--wa-color-neutral-200);
}

.ticket-table th, .ticket-table td {
    padding: 0.3rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--wa-color-neutral-100);
    vertical-align: middle;
}

.ticket-table th {
    background-color: var(--wa-color-neutral-50);
    font-weight: 600;
    color: var(--wa-color-neutral-600);
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    position: sticky;
    top: 0;
    z-index: 10;
}

.ticket-table tr {
    transition: background-color 0.2s;
}

.ticket-table tr:hover {
    background-color: var(--wa-color-primary-50);
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
    color: var(--wa-color-neutral-600);
}
.actions-cell wa-button {
    margin-right: 0;
    margin-left: -1rem;
}
.filter-details {
    background: white;
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    border: 1px solid var(--wa-color-neutral-200);
    flex-shrink: 0;
}

.filter-details summary {
    padding: 1rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--wa-color-neutral-700);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.filter-details summary::-webkit-details-marker {
  display: none;
}

.filter-details summary::after {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-right: 2px solid var(--wa-color-neutral-500);
    border-bottom: 2px solid var(--wa-color-neutral-500);
    transform: rotate(45deg);
    margin-left: auto;
    transition: transform 0.2s;
}

.filter-details[open] summary::after {
    transform: rotate(225deg);
}

.filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5rem;
    padding: 0 1.5rem 1.5rem 1.5rem;
    background: transparent;
    border-radius: 0;
    box-shadow: none;
    border: none;
    margin-bottom: 0;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.filter-group label {
    font-weight: 500;
    color: var(--wa-color-neutral-700);
    font-size: 0.9rem;
}

.filter-group select,
.filter-group input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--wa-color-neutral-300);
    border-radius: 6px;
    font-size: 0.9rem;
    min-width: 140px;
    transition: all 0.2s;
    background-color: var(--wa-color-neutral-50);
}

.filter-group select:focus,
.filter-group input:focus {
    outline: none;
    border-color: var(--wa-color-primary-500);
    box-shadow: 0 0 0 2px var(--wa-color-primary-100);
    background-color: white;
}
.filter-group wa-select::part(tag) {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 9999px;
    border: 1px solid var(--wa-color-neutral-300);
}


.empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--wa-color-neutral-500);
    background: white;
    border-radius: var(--wa-border-radius-large);
    border: 1px dashed var(--wa-color-neutral-300);
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

.saved-filters {
    padding: 0 1.5rem 1rem 1.5rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
}

.saved-filters-label {
    font-size: 0.85rem;
    color: var(--wa-color-neutral-500);
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

@media (max-width: 768px) {
    .ticket-table {
        display: block;
        background: transparent;
        box-shadow: none;
        border: none;
    }
    
    .ticket-table thead {
        display: none;
    }
    
    .ticket-table tbody {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .ticket-table tr {
        display: flex;
        flex-direction: column;
        background: white;
        border: 1px solid var(--wa-color-neutral-200);
        border-radius: var(--wa-border-radius-large);
        box-shadow: var(--wa-shadow-small);
        padding: 1rem;
        gap: 0.5rem;
    }
    
    .ticket-table td {
        display: flex;
        padding: 0.25rem 0;
        border: none;
        text-align: left;
        justify-content: space-between;
        align-items: flex-start;
    }
    
    .ticket-table td::before {
        content: attr(data-label);
        font-weight: 600;
        color: var(--wa-color-neutral-600);
        margin-right: 1rem;
        flex-shrink: 0;
        font-size: 0.85rem;
        margin-top: 0.1rem;
    }
    
    /* Special handling for Title to make it look like a card header */
    .ticket-table td.title-cell {
        display: block;
        border-bottom: 1px solid var(--wa-color-neutral-100);
        padding-bottom: 0.75rem;
        margin-bottom: 0.5rem;
    }
    
    .ticket-table td.title-cell::before {
        display: none;
    }
    
    .ticket-table td.title-cell strong {
        display: block;
        font-size: 1.1rem;
        margin-bottom: 0.25rem;
    }
    
    .ticket-table td.actions-cell {
        margin-top: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--wa-color-neutral-100);
        justify-content: flex-end;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    
    /* Actions content wrapper to align buttons */
    .actions-cell wa-button {
        margin: 0;
    }
}
</style>
