<template>
  <div class="new-ticket-view" :class="{ 'is-mobile': ui.state.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>Neues Ticket</h2>
    </div>

    <div v-if="loadingConfig" class="loading">
        <wa-spinner></wa-spinner> Lade Konfiguration...
    </div>

    <wa-card v-else class="ticket-card" with-footer>
        <div slot="header" class="card-header">Typ<wa-select :value="newTicketType" @change="newTicketType = $event.target.value; resetForm()" placeholder="Bitte wählen" style="width: 100%;">
           <wa-option v-for="type in availableTypes" :key="type" :value="type">
              {{ type }}
           </wa-option>
        </wa-select></div>

        <div class="ticket-content">
            <DynamicForm
                v-if="newTicketType && config[newTicketType]" 
                ref="formRef"
                :fields="config[newTicketType].fields" 
                :grid="config[newTicketType].grid"
                :workflow="config[newTicketType]"
                v-model="newTicketData" 
            />
            <div v-else-if="newTicketType" class="error">
                Konfiguration für diesen Typ nicht gefunden.
            </div>

            <aside class="workflow-info-sidebar" v-if="newTicketType">
                <div v-if="loadingDoc" class="loading">
                    <wa-spinner></wa-spinner> Lade Infos...
                </div>
                <div v-else class="markdown-body" v-html="workflowDocHtml"></div>
            </aside>
        </div>


        
        <wa-button slot="footer-actions" variant="primary" @click="createTicket" :loading="creating" :disabled="!newTicketType">Ticket erstellen</wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import axios from 'axios';
import { ui } from '../state/ui';
import DynamicForm from '../components/DynamicForm.vue';
import RichTextEditor from '../components/RichTextEditor.vue';
import { validateTicket } from '../utils/evaluation';
import { marked } from 'marked';

const getFieldLabel = (name) => {
    // Fallback or simple implementation if needed, but DynamicForm handles labels now
    return name;
};

const router = useRouter();
const config = ref({});
const newTicketType = ref('');
const newTicketData = ref({});
const creating = ref(false);
const loadingConfig = ref(true);
const isDirty = ref(false);
const formRef = ref(null);
const user = JSON.parse(localStorage.getItem('user') || '{}');

const workflowDocHtml = ref('');
const loadingDoc = ref(false);

watch(newTicketData, () => {
    if (Object.keys(newTicketData.value).length > 0) {
        isDirty.value = true;
    }
}, { deep: true });

const availableTypes = computed(() => {
    return Object.keys(config.value).filter(type => {
        const wf = config.value[type];
        if (!wf.access) return true; 
        const rule = wf.access.find(z => z.name === 'create');
        return rule && rule.groups.some(g => (user.groups || []).includes(g));
    });
});

const fetchConfig = async () => {
    try {
        const res = await axios.get('/api/config', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        config.value = res.data;
    } catch (err) {
        console.error("Config fetch error", err);
        alert("Fehler beim Laden der Konfiguration.");
    } finally {
        loadingConfig.value = false;
    }
};

const fetchWorkflowDoc = async (type) => {
    if (!type) {
        workflowDocHtml.value = '';
        return;
    }
    loadingDoc.value = true;
    try {
        const res = await axios.get(`/api/config/${type}/doc`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        workflowDocHtml.value = marked(res.data);
    } catch (err) {
        console.error("Doc fetch error", err);
        workflowDocHtml.value = '<p>Dokumentation konnte nicht geladen werden.</p>';
    } finally {
        loadingDoc.value = false;
    }
};

watch(newTicketType, (newType) => {
    fetchWorkflowDoc(newType);
});

const resetForm = () => {
    newTicketData.value = {};
    setTimeout(() => { isDirty.value = false; }, 0);
};

const createTicket = async () => {
    // Validate dynamic fields
    if (formRef.value && !formRef.value.validate()) {
        return;
    }

    creating.value = true;
    try {
        const payload = {
            type: newTicketType.value,
            ...newTicketData.value
        };
        
        await axios.post('/api/tickets', payload, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        // Success
        isDirty.value = false;
        router.push('/');  
    } catch (err) {
        alert('Fehler beim Erstellen: ' + (err.response?.data?.error || err.message));
    } finally {
        creating.value = false;
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

onMounted(fetchConfig);
</script>

<style scoped>
.new-ticket-view {
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
.card-header {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1rem;
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
.workflow-info-sidebar {
    height: 100%;
    flex: 1;
    min-width: 300px;
    border-left: 1px solid var(--wa-color-neutral-200);
    padding-left: 2rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.markdown-body :deep(h1), 
.markdown-body :deep(h2), 
.markdown-body :deep(h3) {
    margin-top: 0;
    margin-bottom: 0.5rem;
    color: var(--wa-color-neutral-800);
}
.markdown-body :deep(p), 
.markdown-body :deep(ul), 
.markdown-body :deep(ol) {
    margin-bottom: 1rem;
    line-height: 1.5;
    color: var(--wa-color-neutral-700);
}
.markdown-body :deep(li) {
    margin-bottom: 0.25rem;
}
.loading, .error {
    text-align: center;
    padding: 3rem;
    color: var(--wa-color-neutral-500);
}
.error {
    color: var(--wa-color-danger-700);
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

.is-narrow .workflow-info-sidebar, .is-mobile .workflow-info-sidebar {
    flex: none;
    height: auto;
    overflow: visible;
    border-left: none;
    border-top: 1px solid var(--wa-color-neutral-200);
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
