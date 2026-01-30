<template>
  <div class="view-ticket-view">
    <div class="header">
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon slot="start" name="arrow-left"></wa-icon> zurück
        </wa-button>
        <h2>Ticket Details</h2>
    </div>

    <div v-if="loading" class="loading">
        <wa-spinner></wa-spinner> Lade Ticket...
    </div>

    <div v-else-if="error" class="error">
        {{ error }}
    </div>

    <wa-card v-else-if="ticket" class="ticket-card" with-header with-footer>
        <h3 slot="header">{{ ticket.id }} {{ ticket.title }}</h3>
        
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

            <aside class="comments-sidebar" v-if="canComment">
                <TicketComments :ticket="ticket" />
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

const ticketData = ref({});
const formFields = ref([]);

const goBack = () => {
    router.back();
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

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

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
}
.ticket-card {
    height: calc(100% - 70px);
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
