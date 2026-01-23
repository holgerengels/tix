<template>
  <div class="ticket-list">
    <sl-spinner v-if="loading"></sl-spinner>
    
    <div v-else-if="tickets.length === 0">Keine Tickets gefunden.</div>

    <sl-card v-for="ticket in tickets" :key="ticket._id" class="ticket-card">
      <div slot="header" class="ticket-header">
        <strong>{{ ticket.type }}: {{ ticket.title }}</strong>
        <sl-tag :variant="getStatusColor(ticket.state)">{{ ticket.state }}</sl-tag>
      </div>
      
      <div class="ticket-body">
        <p><strong>Ersteller:</strong> {{ ticket.creator }}</p>
        <p><strong>Erstellt:</strong> {{ formatDate(ticket.created) }}</p>
        <p>{{ ticket.description }}</p>
        
        <!-- Dynamic Fields Display (simplified) -->
        <div v-for="(val, key) in getDynamicFields(ticket)" :key="key">
            <strong>{{ key }}:</strong> {{ val }}
        </div>
      </div>

      <div slot="footer" class="ticket-actions">
        <!-- Render Actions -->
        <sl-button 
            v-for="action in getActions(ticket)" 
            :key="action.name"
            size="small"
            @click="handleAction(ticket, action)"
        >
            {{ action.name }}
        </sl-button>
      </div>
    </sl-card>

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

const getStatusColor = (status) => {
    if (status.includes('neu')) return 'primary';
    if (status.includes('genehmigt') || status.includes('ok')) return 'success';
    if (status.includes('abgelehnt')) return 'danger';
    return 'neutral';
};

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

const getDynamicFields = (ticket) => {
    const { _id, __v, type, state, title, description, creator, created, log, ...rest } = ticket;
    return rest;
};

const getActions = (ticket) => {
    if (!props.config || !props.config[ticket.type]) return [];
    
    const workflow = props.config[ticket.type].workflow;
    const currentState = workflow.find(s => s.states.includes(ticket.state));
    
    if (!currentState) return [];
    
    // Filter actions by user group
    return currentState.actions.filter(action => {
        if (action.groups.includes('@creator')) return ticket.creator === user.username;
        return action.groups.some(g => user.groups.includes(g));
    });
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