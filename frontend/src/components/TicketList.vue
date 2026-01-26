<template>
  <div class="ticket-list" ref="ticketListRef">
    <details class="filter-details">
        <summary>Filter</summary>
        <div class="filters">
            <div class="filter-group">
                <label>Typ:</label>
                <select v-model="filterType" @change="handleTypeChange">
                    <option value="">Alle</option>
                    <option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</option>
                </select>
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
                <label>Erstellt:</label>
                <select v-model="filterDateRange" @change="handleDateRangeChange">
                    <option value="">Zeitraum wählen</option>
                    <option value="week">Letzte Woche</option>
                    <option value="month">Letzter Monat</option>
                    <option value="custom">Benutzerdefiniert</option>
                </select>
            </div>
            <div class="filter-group" v-if="filterDateRange === 'custom'">
                <input type="date" v-model="filterDateFrom" @change="applyFilters" />
                <span>-</span>
                <input type="date" v-model="filterDateTo" @change="applyFilters" />
            </div>
            <div class="filter-group">
                <wa-button appearance="plain" @click="resetFilters">Reset</wa-button>
            </div>
        </div>
    </details>

    <wa-spinner v-if="loading"></wa-spinner>
    
    <div v-else-if="tickets.length === 0" class="empty-state">Keine Tickets gefunden.</div>

    <table v-else class="ticket-table">
      <thead>
        <tr>
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
          <td>{{ ticket.type }}</td>
          <td><strong>{{ ticket.title }}</strong></td>
          <td><wa-tag :variant="getStatusColor(ticket)">{{ getStatusLabel(ticket) }}</wa-tag></td>
          <td>{{ ticket.creator }}</td>
          <td>{{ formatDate(ticket.created) }}</td>
          <td>
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
                @click="handleAction(ticket, action)"
            >
                {{ action.name }}
            </wa-button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Action Dialog -->
    <wa-dialog 
        ref="dialogRef"
        :label="(currentTicket?.type || '') + ' ' + (currentAction?.name || '')" 
        :open="!!currentAction" 
        @after-hide="currentAction = null"
        @request-close="handleRequestClose"
        class="action-dialog"
    >
        <div class="dialog-content-wrapper">
            <div class="dialog-main">
                <DynamicForm v-if="currentFormDef && currentFormDef.fields" :fields="currentFormDef.fields" v-model="actionFormData" />
                <div v-else>
                    Sicher, dass diese Aktion ausgeführt werden soll?
                </div>
            </div>
            
            <aside class="dialog-sidebar" v-if="canComment">
                <TicketComments :ticket="currentTicket" />
            </aside>
        </div>
        
        <div slot="footer" class="footer">
            <template v-if="currentFormDef && currentFormDef.actions">
                 <wa-button 
                    v-for="btn in currentFormDef.actions" 
                    :key="btn.name" 
                    variant="primary"
                    type="button"
                    @click="submitAction(btn)"
                 >
                    {{ btn.name }}
                 </wa-button>
            </template>
            <wa-button v-else variant="primary" type="button" @click="submitAction(null)">Ausführen</wa-button>
        </div>
    </wa-dialog>

  </div>
</template>

<script setup>
import { ref, onMounted, defineProps, watch, nextTick, computed } from 'vue';
import axios from 'axios';
import DynamicForm from './DynamicForm.vue';
import TicketComments from './TicketComments.vue';
import { format, subDays, startOfDay, endOfDay, subMonths } from 'date-fns';

const props = defineProps({
  filter: String,
  config: Object
});

const tickets = ref([]);
const loading = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');

// Filters
const filterType = ref('');
const filterStatus = ref('');
const filterCreator = ref('');
const filterDateRange = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');

const currentAction = ref(null);
const currentTicket = ref(null);
const actionFormData = ref({});
const currentFormDef = ref(null);

const availableTypes = computed(() => {
    return props.config ? Object.keys(props.config) : [];
});

const availableStatuses = computed(() => {
    if (!filterType.value) {
        return ['offen.*', 'geschlossen.*'];
    }
    
    // Exact states for the selected type
    if (props.config && props.config[filterType.value] && props.config[filterType.value].states) {
        return props.config[filterType.value].states.map(s => s.name);
    }
    return [];
});

