<template>
  <div class="settings-view">
    <div class="header">
        <h2>Einstellungen</h2>
    </div>

    <div v-if="loadingConfig" class="loading">
        <wa-spinner></wa-spinner> Lade Konfiguration...
    </div>

    <wa-card v-else class="settings-card">
      <h2 slot="header">Einstellungen</h2>
      
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const notificationUri = ref('');
const loading = ref(false);

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
}

.settings-card {
    width: 100%;
}

.form-group {
    margin-bottom: 1.5rem;
}

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}
</style>
