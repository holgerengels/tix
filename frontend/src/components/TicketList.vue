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
    <sl-dialog :label="(currentTicket?.type || '') + ' ' + (currentAction?.name || '')" :open="!!currentAction" @sl-after-hide="currentAction = null">
        <DynamicForm v-if="currentFormDef && currentFormDef.fields" :fields="currentFormDef.fields" v-model="actionFormData" />
        <div v-else>
            Sicher, dass diese Aktion ausgeführt werden soll?
        </div>
        
        <div slot="footer" class="footer">
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
import { STANDARD_FIELDS } from '../config/standardFields';

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
            const res = await axios.get('/api/tickets', {
                params: { filter: newFilter },
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            // Only update if this is the latest request (simple race condition check)
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

// Watch prop change. 
watch(() => props.filter, (newVal) => {
    fetchTickets(newVal);
});

onMounted(() => {
    fetchTickets(props.filter);
});

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
        
        
        // Prepend Standard Fields
        fields.unshift(...STANDARD_FIELDS);
        
        // If specific form has fields, we might want to merge or append. 
        // Requirement is "all fields of the ticket". 
        // We will prioritize the ticket fields, but if the form defines extra fields, we append them.
        if (specificFormDef && specificFormDef.fields) {
            // Check for duplicates or specific overrides if needed. 
            // For now, simple append of unique fields could work, 
            // or just rely on base fields if the specific form was only defining a subset previously.
            // If the specific form defines fields that are NOT in the base ticket, add them.
            specificFormDef.fields.forEach(sf => {
                if (!fields.find(f => f.name === sf.name)) {
                    fields.push(sf);
                }
            });
        }
        
        // If specific form has fields, we might want to merge or append. 
        // Requirement is "all fields of the ticket". 
        // We will prioritize the ticket fields, but if the form defines extra fields, we append them.
        if (specificFormDef && specificFormDef.fields) {
            // Check for duplicates or specific overrides if needed. 
            // For now, simple append of unique fields could work, 
            // or just rely on base fields if the specific form was only defining a subset previously.
            // If the specific form defines fields that are NOT in the base ticket, add them.
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
    padding: 0.5rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--sl-color-neutral-200);
    vertical-align: middle;
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
.actions-cell sl-button {
    margin-right: 4px;
}
.footer sl-button {
    margin-left: 12px;
}
</style>