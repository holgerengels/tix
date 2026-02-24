<template>
  <div class="edit-ticket-view" :class="{ 'is-mobile': ui.state.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon name="arrow-left"></wa-icon>
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
        <h3 slot="header">
            <wa-tag :variant="getStatusColor(ticket)" size="small" style="margin-right: 1ch; vertical-align: middle;">
                {{ getStatusLabel(ticket) }}
            </wa-tag>
            {{ ticket.id }} {{ ticket.title }}
        </h3>
        
        <div slot="header">
            <strong>{{ ticket.creator }}</strong> {{ formatDate(ticket.created) }}
        </div>
        
        <div class="ticket-body">
            <DynamicForm 
                v-if="formFields.length > 0"
                :fields="formFields" 
                :grid="formGrid"
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
import { format } from 'date-fns';
import { ui } from '../state/ui';
import DynamicForm from '../components/DynamicForm.vue';
import { validateTicket } from '../utils/evaluation';

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
const formGrid = ref([]);

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
    
    // Force all fields to be visible for editing
    if (fields) {
        fields.forEach(f => f.visible = true);
    }
    
    formFields.value = fields;
    formGrid.value = wf.grid || [];
    
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
            if (error.value && error.value.includes('Feld')) {
                // If there's an active validation error, re-validate
                if (formFields.value.length > 0) {
                    const wf = config.value[ticket.value.type];
                    const validation = validateTicket(ticketData.value, wf, formFields.value);
                    if (validation.isValid) {
                       error.value = null; // Clear if valid
                    } else {
                       error.value = validation.errors.join(', '); // Update error
                    }
                }
            }
        }, { deep: true });
    }, 500);
};

const save = async () => {
    if (formFields.value.length > 0) {
        const wf = config.value[ticket.value.type];
        const validation = validateTicket(ticketData.value, wf, formFields.value);
        if (!validation.isValid) {
            error.value = validation.errors.join(', ');
            return;
        } else {
            error.value = null;
        }
    }

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
    margin: 1rem;
    flex-shrink: 0;
}
.header h2 {
    margin: 0;
}
.ticket-card {
    height: calc(100% - 70px);
    margin: 0 1rem 1rem 1rem;
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
    min-width: 300px; 
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
.is-mobile {
    height: auto;
    overflow: visible;
}
.is-mobile .ticket-card {
    height: auto;
    margin: 0;
}
.is-mobile .ticket-card::part(body) {
    overflow: visible;
}
.is-mobile .dynamic-form {
    overflow-y: visible;
    height: auto;
}
.is-mobile .header h2 {
    font-size: 1.2rem;
}
.is-narrow .ticket-card h3 {
    font-size: 1rem !important;
}
</style>