const canComment = computed(() => {
    if (!currentTicket.value || !props.config || !props.config[currentTicket.value.type]) return false;
    
    // Creator and Assignee always allowed (conceptually, though backend enforces too)
    if (currentTicket.value.creator === user.username) return true;
    if (currentTicket.value.assignee === user.username) return true;

    const access = props.config[currentTicket.value.type].access;
    if (!access) return false;
    
    const rule = access.find(r => r.name === 'comment');
    if (!rule) return false;
    
    return rule.groups.some(g => user.groups.includes(g));
});

let lastRequestId = 0;
let debounceTimer = null;

const fetchTickets = async (newFilter) => {
    // Clear existing timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    // UI Feedback immediately
    loading.value = true;
    
    debounceTimer = setTimeout(async () => {
        const requestId = ++lastRequestId;
        
        try {
            const params = {
                filter: newFilter || props.filter,
                type: filterType.value,
                status: filterStatus.value,
                creator: filterCreator.value,
                dateFrom: filterDateFrom.value,
                dateTo: filterDateTo.value
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
    fetchTickets(props.filter);
};

const applyFiltersDebounced = () => {
    fetchTickets(props.filter); // fetchTickets already debounces
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
    // For 'custom', we leave fields as is (user fills them)
    
    applyFilters();
};

const handleTypeChange = () => {
    filterStatus.value = ''; // Reset status when type changes
    applyFilters();
};

const resetFilters = () => {
    filterType.value = '';
    filterStatus.value = '';
    filterCreator.value = '';
    filterDateRange.value = '';
    filterDateFrom.value = '';
    filterDateTo.value = '';
    applyFilters();
};

// Watch prop change. 
watch(() => props.filter, (newVal) => {
    fetchTickets(newVal);
});

onMounted(() => {
    fetchTickets(props.filter);
});

const getStatusColor = (ticket) => {
    const stateDef = props.config[ticket.type].states.find(s => s.name === ticket.state);
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
    if (!props.config || !props.config[ticket.type] || !props.config[ticket.type].states) {
        return ticket.state;
    }
    const stateDef = props.config[ticket.type].states.find(s => s.name === ticket.state);
    return stateDef ? stateDef.label : ticket.state;
};

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

const getDynamicFields = (ticket) => {
    const { _id, __v, type, state, title, description, creator, created, updated, log, ...rest } = ticket;
    return rest;
};

const hasTemplate = (ticket) => {
    return props.config && props.config[ticket.type] && props.config[ticket.type].template;
};

const getFormattedData = (ticket) => {
    if (!hasTemplate(ticket)) return '';
    let template = props.config[ticket.type].template;
    const fields = getDynamicFields(ticket);
    const fieldDefs = props.config[ticket.type].fields || [];
    
    // Replace all placeholders {{Key}} or ${Key} with value
    for (const [key, val] of Object.entries(fields)) {
        let displayVal = val;
        
        // Find field definition to check type
        const fieldDef = fieldDefs.find(f => f.name === key);

        if (fieldDef && fieldDef.type === 'Date' && val) {
            try {
                displayVal = format(new Date(val), 'dd.MM.yyyy');
            } catch (e) {
                console.error(`[debug] Date format error for ${key}:`, e);
            }
        }

        // Replace {{Key}}
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), displayVal);
        // Replace ${Key}
        template = template.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), displayVal);
    }
    return template;
};

const getActions = (ticket) => {
    if (!props.config || !props.config[ticket.type]) return [];
    
    const workflow = props.config[ticket.type].workflow;
    // Support multiple workflow blocks for the same state
    const matchingBlocks = workflow.filter(s => s.states.includes(ticket.state));
    
    if (matchingBlocks.length === 0) return [];
    
    const allActions = matchingBlocks.flatMap(block => block.actions);

    // Filter actions by user group
    const authorizedActions = allActions.filter(action => {
        const allowedByCreator = action.groups.includes('@creator') && ticket.creator === user.username;
        const allowedByAssignee = action.groups.includes('@assignee') && ticket.assignee === user.username;
        const allowedByGroup = action.groups.some(g => user.groups.includes(g));
        return allowedByCreator || allowedByAssignee || allowedByGroup;
    });

    // Filter by View Context
    if (props.filter === 'assigned') {
        return authorizedActions.filter(a => !a.optional);
    } else if (props.filter === 'my') {
        return authorizedActions.filter(a => a.optional === true);
    }
    
    // Default / 'all': Show all authorized
    return authorizedActions;
};

