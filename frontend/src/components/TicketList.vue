<template>
  <div class="ticket-list">
    <sl-spinner v-if="loading"></sl-spinner>
    
    <div v-else-if="tickets.length === 0">Keine Tickets gefunden.</div>

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
          <td><sl-tag :variant="getStatusColor(ticket)">{{ getStatusLabel(ticket) }}</sl-tag></td>
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
             <sl-button 
                v-for="action in getActions(ticket)" 
                :key="action.name"
                size="small"
                @click="handleAction(ticket, action)"
            >
                {{ action.name }}
            </sl-button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Action Dialog -->
    <sl-dialog :label="currentAction?.name" :open="!!currentAction" @sl-after-hide="currentAction = null">
        <div v-if="currentFormDef">
            <p v-if="currentFormDef.fields">Bitte ergänzen:</p>
            <DynamicForm v-if="currentFormDef.fields" :fields="currentFormDef.fields" v-model="actionFormData" />
            <p v-else>Bitte bestätigen Sie die Aktion.</p>
        </div>
        <div v-else>
            Sicher, dass diese Aktion ausgeführt werden soll?
        </div>
        
        <div slot="footer">
            <template v-if="currentFormDef && currentFormDef.actions">
                 <sl-button 
                    v-for="btn in currentFormDef.actions" 
                    :key="btn.name" 
                    variant="primary"
                    @click="submitAction(btn)"
                 >
                    {{ btn.name }}
                 </sl-button>
            </template>
            <sl-button v-else variant="primary" @click="submitAction(null)">Ausführen</sl-button>
        </div>
    </sl-dialog>

  </div>
</template>

<script setup>
import { ref, onMounted, defineProps, watch } from 'vue';
import axios from 'axios';
import DynamicForm from './DynamicForm.vue';
import { format } from 'date-fns';

const props = defineProps({
  filter: String,
  config: Object
});

const tickets = ref([]);
const loading = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');

const currentAction = ref(null);
const currentTicket = ref(null);
const actionFormData = ref({});
const currentFormDef = ref(null);

let lastRequestId = 0;

const fetchTickets = async () => {
    const requestId = ++lastRequestId;
    loading.value = true;
    console.log(`[TicketList] Fetching tickets (ID: ${requestId}) for filter: ${props.filter}`);
    
    try {
        const res = await axios.get('/api/tickets', {
            params: { filter: props.filter },
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (requestId === lastRequestId) {
            tickets.value = res.data;
            console.log(`[TicketList] Loaded ${res.data.length} tickets (ID: ${requestId})`);
        } else {
             console.log(`[TicketList] Ignoring stale response (ID: ${requestId})`);
        }
    } catch (err) {
        console.error(`[TicketList] Error fetching tickets (ID: ${requestId})`, err);
    } finally {
        if (requestId === lastRequestId) {
            loading.value = false;
        }
    }
};

watch(() => props.filter, fetchTickets);
onMounted(fetchTickets);

const getStatusColor = (ticket) => {
    if (!props.config || !props.config[ticket.type] || !props.config[ticket.type].states) {
        // Fallback
        if (ticket.state.includes('neu')) return 'primary';
        if (ticket.state.includes('genehmigt') || ticket.state.includes('ok') || ticket.state.includes('erledigt')) return 'success';
        if (ticket.state.includes('abgelehnt') || ticket.state.includes('storniert')) return 'danger';
        return 'neutral';
    }
    const stateDef = props.config[ticket.type].states.find(s => s.name === ticket.state);
    const colorMap = {
        'blue': 'primary',
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
        if (action.groups.includes('@creator')) return ticket.creator === user.username;
        return action.groups.some(g => user.groups.includes(g));
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

        await fetchTickets();
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
        actionFormData.value = {};
        currentFormDef.value = null;
        
        const wf = props.config[ticket.type];
        const formDef = wf.forms?.find(f => f.name === action.form);
        currentFormDef.value = formDef;
        // Dialog opens automatically due to currentAction being set
    } 
    // 3. Simple Action Case: No script (explicitly) and No form -> Just execute.
    // Note: If script existed, we already executed in Step 1.
    // If form exists, we handled it in Step 2.
    // This else-if covers the case where there is neither, or just an action name acting as a trigger.
    else if (!action.script) {
        const success = await executeActionApi(ticket, action, {});
        if (success) {
            fetchTickets();
        }
    }
};

const submitAction = async (btn = null) => {
    const success = await executeActionApi(currentTicket.value, currentAction.value, actionFormData.value, btn ? btn.name : null);
    if (success) {
        currentAction.value = null;
        fetchTickets();
    }
};
</script>

<style scoped>
.ticket-list {
    width: 100%;
    overflow-x: auto;
}
.ticket-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    background: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    border-radius: var(--sl-border-radius-medium);
}

.ticket-table th, .ticket-table td {
    padding: 0.75rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--sl-color-neutral-200);
    vertical-align: top;
}

.ticket-table th {
    background-color: var(--sl-color-neutral-50);
    font-weight: 600;
    color: var(--sl-color-neutral-700);
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
}

.actions-cell {
    gap: 0.5rem;
}
</style>