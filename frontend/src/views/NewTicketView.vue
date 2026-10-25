<template>
  <div class="new-ticket-view" :class="{ 'is-mobile': ui.isMobile, 'is-narrow': ui.isNarrow }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2 style="display: flex; align-items: center; gap: 1ch;">
            {{ reopenOf ? 'Ticket wiedereröffnen' : 'Neues Ticket' }}
            <wa-tag v-if="parentTicket" variant="brand" size="small">⮤ {{ parentTicket }}</wa-tag>
            <wa-tag v-if="reopenOf" variant="neutral" size="small">↶ Fortsetzung von {{ reopenOf }}</wa-tag>
        </h2>
    </div>

    <div v-if="loadingConfig" class="loading">
        <wa-spinner></wa-spinner> Lade Konfiguration...
    </div>

    <wa-card v-else class="ticket-card" with-footer with-footer-actions>
        <div slot="header" class="card-header">Typ<wa-select :value.prop="newTicketType" :disabled="!!reopenOf" @change="newTicketType = $event.target.value; resetForm()" placeholder="Bitte wählen" style="width: 100%;">
           <wa-option v-for="type in availableTypes" :key="type" :value="type">
              {{ config[type]?.typeVerbose || type }}
           </wa-option>
        </wa-select></div>

        <div class="ticket-content">
            <DynamicForm 
                v-if="newTicketType && config[newTicketType]" 
                :key="newTicketType"
                ref="formRef"
                action="create"
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


        
        <!-- Dummy to force Web Awesome to render the card footer container -->
        <div slot="footer" style="display: none;"></div>
        <wa-button slot="footer-actions" v-if="newTicketType" size="small" variant="neutral" appearance="filled" @click="cancelCreation">Abbrechen</wa-button>
        <wa-divider slot="footer-actions" v-if="newTicketType" orientation="vertical"></wa-divider>
        <wa-button slot="footer-actions" size="small" variant="primary" @click="createTicket" :loading="creating" :disabled="!newTicketType">{{ reopenOf ? 'Wiedereröffnen' : 'Ticket erstellen' }}</wa-button>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { useUiStore } from '../stores/ui';
import { useWorkflowStore } from '../stores/workflow';
import { useTicketsStore } from '../stores/tickets';
import { toast, confirm } from '../composables/useToast';
import { hasAccess } from '../composables/useTicketAccess';

const ui = useUiStore();
const workflow = useWorkflowStore();
const ticketsStore = useTicketsStore();
import DynamicForm from '../components/DynamicForm.vue';
import RichTextEditor from '../components/RichTextEditor.vue';
import { validateTicket, evaluateTemplate } from '../utils/evaluation';
import { marked } from 'marked';

const getFieldLabel = (name) => {
    // Fallback or simple implementation if needed, but DynamicForm handles labels now
    return name;
};

const router = useRouter();
const config = computed(() => workflow.config || {});
const newTicketType = ref('');
const newTicketData = ref({});
const creating = ref(false);
const loadingConfig = ref(true);
const isDirty = ref(false);
const formRef = ref(null);
const user = JSON.parse(localStorage.getItem('user') || '{}');

const workflowDocHtml = ref('');
const loadingDoc = ref(false);

const route = useRoute();
const parentTicket = computed(() => route.query.parent);
const parentTicketData = ref(null);
const reopenOf = computed(() => route.query.reopen);

// Fields never copied into a reopened ticket (fresh state, re-triage, fresh hierarchy).
// Keep in sync with REOPEN_EXCLUDED_FIELDS in backend/src/routes.js.
const REOPEN_EXCLUDED_FIELDS = ['state', 'assignee', 'assigned', 'parentTicket'];

/**
 * Resolves dot-notation keys into nested objects.
 * e.g. setNestedValue(obj, 'termin.start', '14:00') => obj.termin.start = '14:00'
 */
const setNestedValue = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (current[keys[i]] === undefined) current[keys[i]] = {};
        current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
};

/**
 * Applies the subTickets mapping from the parent ticket's config.
 * Evaluates each mapping expression against the parent ticket data
 * and merges the results into newTicketData.
 */
const applySubticketMapping = () => {
    if (!parentTicketData.value || !newTicketType.value) return;

    const parentConfig = config.value[parentTicketData.value.type];
    if (!parentConfig || !Array.isArray(parentConfig.subTickets)) return;

    const subTicketDef = parentConfig.subTickets.find(st => st.type === newTicketType.value);
    if (!subTicketDef || !subTicketDef.mapping) return;

    const defaults = {};
    for (const [field, expression] of Object.entries(subTicketDef.mapping)) {
        const value = evaluateTemplate(expression, parentTicketData.value);
        if (value !== undefined && value !== null && value !== '') {
            setNestedValue(defaults, field, value);
        }
    }

    newTicketData.value = { ...defaults, ...newTicketData.value };
};

/**
 * Prefills the form with a copy of the closed predecessor.
 * All configured form fields are copied except REOPEN_EXCLUDED_FIELDS.
 */
const applyReopenCopy = (source) => {
    const wf = config.value[source.type];
    if (!wf) return;

    const copy = {};
    (wf.fields || []).forEach(f => {
        if (REOPEN_EXCLUDED_FIELDS.includes(f.name) || source[f.name] === undefined) return;
        copy[f.name] = JSON.parse(JSON.stringify(source[f.name]));
    });

    newTicketData.value = copy;
};