const executeActionApi = async (ticket, action, formData, btnName = null) => {
    const payload = {
        actionName: action.name,
        formData: formData
    };
    if (btnName) payload.formButtonName = btnName;

    try {
        await axios.post(`/api/tickets/${ticket._id}/action`, payload, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        return true;
    } catch (err) {
        alert('Fehler: ' + (err.response?.data?.message || err.message));
        return false;
    }
};

const handleAction = async (ticket, action) => {
    // 1. Script Case: If script exists, execute it immediately
    if (action.script) {
        const success = await executeActionApi(ticket, action, {});
        if (!success) return; // Stop if script execution failed

        await fetchTickets(props.filter);
        // Update local ticket reference to the latest version after script
        const updatedTicket = tickets.value.find(t => t._id === ticket._id);
        if (updatedTicket) {
            ticket = updatedTicket;
        }
    }

    // 2. Form Case: If form exists, show it (potentially after script)
    if (action.form) {
        currentTicket.value = ticket;
        currentAction.value = { ...action }; // Cloned to be safe
        
        // Pre-fill form data with current ticket values
        actionFormData.value = { 
            title: ticket.title,
            description: ticket.description,
            assignee: ticket.assignee,
            ...getDynamicFields(ticket) 
        };
        currentFormDef.value = null;
        
        const wf = props.config[ticket.type];
        const specificFormDef = wf.forms?.find(f => f.name === action.form);
        
        // Base fields from ticket definition
        let fields = [...(wf.fields || [])];
        
        if (specificFormDef && specificFormDef.fields) {
            specificFormDef.fields.forEach(sf => {
                if (!fields.find(f => f.name === sf.name)) {
                    fields.push(sf);
                }
            });
        }
        
        if (specificFormDef && specificFormDef.fields) {
            specificFormDef.fields.forEach(sf => {
                if (!fields.find(f => f.name === sf.name)) {
                    fields.push(sf);
                }
            });
        }

        // Construct a composite form definition
        currentFormDef.value = {
            ...specificFormDef,
            fields: fields,
            actions: specificFormDef ? specificFormDef.actions : [] // Preserve actions (buttons)
        };
    } 
    else if (!action.script) {
        const success = await executeActionApi(ticket, action, {});
        if (success) {
            fetchTickets(props.filter);
        }
    }
};

const handleRequestClose = (event) => {
    console.log(event.detail.source);
    if (event.detail.source === 'overlay') {
        event.preventDefault();
    }
};

const submitAction = async (btn = null) => {
    const success = await executeActionApi(currentTicket.value, currentAction.value, actionFormData.value, btn ? btn.name : null);
    if (success) {
        currentAction.value = null;
        fetchTickets(props.filter);
    }
};
</script>

<style scoped>
/* Force dialog to be absolute within the nearest positioned ancestor (main-content) */
wa-dialog::part(base),
wa-dialog::part(overlay) {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
}

wa-dialog::part(body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
}

wa-dialog::part(panel) {
    max-height: 90vh;
    min-width: 900px;
    width: 90%;
    display: flex;
    flex-direction: column;
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-large);
}

.dialog-content-wrapper {
    display: flex;
    flex: 1;
    gap: 2rem;
    min-height: 400px;
    height: 100%;
    padding: 2rem;
}

.dialog-main {
    flex: 2;
    padding: var(--wa-spacing-large);
    overflow-y: auto;
    background: white;
}

.dialog-sidebar {
    flex: 1;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    background: white;
    overflow: hidden;
}

.ticket-list {
    width: 100%;
    overflow-x: auto;
}

.ticket-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin-top: 1.5rem;
    background: white;
    box-shadow: var(--wa-shadow-small);
    border-radius: var(--wa-border-radius-large);
    overflow: hidden;
    border: 1px solid var(--wa-color-neutral-200);
}

.ticket-table th, .ticket-table td {
    padding: 0.5rem 1rem;
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
    margin-right: 4px;
}
.footer {
    display: flex;
    gap: 1rem;
}

.filter-details {
    margin-bottom: 1.5rem;
    background: white;
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    border: 1px solid var(--wa-color-neutral-200);
}

.filter-details summary {
    padding: 1rem 1.5rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--wa-color-neutral-700);
    list-style: none; /* Hide default triangle */
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
    padding: 0 1.5rem 1.5rem 1.5rem; /* Remove top padding as summary has it */
    background: transparent; /* Parent has bg */
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

.empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--wa-color-neutral-500);
    background: white;
    border-radius: var(--wa-border-radius-large);
    border: 1px dashed var(--wa-color-neutral-300);
}
</style>