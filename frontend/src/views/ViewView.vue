<template>
  <div class="view-ticket-view" :class="{ 'is-mobile': ui.isMobile, 'is-narrow': ui.isNarrow }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon name="arrow-left"></wa-icon>
        </wa-button>
        <h2>Ticket Details</h2>
        <wa-button v-if="undoAction" variant="warning" size="small" appearance="filled" @click="executeUndo">
             <wa-icon slot="start" name="arrow-counterclockwise"></wa-icon> Undo: {{ undoAction.action }}
        </wa-button>
        <wa-button v-if="canEdit" variant="neutral" size="small" appearance="filled" @click="editTicket">
             <wa-icon slot="start" name="pencil"></wa-icon> Editieren
        </wa-button>
        <wa-button v-if="canDelete" variant="danger" size="small" appearance="filled" @click="deleteTicket">
             <wa-icon slot="start" name="x-lg"></wa-icon> Löschen
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
        
        <div slot="header">
            <strong>{{ usersStore.getDisplayName(ticket.creator) }}</strong> {{ formatDate(ticket.created) }}
        </div>

        <div class="ticket-content">
            <DynamicForm 
                v-if="formFields.length > 0"
                :fields="formFields" 
                :grid="formGrid"
                v-model="ticketData"
            />
            <div v-else class="message">
                Keine weiteren Details verfügbar.
            </div>

            <aside class="comments-sidebar">
                <TicketComments v-if="canComment" :ticket="ticket" />
            </aside>
        </div>
                <wa-button slot="footer-actions" size="small" @click="goBack" variant="neutral" appearance="filled">Abbrechen</wa-button>
                <wa-divider slot="footer-actions" orientation="vertical"></wa-divider>
                <wa-button slot="footer-actions" variant="neutral" appearance="plain" class="action"
                    v-for="action in getActions(ticket)" 
                    :key="action.name"
                    size="small"
                    :loading="executingActionId === (ticket._id + '-' + action.name)"
                    @click="handleAction(ticket, action)"
                >
                    {{ action.name }}
                </wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { format } from 'date-fns';
import { useUiStore } from '../stores/ui';
import { useWorkflowStore } from '../stores/workflow';
import { useUsersStore } from '../stores/users';
import DynamicForm from '../components/DynamicForm.vue';
import TicketComments from '../components/TicketComments.vue';
import { toast, confirm } from '../composables/useToast';

const ui = useUiStore();
const workflow = useWorkflowStore();
const usersStore = useUsersStore();

const route = useRoute();
const router = useRouter();
const ticket = ref(null);
const config = computed(() => workflow.config);
const loading = ref(true);
const error = ref(null);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const undoAction = ref(null);
const executingActionId = ref(null);

const ticketData = ref({});
const formFields = ref([]);
const formGrid = ref([]);

const goBack = () => {
    // Check if we have a robust "previous" state from Vue Router
    // window.history.state.back is set by Vue Router to the *path* of the previous entry if internal
    if (window.history.state && window.history.state.back) {
        router.back();
    } else {
        // If no internal history (Deep Link -> Login -> Here), go to Home
        router.push('/');
    }
};

