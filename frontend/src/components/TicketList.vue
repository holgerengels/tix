<template>
  <div class="ticket-list">
    <sl-spinner v-if="loading"></sl-spinner>
    
    <div v-else-if="tickets.length === 0">Keine Tickets gefunden.</div>

    <sl-card v-for="ticket in tickets" :key="ticket._id" class="ticket-card">
      <div slot="header" class="ticket-header">
        <strong>{{ ticket.typ }}: {{ ticket.titel }}</strong>
        <sl-tag :variant="getStatusColor(ticket.status)">{{ ticket.status }}</sl-tag>
      </div>
      
      <div class="ticket-body">
        <p><strong>Ersteller:</strong> {{ ticket.ersteller }}</p>
        <p><strong>Erstellt:</strong> {{ formatDate(ticket.erstellt) }}</p>
        <p>{{ ticket.beschreibung }}</p>
        
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
            <!-- If form had fields, we would render DynamicForm here -->
            <!-- <DynamicForm :fields="currentFormDef.felder" v-model="actionFormData" /> -->
            <p v-if="currentFormDef.felder">Bitte ergänzen:</p>
            <DynamicForm v-if="currentFormDef.felder" :fields="currentFormDef.felder" v-model="actionFormData" />
            <p v-else>Bitte bestätigen Sie die Aktion.</p>
        </div>
        <div v-else>
            Sicher, dass diese Aktion ausgeführt werden soll?
        </div>
        
        <div slot="footer">
            <template v-if="currentFormDef && currentFormDef.aktionen">
                 <sl-button 
                    v-for="btn in currentFormDef.aktionen" 
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

const fetchTickets = async () => {
    loading.value = true;
    try {
        const res = await axios.get('/api/tickets', {
            params: { filter: props.filter },
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        tickets.value = res.data;
    } catch (err) {
        console.error(err);
    } finally {
        loading.value = false;
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
    const { _id, __v, typ, status, titel, beschreibung, ersteller, erstellt, log, ...rest } = ticket;
    return rest;
};

const getActions = (ticket) => {
    if (!props.config || !props.config[ticket.typ]) return [];
    
    const workflow = props.config[ticket.typ].workflow;
    const currentState = workflow.find(s => s.status.includes(ticket.status));
    
    if (!currentState) return [];
    
    // Filter actions by user group
    return currentState.aktionen.filter(action => {
        if (action.gruppe === '@ersteller') return ticket.ersteller === user.username;
        return user.groups.includes(action.gruppe);
    });
};

const handleAction = (ticket, action) => {
    currentTicket.value = ticket;
    currentAction.value = action;
    actionFormData.value = {};
    currentFormDef.value = null;
    
    if (action.formular) {
        const wf = props.config[ticket.typ];
        const formDef = wf.formulare?.find(f => f.name === action.formular);
        currentFormDef.value = formDef;
    } 
};

const submitAction = async (btn = null) => {
    // If btn (from form) is clicked, it works like a sub-action logic
    // The prompt says: "Die Formulare enthalten Buttons, mit denen jeweils ein Script assoziiert ist."
    
    // If we have a button from the form, WE USE THAT BUTTON as the "action" to execute on backend.
    // BUT the backend expects an action NAME from the workflow state.
    // This implies that the workflow action that OPENED the form is just the potential entry point.
    // The ACTUAL status change is determined by the button clicked in the form.
    
    // My backend logic: finds action in CURRENT STATE.
    // If I send "fertig" (from form), but the current state only has "bearbeiten" (which opened the form)... 
    // The backend `tickets/:id/action` endpoint checks `currentState.aktionen`. 
    // It will NOT find "fertig".
    
    // So either:
    // A) The form buttons trigger a NEW action `post` against the backend, and I need to update backend to support "Form Actions".
    // B) The `actionName` sent to backend is looking for the action that OPENED the form, but maybe we pass "subAction" or "script"?
    
    // Prompt: "Zu jeder Aktion ist ... entweder ein Script ... oder ein Formular ... Die Formulare enthalten Buttons, mit denen jeweils ein Script assoziiert ist."
    // This means the FORM buttons contain the script to execute.
    // So the backend needs to know WHICH script to execute.
    
    // I should modify Backend `tickets/:id/action`:
    // Accept `formActionName` optional.
    // If `formActionName` is present, look up the form definition, find the button, and use ITS script.
    
    // I will pass `actionName` (the main action) AND `formButtonName` (if applicable).
    
    const payload = {
        actionName: currentAction.value.name,
        formData: actionFormData.value
    };
    
    if (btn) {
        payload.formButtonName = btn.name;
    }
    
    try {
        await axios.post(`/api/tickets/${currentTicket.value._id}/action`, payload, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        currentAction.value = null;
        fetchTickets(); 
    } catch (err) {
        alert('Fehler: ' + (err.response?.data?.message || err.message));
    }
};
</script>
