<template>
  <div class="view-ticket-view">
    <div class="header">
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon slot="start" name="arrow-left"></wa-icon> zurück
        </wa-button>
        <h2>Ticket Details</h2>
        <wa-button v-if="undoAction" variant="warning" size="small" appearance="filled" @click="executeUndo">
             <wa-icon slot="start" name="arrow-counterclockwise"></wa-icon> Undo: {{ undoAction.action }}
        </wa-button>
        <wa-button v-if="canDelete" variant="danger" size="small" appearance="filled" @click="deleteTicket">
             <wa-icon slot="start" name="trash"></wa-icon> Löschen
        </wa-button>
    </div>

    <div v-if="loading" class="loading">
        <wa-spinner></wa-spinner> Lade Ticket...
    </div>

    <div v-else-if="error" class="error">
        {{ error }}
    </div>

    <wa-card v-else-if="ticket" class="ticket-card" with-header with-footer>
        <h3 slot="header">
            <wa-tag :variant="getStatusColor(ticket)" size="small" style="margin-right: 1ch; vertical-align: middle;">
                {{ getStatusLabel(ticket) }}
            </wa-tag>
            {{ ticket.id }} {{ ticket.title }}
        </h3>
        
        <div slot="header" class="ticket-meta">
            <span>Erstellt von <strong>{{ ticket.creator }}</strong> am {{ formatDate(ticket.created) }}</span>
            <span v-if="ticket.assignee"> | Zugewiesen an <strong>{{ ticket.assignee }}</strong></span>
        </div>

        <div class="ticket-body">
            <DynamicForm 
                v-if="formFields.length > 0"
                :fields="formFields" 
                v-model="ticketData"
            />
            <div v-else class="message">
                Keine weiteren Details verfügbar.
            </div>

            <aside class="comments-sidebar">
                <TicketComments v-if="canComment" :ticket="ticket" />
            </aside>
        </div>
            <wa-button slot="footer-actions" @click="goBack" appearance="plain">Abbrechen</wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { format } from 'date-fns';
import DynamicForm from '../components/DynamicForm.vue';
import TicketComments from '../components/TicketComments.vue';

const route = useRoute();
const router = useRouter();
const ticket = ref(null);
const config = ref({});
const loading = ref(true);
const error = ref(null);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const undoAction = ref(null);

const ticketData = ref({});
const formFields = ref([]);

const goBack = () => {
    // Check for Navigation API support (modern browsers)
    if (window.navigation && typeof window.navigation.canGoBack === 'boolean') {
        if (window.navigation.canGoBack) {
            router.back();
            return;
        }
    } 
    // Fallback for older browsers or if Navigation API is not present
    else if (window.history.length > 1) {
        router.back();
        return;
    }
    
    // Default fallback: Go to "My Tickets" (which implies home/list view here)
    router.push('/');
};

const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
        // Fetch Config first
        const configRes = await axios.get('/api/config', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        config.value = configRes.data;

        // Fetch Ticket
        const ticketRes = await axios.get('/api/tickets', {
            params: { id: route.params.id },
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (ticketRes.data && ticketRes.data.length > 0) {
            ticket.value = ticketRes.data[0];
            prepareForm();
            checkUndo(); 
        } else {
            error.value = "Ticket nicht gefunden.";
        }

    } catch (err) {
        console.error(err);
        error.value = "Fehler beim Laden der Daten.";
    } finally {
        loading.value = false;
    }
};

const checkUndo = async () => {
    try {
        const res = await axios.get(`/api/tickets/${ticket.value._id}/undoable`, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        undoAction.value = res.data;
    } catch (err) {
        console.error("Error checking undo:", err);
    }
};

const executeUndo = async () => {
    if (!confirm('Möchten Sie die letzte Aktion wirklich rückgängig machen?')) return;
    
    try {
        await axios.post(`/api/tickets/${ticket.value._id}/undo`, {}, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        // Reload data
        fetchData();
    } catch (err) {
        alert('Undo fehlgeschlagen: ' + (err.response?.data?.message || err.message));
    }
};

const deleteTicket = async () => {
    if (!confirm('Sind Sie sicher, dass Sie dieses Ticket löschen möchten?')) return;
    
    try {
        await axios.delete(`/api/tickets/${ticket.value._id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        router.push('/');
    } catch (err) {
        alert('Löschen fehlgeschlagen: ' + (err.response?.data?.message || err.message));
    }
};

const prepareForm = () => {
    if (!ticket.value || !config.value[ticket.value.type]) return;
    
    const wf = config.value[ticket.value.type];
    const fields = wf.fields ? JSON.parse(JSON.stringify(wf.fields)) : [];
    
    // Mark all as readonly
    fields.forEach(f => f.readonly = true);
    
    formFields.value = fields;
    
    // Prepare data
    // Mix standard fields that might be in the form definition with dynamic fields
    ticketData.value = {
        title: ticket.value.title,
        description: ticket.value.description,
        assignee: ticket.value.assignee,
        ...ticket.value // includes dynamic fields
    };
};

const canComment = computed(() => {
    if (!ticket.value || !config.value[ticket.value.type]) return false;
    
    if (ticket.value.creator === user.username) return true;
    if (ticket.value.assignee === user.username) return true;

    const access = config.value[ticket.value.type].access;
    if (!access) return false;
    
    const rule = access.find(r => r.name === 'comment');
    if (!rule) return false;
    
    return rule.groups.some(g => user.groups.includes(g));
});

const canDelete = computed(() => {
    if (!ticket.value || !config.value[ticket.value.type]) return false;
    
    const access = config.value[ticket.value.type].access;
    if (!access) return false;
    
    const rule = access.find(r => r.name === 'delete');
    if (!rule) return false;
    
    return rule.groups.some(g => user.groups.includes(g));
});

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

const getStatusColor = (ticket) => {
    if (!config.value || !config.value[ticket.type]) return 'neutral';
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

onMounted(fetchData);
</script>

<style scoped>
.view-ticket-view {
    max-width: 1600px;
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
    margin-right: auto;
}
.ticket-card {
    height: calc(100% - 70px);
}
.ticket-card::part(header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.ticket-card::part(body) {
    height: 100%;
    display: flex;
    flex-direction: row;
    gap: 2rem;
    align-items: stretch;
    min-height: 0; /* Crucial for nested scrolling */
}
.ticket-body {
    height: 100%;
    display: contents;
}
.ticket-card::part(footer) {
    justify-content: end;
    gap: 1rem;
}
.dynamic-form {
    height: 100%;
    flex: 2;
    min-width: 0; 
    overflow-y: auto;
    padding-right: 0.5rem;
}
.comments-sidebar {
    height: 100%;
    flex: 1;
    min-width: 300px;
    border-left: 1px solid var(--wa-color-neutral-200);
    padding-left: 2rem;
    display: flex;
    flex-direction: column;
    overflow: hidden; 
}
.message {
    padding: 2rem;
    font-size: 1.1rem;
    text-align: center;
    color: var(--wa-color-neutral-700);
}
.loading, .error {
    text-align: center;
    padding: 3rem;
    color: var(--wa-color-neutral-500);
}
.error {
    color: var(--wa-color-danger-700);
}
</style>