const fetchData = async () => {
    loading.value = true;
    error.value = null;
    try {
        // Fetch Config first
        await workflow.fetchConfig();

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
    if (!await confirm('Willst du die letzte Aktion wirklich rückgängig machen?')) return;
    
    try {
        await axios.post(`/api/tickets/${ticket.value._id}/undo`, {}, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        // Reload data
        fetchData();
    } catch (err) {
        toast.error('Undo fehlgeschlagen: ' + (err.response?.data?.message || err.message));
    }
};

const editTicket = () => {
    router.push(`/tickets/${ticket.value.id}/edit`);
};

const deleteTicket = async () => {
    if (!await confirm('Bist Du sicher, dass Du dieses Ticket löschen möchtest?')) return;
    
    try {
        await axios.delete(`/api/tickets/${ticket.value._id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        router.push('/');
    } catch (err) {
        toast.error('Löschen fehlgeschlagen: ' + (err.response?.data?.message || err.message));
    }
};

const prepareForm = () => {
    if (!ticket.value || !config.value[ticket.value.type]) return;
    
    const wf = config.value[ticket.value.type];
    const fields = wf.fields ? JSON.parse(JSON.stringify(wf.fields)) : [];
    
    // Mark all as readonly
    fields.forEach(f => f.readonly = true);
    fields.forEach(f => { if (f.name === 'badges') f.visible = true; });
    
    formFields.value = fields;
    formGrid.value = wf.grid || [];
    
    // Prepare data
    // Mix standard fields that might be in the form definition with dynamic fields
    ticketData.value = {
        title: ticket.value.title,
        badges: ticket.value.badges,
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
    
    return rule.groups.some(g => (user.groups || []).includes(g));
});

const canEdit = computed(() => {
    if ((user.groups || []).includes('Administration')) return true;

    if (!ticket.value || !config.value[ticket.value.type]) return false;
    
    const access = config.value[ticket.value.type].access;
    if (!access) return false;

    const rule = access.find(r => r.name === 'edit');
    if (!rule) return false;

    return rule.groups.some(g => (user.groups || []).includes(g));
});

const canDelete = computed(() => {
    if ((user.groups || []).includes('Administration')) return true;
    
    if (!ticket.value || !config.value[ticket.value.type]) return false;
    
    const access = config.value[ticket.value.type].access;
    if (!access) return false;
    
    const rule = access.find(r => r.name === 'delete');
    if (!rule) return false;
    
    return rule.groups.some(g => (user.groups || []).includes(g));
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

const getActions = (ticket) => {
    if (!config.value || !config.value[ticket.type]) return [];
    
    const workflow = config.value[ticket.type].workflow;
    const matchingBlocks = workflow.filter(s => s.states.includes(ticket.state));
    
    if (matchingBlocks.length === 0) return [];
    
    const allActions = matchingBlocks.flatMap(block => block.actions);

    // The filter that previously hid 'bearbeiten' actions has been removed.
    // All actions are now considered for authorization based on groups.
    const authorizedActions = allActions.filter(action => {
        if (action.inline) return false;

        const allowedByCreator = action.groups.includes('@creator') && ticket.creator === user.username;
        const allowedByAssignee = action.groups.includes('@assignee') && ticket.assignee === user.username;
        const allowedByGroup = action.groups.some(g => (user.groups || []).includes(g));
        return allowedByCreator || allowedByAssignee || allowedByGroup;
    });

    return authorizedActions;
};

const handleAction = async (ticket, action) => {
    if (action.form === 'read') {
        // We are already reading, maybe just refresh?
        fetchData();
    } else if (action.form === 'edit') {
        router.push(`/tickets/${ticket.id}/edit`);
    } else if (action.form) {
        router.push(`/tickets/${ticket.id}/action/${action.name}`);
    } else {
        // Direct execution
        if (executingActionId.value) return; 
        
        const actionId = ticket._id + '-' + action.name;
        executingActionId.value = actionId;
        
        try {
             const { _id, __v, type, state, creator, created, updated, log, ...rest } = ticket;
            const payload = {
                actionName: action.name,
                formData: { 
                    title: ticket.title,
                    description: ticket.description,
                    assignee: ticket.assignee,
                    ...rest 
                }
            };

            await axios.post(`/api/tickets/${ticket._id}/action`, payload, {
                 headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            
            // Refresh data
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error('Fehler: ' + (err.response?.data?.message || err.message));
        } finally {
            executingActionId.value = null;
        }
    }
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
    margin: 1rem;
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
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.ticket-content {
    height: 100%;
    display: flex;
    flex-direction: row;
    gap: 2rem;
    align-items: stretch;
    min-height: 0;
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
.message {
    padding: 2rem;
    font-size: 1.1rem;
    text-align: center;
    color: var(--wa-color-neutral-20);
}
.loading, .error {
    text-align: center;
    padding: 3rem;
    color: var(--wa-color-neutral-40);
}
.error {
    color: var(--wa-color-danger-20);
}
.is-narrow .ticket-content, .is-mobile .ticket-content {
    flex-direction: column;
    display: flex;
    overflow-y: visible; 
}

.is-narrow .dynamic-form, .is-mobile .dynamic-form {
    flex: none;
    height: auto;
    overflow-y: visible;
    padding-right: 0;
}

.is-narrow .comments-sidebar, .is-mobile .comments-sidebar {
    flex: none;
    height: auto;
    overflow: visible;
    border-left: none;
    border-top: 1px solid var(--wa-color-neutral-70);
    padding-left: 0;
    margin-top: 2rem;
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
.is-mobile wa-card {
    border-radius: 0;
}
.is-mobile .header h2 {
    font-size: 1.2rem;
}
.is-narrow .ticket-card h3 {
    font-size: 1rem !important;
}
</style>
