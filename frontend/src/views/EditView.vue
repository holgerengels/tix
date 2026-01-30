<template>
  <div class="edit-ticket-view">
    <div class="header">
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon slot="start" name="arrow-left"></wa-icon> zurück
        </wa-button>
        <h2>Ticket editieren</h2>
    </div>

    <div v-if="loading" class="loading">
        <wa-spinner></wa-spinner> Lade Ticket...
    </div>

    <div v-else-if="error" class="error">
        {{ error }}
    </div>

    <wa-card v-else-if="ticket" class="ticket-card" with-header with-footer>
        <h3 slot="header">{{ ticket.id }} {{ ticket.title }}</h3>
        
        <div class="ticket-body">
            <DynamicForm 
                v-if="formFields.length > 0"
                :fields="formFields" 
                v-model="ticketData"
            />
        </div>

        <wa-button slot="footer-actions" @click="goBack" appearance="plain">Abbrechen</wa-button>
        <wa-button slot="footer-actions" variant="primary" @click="save" :loading="saving">Speichern</wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import DynamicForm from '../components/DynamicForm.vue';

const route = useRoute();
const router = useRouter();
const ticket = ref(null);
const config = ref({});
const loading = ref(true);
const saving = ref(false);
const error = ref(null);
const isDirty = ref(false);

const ticketData = ref({});
const formFields = ref([]);

const goBack = () => {
    router.back();
};

const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
        const configRes = await axios.get('/api/config', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        config.value = configRes.data;

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
    
    formFields.value = fields;
    
    ticketData.value = {
        title: ticket.value.title,
        description: ticket.value.description,
        assignee: ticket.value.assignee,
        ...ticket.value 
    };

    // Watch for changes after initial load
    setTimeout(() => {
        watch(ticketData, () => {
            isDirty.value = true;
        }, { deep: true });
    }, 500);
};

const save = async () => {
    saving.value = true;
    try {
        // Edit is an action named 'edit' usually, OR we can just update?
        // The previous implementation used executeActionApi with action name 'edit'.
        // Let's verify ticket list logic: 
        // authorizedActions.push({ name: 'editieren', form: 'edit', ... })
        // And submitAction sends payload { actionName: action.name, formData: ... }
        // So we should send actionName: 'editieren' (or what logic dictates).
        // Wait, the generic 'edit' button pushed in TicketList had name: 'editieren'.
        // Let's stick to that convention.
        
        const payload = {
            actionName: 'editieren',
            formData: ticketData.value
        };

        await axios.post(`/api/tickets/${ticket.value._id}/action`, payload, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        isDirty.value = false; // Reset dirty flag so we can navigate
        isDirty.value = false; 
        if (window.history.length > 1) {
             router.back();
        } else {
             router.push('/');
        }

    } catch (err) {
        alert('Fehler beim Speichern: ' + (err.response?.data?.message || err.message));
    } finally {
        saving.value = false;
    }
};

onBeforeRouteLeave((to, from, next) => {
    if (isDirty.value) {
        const answer = window.confirm('Änderungen gehen verloren. Wollen Sie die Seite wirklich verlassen?');
        if (answer) {
            next();
        } else {
            next(false);
        }
    } else {
        next();
    }
});

onMounted(fetchData);
</script>

<style scoped>
.edit-ticket-view {
    max-width: 1600px;
    height: 100%;
    display: flex;
    flex-direction: column;
}
.header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-shrink: 0;
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
    overflow: hidden; /* Comments component handles internal scrolling */
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
