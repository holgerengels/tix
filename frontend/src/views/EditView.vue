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

    <wa-card v-else-if="ticket" class="ticket-card">
      <div class="card-wrapper">
        <div class="ticket-header">
             <h3 class="ticket-title">{{ ticket.id }} {{ ticket.title }}</h3>
        </div>
        
        <div class="ticket-body">
            <DynamicForm 
                v-if="formFields.length > 0"
                :fields="formFields" 
                v-model="ticketData"
            />
        </div>

        <div class="actions">
            <wa-button @click="goBack" appearance="plain">Abbrechen</wa-button>
            <wa-button variant="primary" @click="save" :loading="saving">Speichern</wa-button>
        </div>
      </div>
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
    max-width: 1000px;
    margin: 0 auto;
    padding: 1rem;
    height: calc(100vh - 100px);
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
    width: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
}
.ticket-card::part(base) {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.ticket-header {
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--wa-color-neutral-200);
    padding-bottom: 1rem;
    flex-shrink: 0;
}
.ticket-title {
    margin: 0;
}
.ticket-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto; /* Form scrolls here */
    padding-right: 0.5rem;
}
.actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--wa-color-neutral-200);
    flex-shrink: 0;
}
.loading, .error {
    text-align: center;
    padding: 3rem;
    color: var(--wa-color-neutral-500);
}
.error {
    color: var(--wa-color-danger-700);
}
.card-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
}
</style>