onMounted(async () => {
    if (route.query.type) {
        newTicketType.value = route.query.type;
    }

    // Load the closed predecessor for a reopen
    if (reopenOf.value) {
        try {
            await workflow.fetchConfig();
            const source = await ticketsStore.fetchTicket(reopenOf.value);
            if (source) {
                newTicketType.value = source.type;
                applyReopenCopy(source);
            } else {
                toast.error(`Ticket ${reopenOf.value} nicht gefunden.`);
            }
        } catch (err) {
            console.warn('Failed to load ticket to reopen:', err.message);
        }
    }

    // Load parent ticket data for subticket mapping
    if (parentTicket.value) {
        try {
            const parent = await ticketsStore.fetchTicket(parentTicket.value);
            if (parent) {
                parentTicketData.value = parent;
                applySubticketMapping();
            }
        } catch (err) {
            console.warn('Failed to load parent ticket for mapping:', err.message);
        }
    }
});

watch(newTicketData, () => {
    if (Object.keys(newTicketData.value).length > 0) {
        isDirty.value = true;
    }
}, { deep: true });

const availableTypes = computed(() => {
    return Object.keys(config.value).filter(type => {
        // A reopen is authorized by the reopen action, not by create access
        if (reopenOf.value && type === newTicketType.value) return true;
        return hasAccess(config.value[type], 'create', user);
    });
});

onMounted(async () => {
    try {
        await workflow.fetchConfig();
    } catch (err) {
        console.error("Config fetch error", err);
        toast.error("Fehler beim Laden der Konfiguration.");
    } finally {
        loadingConfig.value = false;
    }
});

const fetchWorkflowDoc = async (type) => {
    if (!type) {
        workflowDocHtml.value = '';
        return;
    }
    loadingDoc.value = true;
    try {
        const docMarkdown = await workflow.fetchDoc(type);
        workflowDocHtml.value = marked(docMarkdown || '');
    } catch (err) {
        console.error("Doc fetch error", err);
        workflowDocHtml.value = '<p>Dokumentation konnte nicht geladen werden.</p>';
    } finally {
        loadingDoc.value = false;
    }
};

watch(newTicketType, (newType) => {
    if (formRef.value && typeof formRef.value.clearErrors === 'function') {
        formRef.value.clearErrors();
    }
    fetchWorkflowDoc(newType);
    applySubticketMapping();
});

const resetForm = () => {
    newTicketData.value = {};
    if (formRef.value && typeof formRef.value.clearErrors === 'function') {
        formRef.value.clearErrors();
    }
    setTimeout(() => { isDirty.value = false; }, 0);
};

const cancelCreation = async () => {
    if (isDirty.value) {
        const answer = await confirm('Änderungen gehen verloren. Willst du die Seite wirklich verlassen?');
        if (!answer) return;
    }
    newTicketType.value = '';
    resetForm();
    router.replace({ path: '/tickets/new', query: {} });
};

const createTicket = async () => {
    // Validate dynamic fields
    if (formRef.value && !formRef.value.validate('create')) {
        return;
    }

    creating.value = true;
    try {
        const payload = {
            type: newTicketType.value,
            ...newTicketData.value
        };
        if (parentTicket.value) {
            payload.parentTicket = parentTicket.value;
        }
        if (reopenOf.value) {
            payload.reopenOf = reopenOf.value;
        }
        
        const created = await ticketsStore.createTicket(payload);
        // Success
        isDirty.value = false;
        if (reopenOf.value && created?.id) {
            router.replace(`/tickets/${created.id}/view`);
        } else {
            router.push('/');
        }
    } catch (err) {
        console.error(err);
    } finally {
        creating.value = false;
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

</script>

<style scoped>
.new-ticket-view {
    max-width: 1600px;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
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
    flex: 1;
    min-height: 0;
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
    border-left: 1px solid var(--wa-color-neutral-70);
    padding-left: 2rem;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}
.markdown-body :deep(h1), 
.markdown-body :deep(h2), 
.markdown-body :deep(h3) {
    margin-top: 0;
    margin-bottom: 0.5rem;
    color: var(--wa-color-neutral-15);
}
.markdown-body :deep(p), 
.markdown-body :deep(ul), 
.markdown-body :deep(ol) {
    margin-bottom: 1rem;
    line-height: 1.5;
    color: var(--wa-color-neutral-20);
}
.markdown-body :deep(li) {
    margin-bottom: 0.25rem;
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

.is-narrow .workflow-info-sidebar, .is-mobile .workflow-info-sidebar {
    flex: none;
    height: auto;
    overflow: visible;
    border-left: none;
    border-top: 1px solid var(--wa-color-neutral-70);
    padding-left: 0;
    margin-top: 2rem;
}
.is-mobile, .is-narrow {
    height: auto;
    min-height: 100%;
    overflow: visible;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 2.5rem);
}
.is-mobile .ticket-card, .is-narrow .ticket-card {
    height: auto;
    flex: none;
    margin: 0;
}
.is-mobile .ticket-card::part(body), .is-narrow .ticket-card::part(body) {
    overflow: visible;
}
.is-mobile wa-card, .is-narrow wa-card {
    border-radius: 0;
}
.is-mobile .header h2 {
    font-size: 1.2rem;
}
.is-narrow .ticket-card h3 {
    font-size: 1rem !important;
}
</style>
