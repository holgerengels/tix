<template>
  <div class="action-view">
    <div class="header">
        <wa-button variant="neutral" appearance="outlined" size="small" @click="goBack">
            <wa-icon slot="start" name="arrow-left"></wa-icon> zurück
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
        <h3 slot="header">{{ ticket.id }} {{ ticket.title }}</h3>
        
        <div class="ticket-body">
            <DynamicForm 
               v-if="currentFormDef && currentFormDef.fields && currentFormDef.fields.length > 0" 
               :fields="currentFormDef.fields" 
               v-model="actionFormData" 
            />
            <div v-else class="message">
                Sicher, dass die Aktion <strong>{{ actionDef.name }}</strong> ausgeführt werden soll?
            </div>

            <aside class="comments-sidebar" v-if="canComment">
                <TicketComments :ticket="ticket" />
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
import DynamicForm from '../components/DynamicForm.vue';
import TicketComments from '../components/TicketComments.vue';

const route = useRoute();
const router = useRouter();
const ticket = ref(null);
const config = ref({});
const actionDef = ref(null);
const currentFormDef = ref(null);
const loading = ref(true);
const executing = ref(false);
const error = ref(null);
const isDirty = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');

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
            actions: specificFormDef ? specificFormDef.actions : []
        };
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
    
    return rule.groups.some(g => user.groups.includes(g));
});

const execute = async (btnName = null) => {
    executing.value = true;
    try {
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

onMounted(fetchData);
</script>

<style scoped>
.action-view {
    max-width: 1200px;
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
