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
                :fields="config[newTicketType].fields" 
                :grid="config[newTicketType].grid"
                v-model="newTicketData" 
            />
            <div v-else-if="newTicketType" class="error">
                Konfiguration für diesen Typ nicht gefunden.
            </div>
        </div>

        <div v-if="errors.length > 0" class="error-messages">
            <div v-for="(error, index) in errors" :key="index" class="error-item">
                {{ error }}
            </div>
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
const errors = ref([]);
const isDirty = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');

watch(newTicketData, () => {
    if (Object.keys(newTicketData.value).length > 0) {
        isDirty.value = true;
    }
    // Re-validate dynamically if we already have errors showing to clear them immediately when fixed
    if (errors.value.length > 0) {
        validateForm();
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

const resetForm = () => {
    newTicketData.value = {};
    errors.value = [];
    setTimeout(() => { isDirty.value = false; }, 0);
};

const validateForm = () => {
    errors.value = [];
    const wf = config.value[newTicketType.value];
    if (!wf || !wf.fields) return true;

    const validation = validateTicket(newTicketData.value, wf);
    if (!validation.isValid) {
        errors.value = validation.errors;
    }
    return validation.isValid;
};

const createTicket = async () => {
    // Validate dynamic fields
    if (!validateForm()) {
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
    max-width: 1000px;
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
.loading, .error {
    text-align: center;
}
.error-messages {
    background-color: #fee;
    border: 1px solid #faa;
    color: #c00;
    padding: 1rem;
    border-radius: 4px;
}
.error-item {
    margin-bottom: 0.5rem;
}
.error-item:last-child {
    margin-bottom: 0;
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
</style>
