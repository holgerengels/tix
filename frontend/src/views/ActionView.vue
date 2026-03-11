<template>
  <div class="action-view" :class="{ 'is-mobile': ui.isMobile, 'is-narrow': ui.isNarrow }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon name="arrow-left"></wa-icon>
        </wa-button>
        <h2>{{ actionTitle }}</h2>
    </div>

    <div v-if="loading" class="loading">
        <wa-spinner></wa-spinner> Lade Ticket...
    </div>

    <div v-else-if="error" class="error">
        {{ error }}
    </div>

    <wa-card v-else-if="ticket && actionDef" class="ticket-card" with-header with-footer>
        <h3 slot="header">
            <wa-tag :variant="getStatusColor(ticket)" size="small" style="margin-right: 1ch; vertical-align: middle;">
                {{ getStatusLabel(ticket) }}
            </wa-tag>
            {{ ticket.id }} {{ ticket.title }}
        </h3>
        
        <div slot="header">
            <strong>{{ ticket.creator }}</strong> {{ formatDate(ticket.created) }}
        </div>
        

        <div class="ticket-content">
            <DynamicForm 
               v-if="currentFormDef && currentFormDef.fields && currentFormDef.fields.length > 0" 
               ref="formRef"
               :fields="currentFormDef.fields" 
               :grid="currentFormDef.grid"
               :workflow="config[ticket.type]"
               v-model="actionFormData" 
            />
            <div v-else-if="autoExecuting" class="loading">
                <wa-spinner></wa-spinner> Führe Aktion aus...
            </div>
            <div v-else class="message">
                Sicher, dass die Aktion <strong>{{ actionDef.name }}</strong> ausgeführt werden soll?
            </div>

            <aside class="comments-sidebar" v-if="canComment">
                <TicketComments ref="commentsRef" :ticket="ticket" />
            </aside>
        </div>


            <wa-button slot="footer-actions" @click="goBack" appearance="plain">Abbrechen</wa-button>
            
            <template v-if="currentFormDef && currentFormDef.actions">
                 <wa-button slot="footer-actions"
                    v-for="btn in currentFormDef.actions" 
                    :key="btn.name" 
                    variant="primary"
                    type="button"
                    :loading="executing"
                    @click="execute(btn.name)"
                 >
                    {{ btn.name }}
                 </wa-button>
            </template>
            <wa-button v-else slot="footer-actions" variant="primary" type="button" :loading="executing" @click="execute(null)">Ausführen</wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import { format } from 'date-fns';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
import DynamicForm from '../components/DynamicForm.vue';
import TicketComments from '../components/TicketComments.vue';
import { validateTicket } from '../utils/evaluation';

const route = useRoute();
const router = useRouter();
const ticket = ref(null);
const config = ref({});
const actionDef = ref(null);
const currentFormDef = ref(null);
const loading = ref(true);
const executing = ref(false);
const autoExecuting = ref(false);
const error = ref(null);
const isDirty = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');
const commentsRef = ref(null);
const formRef = ref(null);

const actionFormData = ref({});

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
            prepareAction();
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

const prepareAction = () => {
    if (!ticket.value || !config.value[ticket.value.type]) return;
    
    const actionName = route.params.action;
    const wf = config.value[ticket.value.type];
    
    // Find action definition
    // Note: Actions are nested in workflow states.
    // We need to find the action definition that matches the name AND is valid for current state.
    // But route only gives us name. Ideally we search in current state's actions.
    
    const matchingBlocks = wf.workflow.filter(s => s.states.includes(ticket.value.state));
    const allActions = matchingBlocks.flatMap(block => block.actions);
    
    // Also include global edit if applicable (though EditView handles standard edit, 
    // sometimes actions might be named differently or standard edit is disabled/enabled)
    // The requirement says "action-dialog ... replaced by three views", meaning standard Edit logic likely goes to EditView.
    // But if there's an action named 'Review' it goes here.
    
    actionDef.value = allActions.find(a => a.name === actionName);
    
    if (!actionDef.value) {
        error.value = `Aktion '${actionName}' nicht verfügbar für aktuellen Status.`;
        return;
    }

    // Initialize Data
    // Exclude system fields to avoid overwriting them (especially state!)
    const { _id, __v, type, state, creator, created, updated, log, ...rest } = ticket.value;
    
    actionFormData.value = { 
        title: ticket.value.title,
        description: ticket.value.description,
        assignee: ticket.value.assignee,
        ...rest 
    };

    // Prepare Form Definition
    currentFormDef.value = null;
    
    if (actionDef.value.form) {
        // Explicit Forms defined in config
        const specificFormDef = wf.forms?.find(f => f.name === actionDef.value.form);
        
        // Base fields from ticket definition - Deep copy
        let fields = wf.fields ? JSON.parse(JSON.stringify(wf.fields)) : [];
        
        if (specificFormDef && specificFormDef.fields) {
            specificFormDef.fields.forEach(sf => {
                const existingIndex = fields.findIndex(f => f.name === sf.name);
                if (existingIndex !== -1) {
                    fields[existingIndex] = { ...fields[existingIndex], ...sf };
                } else {
                    fields.push(sf);
                }
            });
        }

        currentFormDef.value = {
            ...specificFormDef,
            fields: fields,
            grid: (specificFormDef && specificFormDef.grid) ? specificFormDef.grid : wf.grid,
            actions: specificFormDef ? specificFormDef.actions : []
        };
    } else {
        // No Form -> Auto Execute
        autoExecuting.value = true;
        execute(null);
        return;
    }

     // Watch for changes after initial load
    setTimeout(() => {
        watch(actionFormData, () => {
            isDirty.value = true;
        }, { deep: true });
    }, 500);
};

const actionTitle = computed(() => {
    return (ticket.value?.type || '') + ' ' + (actionDef.value?.name || 'Aktion');
});

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

const execute = async (btnName = null) => {
    // Check form validation if action has fields
    if (currentFormDef.value && currentFormDef.value.fields && currentFormDef.value.fields.length > 0) {
        if (formRef.value && !formRef.value.validate()) {
            return;
        }
    }
    
    executing.value = true;
    error.value = null;
    try {
        if (commentsRef.value && commentsRef.value.hasPendingComment()) {
            await commentsRef.value.sendComment(true);
        }

        const payload = {
            actionName: actionDef.value.name,
            formData: actionFormData.value
        };
        if (btnName) payload.formButtonName = btnName;

        await axios.post(`/api/tickets/${ticket.value._id}/action`, payload, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        isDirty.value = false;
        isDirty.value = false;
        if (window.history.length > 1) {
             router.back();
        } else {
             router.push('/');
        } 
    } catch (err) {
        alert('Fehler: ' + (err.response?.data?.message || err.message));
    } finally {
        executing.value = false;
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
.action-view {
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

/* Narrow/Mobile state */
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
    border-top: 1px solid var(--wa-color-neutral-200);
    padding-left: 0;
    margin-top: 2rem;
}

/* Specific mobile overrides */
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
.is-mobile .header h2 {
    font-size: 1.2rem;
}
.is-narrow .ticket-card h3 {
    font-size: 1rem !important;
}
</style>
