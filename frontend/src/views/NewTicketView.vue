<template>
  <div class="new-ticket-view">
    <div class="header" style="margin-bottom: 1rem;">
        <h2>Neues Ticket</h2>
    </div>

    <wa-card class="form-card">
      <div v-if="loadingConfig" class="loading">
        <wa-spinner></wa-spinner> Lade Konfiguration...
      </div>

      <div v-else class="form-content">
        <wa-select label="Ticket Typ" :value="newTicketType" @change="newTicketType = $event.target.value; resetForm()" placeholder="Bitte wählen">
           <wa-option v-for="type in availableTypes" :key="type" :value="type">
              {{ type }}
           </wa-option>
        </wa-select>

        <div v-if="newTicketType && config[newTicketType]" class="dynamic-section">
            <DynamicForm 
                :fields="config[newTicketType].fields" 
                v-model="newTicketData" 
            />
        </div>
        <div v-else-if="newTicketType" class="error">
            Konfiguration für diesen Typ nicht gefunden.
        </div>

        <div v-if="errors.length > 0" class="error-messages">
            <div v-for="(error, index) in errors" :key="index" class="error-item">
                {{ error }}
            </div>
        </div>
        
        <div class="actions">
             <wa-button variant="primary" @click="createTicket" :loading="creating" :disabled="!newTicketType">Ticket erstellen</wa-button>
        </div>
      </div>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import DynamicForm from '../components/DynamicForm.vue';
import RichTextEditor from '../components/RichTextEditor.vue';
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
const user = JSON.parse(localStorage.getItem('user') || '{}');

const availableTypes = computed(() => {
    return Object.keys(config.value).filter(type => {
        const wf = config.value[type];
        if (!wf.access) return true; 
        const rule = wf.access.find(z => z.name === 'create');
        return rule && rule.groups.some(g => user.groups.includes(g));
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
};

const validateForm = () => {
    errors.value = [];
    const wf = config.value[newTicketType.value];
    if (!wf || !wf.fields) return true;

    let isValid = true;
    wf.fields.forEach(field => {
        if (field.required && !newTicketData.value[field.name]) {
            errors.value.push(`Das Feld '${field.label || field.name}' ist ein Pflichtfeld.`);
            isValid = false;
        }
    });
    return isValid;
};

const createTicket = async () => {
    // Basic validation
    if (!newTicketData.value.title) {
        // title is usually part of dynamic fields now, but kept as fallback if hardcoded
        // actually for 'Aufgabe' title is not in fields in JSON, so it might be hardcoded in backend?
        // Wait, looking at routes.js: title: req.body.titel || req.body.title
        // And aufgabe.json DOES NOT have a title field in "fields". 
        // Logic check: Is title required for all tickets?
        // In routes.js: ticketData uses req.body.title. 
        // If title is missing, likely acceptable or handled elsewhere?
        // Let's rely on validateForm mostly. If title isn't in fields, we assume it's not strictly required by dynamic config, 
        // OR it should be added to fields. 
        // However, checking previous code:
        // if (!newTicketData.value.title) { alert("Bitte einen Titel eingeben."); ... }
        // If 'title' is NOT in dynamic fields, user can't enter it. 
        // Let's assume for now we only validate what is in 'fields'.
    }
    
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
        router.push('/'); 
    } catch (err) {
        alert('Fehler beim Erstellen: ' + (err.response?.data?.error || err.message));
    } finally {
        creating.value = false;
    }
};

onMounted(fetchConfig);
</script>

<style scoped>
.new-ticket-view {
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
}
.header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
}
.form-card {
    width: 100%;
}
.form-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
}
.dynamic-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
}
.actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 1rem;
}
.loading, .error {
    padding: 2rem;
    text-align: center;
    color: #666;
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
</style>
