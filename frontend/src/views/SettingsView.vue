<template>
  <div class="settings-view" :class="{ 'is-mobile': ui.state.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>Einstellungen</h2>
    </div>

    <div v-if="loadingConfig" class="loading">
        <wa-spinner></wa-spinner> Lade Konfiguration...
    </div>

    <wa-card v-else class="settings-card">
      <h2 slot="header">Benachrichtigungskanal</h2>
      
      <div class="form-group">
        <wa-input 
          label="Benachrichtigungskanal" 
          v-model="notificationUri"
          hint="Z.B. nctalk:h.engels oder mailto:h.engels@valckenburgschule.de"
        ></wa-input>
      </div>

      <div slot="footer" class="actions">
        <wa-button variant="default" @click="cancel">Abbrechen</wa-button>
        <wa-button variant="primary" @click="save" :loading="loading">Speichern</wa-button>
      </div>
    </wa-card>

    <wa-card class="settings-card" v-if="!loadingConfig">
      <h2>Abonnements</h2>
      <SubscriptionManager />
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { ui } from '../state/ui';
import SubscriptionManager from '../components/SubscriptionManager.vue';

const router = useRouter();
const notificationUri = ref('');
const loading = ref(false);
const loadingConfig = ref(false);

onMounted(async () => {
    try {
        const res = await axios.get('/api/settings', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.data.notificationUri) {
            notificationUri.value = res.data.notificationUri;
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
});

const save = async () => {
    loading.value = true;
    try {
        await axios.post('/api/settings', {
            notificationUri: notificationUri.value
        }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        // Success feedback?
        alert('Einstellungen gespeichert');
        router.back();
    } catch (err) {
        console.error('Failed to save settings:', err);
        alert('Fehler beim Speichern: ' + (err.response?.data?.error || err.message));
    } finally {
        loading.value = false;
    }
};

const cancel = () => {
    router.back();
};
</script>

<style scoped>
.settings-view {
    max-width: 1000px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}
.header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1rem;
    flex-shrink: 0;
}
.header h2 {
    margin: 0;
}
.settings-card {
    width: auto;
    margin: 0 1rem 1rem 1rem;
}

.form-group {
    margin-bottom: 1.5rem;
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}

/* Mobile Styles */
.is-mobile .settings-card {
    margin: 0;
}
.is-mobile .header {
    margin: 1rem;
}
</style>
