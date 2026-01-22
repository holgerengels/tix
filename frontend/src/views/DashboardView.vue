<template>
  <div class="dashboard">
    <sl-tab-group>
      <sl-tab slot="nav" panel="new">Neues Ticket</sl-tab>
      <sl-tab slot="nav" panel="my">Meine Tickets</sl-tab>
      <sl-tab slot="nav" panel="assigned">Mir zugewiesene</sl-tab>
      <sl-tab slot="nav" panel="all">Alle Tickets</sl-tab>

      <sl-tab-panel name="new">
        <sl-card class="new-ticket-card">
            <h3 slot="header">Neues Ticket erstellen</h3>
            
            <sl-select label="Ticket Typ" v-model="newTicketType" @sl-change="resetForm">
                <sl-option v-for="type in availableTypes" :key="type" :value="type">
                    {{ type }}
                </sl-option>
            </sl-select>

            <div v-if="newTicketType && config[newTicketType]" class="form-content">
                <sl-input label="Titel" v-model="newTicketData.titel" required></sl-input>
                <sl-textarea label="Beschreibung" v-model="newTicketData.beschreibung"></sl-textarea>
                
                <DynamicForm 
                    :fields="config[newTicketType].felder" 
                    v-model="newTicketData.dynamic" 
                />

                <br>
                <sl-button variant="primary" @click="createTicket" :loading="creating">Erstellen</sl-button>
            </div>
        </sl-card>
      </sl-tab-panel>

      <sl-tab-panel name="my">
        <TicketList filter="my" :config="config" />
      </sl-tab-panel>

      <sl-tab-panel name="assigned">
        <TicketList filter="assigned" :config="config" />
      </sl-tab-panel>

      <sl-tab-panel name="all">
        <TicketList filter="all" :config="config" />
      </sl-tab-panel>
    </sl-tab-group>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import TicketList from '../components/TicketList.vue';
import DynamicForm from '../components/DynamicForm.vue';

const config = ref({});
const newTicketType = ref('');
const newTicketData = ref({ titel: '', beschreibung: '', dynamic: {} });
const creating = ref(false);
const user = JSON.parse(localStorage.getItem('user') || '{}');

const availableTypes = computed(() => {
    // Check create permission
    return Object.keys(config.value).filter(type => {
        const wf = config.value[type];
        const rule = wf.zugriff.find(z => z.name === 'erstellen');
        return rule && rule.gruppen.some(g => user.groups.includes(g));
    });
});

const fetchConfig = async () => {
    try {
        const res = await axios.get('/api/config', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        config.value = res.data;
    } catch (err) {
        console.error(err);
    }
};

const resetForm = () => {
    newTicketData.value = { titel: '', beschreibung: '', dynamic: {} };
};

const createTicket = async () => {
    creating.value = true;
    try {
        const payload = {
            typ: newTicketType.value,
            titel: newTicketData.value.titel,
            beschreibung: newTicketData.value.beschreibung,
            ...newTicketData.value.dynamic
        };
        
        await axios.post('/api/tickets', payload, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        alert('Ticket erstellt!');
        resetForm();
        newTicketType.value = '';
    } catch (err) {
        alert('Fehler: ' + err.message);
    } finally {
        creating.value = false;
    }
};

onMounted(fetchConfig);
</script>

<style scoped>
.new-ticket-card {
    max-width: 600px;
    margin: 0 auto;
}
.form-content {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
</style>
