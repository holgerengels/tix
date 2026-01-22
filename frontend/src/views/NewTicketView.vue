<template>
  <div class="new-ticket-view">
    <div class="header" style="margin-bottom: 1.5rem;">
        <h1>Neues Ticket</h1>
    </div>

    <sl-card class="form-card">
      <div v-if="loadingConfig" class="loading">
        <sl-spinner></sl-spinner> Lade Konfiguration...
      </div>

      <div v-else class="form-content">
        <sl-select label="Ticket Typ" :value="newTicketType" @sl-change="newTicketType = $event.target.value; resetForm()" placeholder="Bitte wählen">
           <sl-option v-for="type in availableTypes" :key="type" :value="type">
              {{ type }}
           </sl-option>
        </sl-select>

        <sl-input label="Titel" :value="newTicketData.title" @sl-input="newTicketData.title = $event.target.value" required></sl-input>
        <sl-textarea label="Beschreibung" :value="newTicketData.description" @sl-input="newTicketData.description = $event.target.value" resize="auto"></sl-textarea>

        <div v-if="newTicketType && config[newTicketType]" class="dynamic-section">
            <DynamicForm 
                :fields="config[newTicketType].fields" 
                v-model="newTicketData.dynamic" 
            />
        </div>
        <div v-else-if="newTicketType" class="error">
            Konfiguration für diesen Typ nicht gefunden.
        </div>
        
        <div class="actions">
             <sl-button variant="primary" @click="createTicket" :loading="creating" :disabled="!newTicketType">Ticket erstellen</sl-button>
        </div>
      </div>
    </sl-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import DynamicForm from '../components/DynamicForm.vue';

const router = useRouter();
const config = ref({});
const newTicketType = ref('');
const newTicketData = ref({ title: '', description: '', dynamic: {} });
const creating = ref(false);
const loadingConfig = ref(true);
const user = JSON.parse(localStorage.getItem('user') || '{}');

const availableTypes = computed(() => {
    return Object.keys(config.value).filter(type => {
        const wf = config.value[type];
        // If no 'erstellen' rule exists, assume allowed, or check specific logic
        if (!wf.access) return true; 
        const rule = wf.access.find(z => z.name === 'erstellen');
        // If no explicit create rule, maybe allow? relying on backend to reject.
        // But for UI, let's show if rule exists and matches, or if no rule exists (default allow?)
        // Based on DashboardView logic:
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
    newTicketData.value = { title: '', description: '', dynamic: {} };
};

const createTicket = async () => {
    if (!newTicketData.value.title) {
        alert("Bitte einen Titel eingeben.");
        return;
    }

    creating.value = true;
    try {
        const payload = {
            type: newTicketType.value,
            title: newTicketData.value.title,
            description: newTicketData.value.description,
            ...newTicketData.value.dynamic
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
</style>
