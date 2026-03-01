<template>
  <div class="subscription-manager">
    <!-- List of active subscriptions -->
    <div class="subscriptions-list" v-if="subscriptions.length > 0">
      <wa-card v-for="sub in subscriptions" :key="sub._id" class="subscription-item">
        <div class="sub-header">
          <strong>{{ sub.name }}</strong>
          <wa-button appearance="plain" size="small" variant="danger" @click="deleteSubscription(sub._id)" title="Löschen">
            <wa-icon name="x-lg"></wa-icon>
          </wa-button>
        </div>
        <div class="sub-details">
          <small>
            <span v-if="sub.filter.type">Typ: {{ Array.isArray(sub.filter.type) ? sub.filter.type.join(', ') : sub.filter.type }}; </span>
            <span v-if="sub.filter.states && sub.filter.states.length > 0">Status: {{ sub.filter.states.map(s => stateTranslations[s] || s).join(', ') }}; </span>
            <span v-if="sub.filter.assignmentType">Zuweisung: {{ sub.filter.assignmentType === 'personal' ? 'Nur persönlich zugewiesen' : 'Persönlich oder Gruppe' }}; </span>
          </small>
        </div>
      </wa-card>
    </div>
    <div v-else class="empty-state">
      <wa-icon name="info-circle"></wa-icon> Du hast noch keine Abonnements eingerichtet.
    </div>

    <wa-divider></wa-divider>

    <!-- Add new subscription form -->
    <div class="add-subscription">
      <h4>Neues Abo erstellen</h4>
      <div class="form-grid">
        <wa-input label="Name des Abos" v-model="newSub.name" placeholder="z.B. Wichtige IT-Tickets"></wa-input>
        
        <wa-select label="Ticket Typ" v-model="newSub.filter.type" clearable multiple>
          <wa-option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</wa-option>
        </wa-select>

        <wa-select label="Status" v-model="newSub.filter.states" multiple clearable>
          <wa-option v-for="status in availableStatuses" :key="status" :value="status">{{ stateTranslations[status] || status }}</wa-option>
        </wa-select>

        <wa-select label="Zuweisung" v-model="newSub.filter.assignmentType" clearable>
          <wa-option value="personal">Nur persönlich zugewiesen</wa-option>
          <wa-option value="group">Persönlich oder meiner Gruppe zugewiesen</wa-option>
        </wa-select>
      </div>
      
      <div class="actions">
        <wa-button variant="primary" @click="createSubscription" :disabled="!newSub.name || loading">
          Abo speichern
        </wa-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import axios from 'axios';
import { workflow } from '../state/workflow';

const subscriptions = ref([]);
const loading = ref(false);

const config = workflow.config;

const stateTranslations = computed(() => {
    const translations = {
      'offen': 'Alle Offenen',
      'geschlossen': 'Alle Geschlossenen'
    };
    
    if (config.value) {
        Object.values(config.value).forEach(wf => {
            if (wf.states) {
                wf.states.forEach(s => {
                    translations[s.name] = s.label || s.name;
                });
            }
        });
    }
    return translations;
});

const newSub = ref({
  name: '',
  filter: {
    type: [],
    states: [],
    assignmentType: ''
  }
});

// Fetch available types from workflow config
const availableTypes = computed(() => {
    return config.value ? Object.keys(config.value) : [];
});

const availableStatuses = computed(() => {
    if (!newSub.value.filter.type || newSub.value.filter.type.length === 0) {
        return ['offen', 'geschlossen'];
    }
    
    const types = Array.isArray(newSub.value.filter.type) ? newSub.value.filter.type : [newSub.value.filter.type];
    const states = new Set();
    
    types.forEach(t => {
        if (config.value && config.value[t] && config.value[t].states) {
            config.value[t].states.forEach(s => states.add(s.name));
        }
    });
    
    if (states.size === 0) return ['offen', 'geschlossen'];
    return Array.from(states);
});

watch(() => newSub.value.filter.type, () => {
    // When the type changes, clear out any statuses that are no longer valid for the selected type
    // If we transition to empty types, we only allow 'offen' and 'geschlossen'
    if (!newSub.value.filter.states) return;
    
    const validStatuses = availableStatuses.value;
    newSub.value.filter.states = newSub.value.filter.states.filter(s => validStatuses.includes(s));
});

onMounted(async () => {
    await workflow.fetchConfig();
    await fetchSubscriptions();
});

const fetchSubscriptions = async () => {
    try {
        const res = await axios.get('/api/settings/subscriptions', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        subscriptions.value = res.data;
    } catch (err) {
        console.error('Failed to load subscriptions', err);
    }
};

const createSubscription = async () => {
    if (!newSub.value.name) return;
    loading.value = true;
    try {
        await axios.post('/api/settings/subscriptions', newSub.value, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        // Reset form
        newSub.value = { name: '', filter: { type: [], states: [], assignmentType: '' } };
        await fetchSubscriptions();
        
        // Show success
        alert('Abonnement erfolgreich angelegt!');
    } catch (err) {
        console.error('Error creating sub:', err);
        alert('Fehler beim Anlegen');
    } finally {
        loading.value = false;
    }
};

const deleteSubscription = async (id) => {
    if (!confirm('Abonnement wirklich löschen?')) return;
    try {
        await axios.delete(`/api/settings/subscriptions/${id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        await fetchSubscriptions();
    } catch (err) {
        console.error('Error deleting sub:', err);
        alert('Fehler beim Löschen');
    }
};
</script>

<style scoped>
.subscription-manager {
  margin-top: 2rem;
}

.description {
  color: var(--wa-color-neutral-600);
  margin-bottom: 1.5rem;
}

.subscriptions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

.subscription-item .sub-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--wa-color-neutral-500);
  background: var(--wa-color-neutral-50);
  border-radius: var(--wa-border-radius-medium);
  margin-bottom: 2rem;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
