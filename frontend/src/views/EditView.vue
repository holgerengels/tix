<template>
  <div class="edit-ticket-view" :class="{ 'is-mobile': ui.isMobile }">
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
        <div slot="header" style="display: flex; flex-direction: column; width: 100%; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 1ch;">
                    <wa-tag v-if="ticket.parentTicket" variant="brand" size="small" style="cursor: pointer;" @click="router.push(`/tickets/${ticket.parentTicket}/view`)">
                        ⮤ {{ ticket.parentTicket }}
                    </wa-tag>
                    
                    <h3 style="margin: 0; display: inline-flex; align-items: center; gap: 1ch;">
                        <wa-tag :variant="getStatusColor(ticket)" size="small">
                            {{ getStatusLabel(ticket) }}
                        </wa-tag>
                        <span>{{ ticket.id }} {{ ticket.title }}</span>
                    </h3>
                    
                    <template v-if="ticket.subTickets && ticket.subTickets.length > 0">
                        <wa-tag v-for="sub in ticket.subTickets" :key="sub.id" variant="brand" size="small" style="cursor: pointer;" @click="router.push(`/tickets/${sub.id}/view`)">
                            ⮡ {{ sub.id }} ({{ getStatusLabel(sub) }})
                        </wa-tag>
                    </template>
                </div>

                <wa-dropdown v-if="allowedSubticketTypes.length > 0">
                    <wa-button slot="trigger" size="small" variant="neutral" appearance="outlined">
                        Subticket erstellen <wa-icon name="chevron-down" style="margin-left: 0.5rem;"></wa-icon>
                    </wa-button>
                    <wa-dropdown-item v-for="type in allowedSubticketTypes" :key="type" @click="createSubticket(type)">
                        {{ type }}
                    </wa-dropdown-item>
                </wa-dropdown>
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div><strong>{{ usersStore.getDisplayName(ticket.creator) }}</strong> {{ formatDate(ticket.created) }}</div>
            </div>
        </div>
        
        <div class="ticket-body">
            <DynamicForm 
                v-if="formFields.length > 0"
                ref="formRef"
                :fields="formFields" 
                :grid="formGrid"
                :workflow="config[ticket.type]"
                v-model="ticketData"
            />
        </div>

        <wa-button slot="footer-actions" size="small" @click="goBack" appearance="plain">Abbrechen</wa-button>
        <wa-button slot="footer-actions" size="small" variant="primary" @click="save" :loading="saving">Speichern</wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import { format } from 'date-fns';
import { useUiStore } from '../stores/ui';
import { useUsersStore } from '../stores/users';
import { useWorkflowStore } from '../stores/workflow';
import { toast, confirm } from '../composables/useToast';
import { useTicketAccess } from '../composables/useTicketAccess';

const ui = useUiStore();
const usersStore = useUsersStore();
const workflow = useWorkflowStore();
import DynamicForm from '../components/DynamicForm.vue';
import { validateTicket } from '../utils/evaluation';

const route = useRoute();
const router = useRouter();
const ticket = ref(null);
const config = computed(() => workflow.config);
const loading = ref(true);
const saving = ref(false);
const error = ref(null);
const isDirty = ref(false);
const formRef = ref(null);
const user = JSON.parse(localStorage.getItem('user') || '{}');

const ticketData = ref({});
const formFields = ref([]);
const formGrid = ref([]);

const {
    allowedSubticketTypes,
    getStatusColor, getStatusLabel
} = useTicketAccess(ticket, config, user);

const goBack = () => {
    router.back();
};

const createSubticket = (type) => {
    router.push({ path: '/tickets/new', query: { type: type, parent: ticket.value.id } });
};

const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
        const [_, ticketRes] = await Promise.all([
            workflow.fetchConfig(),
            axios.get('/api/tickets', {
                params: { id: route.params.id },
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
        ]);
        
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
    if (!ticket.value || !config.value || !config.value[ticket.value.type]) return;
    
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
        }, { deep: true });
    }, 500);
};

const save = async () => {
    if (formRef.value && !formRef.value.validate()) {
        return;
    }

    saving.value = true;
    error.value = null;
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
        console.error(err);
    } finally {
        saving.value = false;
    }
};

onBeforeRouteLeave(async (to, from, next) => {
    if (isDirty.value) {
        const answer = await confirm('Änderungen gehen verloren. Willst du die Seite wirklich verlassen?');
        next(answer ? undefined : false);
    } else {
        next();
    }
});

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

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
    min-height: 0;
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
    border-left: 1px solid var(--wa-color-neutral-70);
    padding-left: 2rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.loading, .error {
    text-align: center;
    padding: 3rem;
    color: var(--wa-color-neutral-40);
}
.error {
    color: var(--wa-color-danger-20);
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
