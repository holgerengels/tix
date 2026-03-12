<template>
  <div class="settings-view" :class="{ 'is-mobile': ui.isMobile }">
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
      <h3 class="settings-header">Benachrichtigungskanal</h3>
      <div class="form-group">
        <wa-input 
          label="Benachrichtigungskanal" 
          v-model="notificationUri"
          hint="Z.B. nctalk:h.engels oder mailto:h.engels@valckenburgschule.de"
        ></wa-input>
      </div>
      <div class="actions">
        <wa-button variant="primary" @click="save" :loading="loading">Speichern</wa-button>
      </div>
      <h3 class="settings-header">Push-Benachrichtigungen</h3>
      <div v-if="pushSupported" class="form-group" style="display:flex; align-items:center; gap: 1rem;">
          <wa-switch :checked="pushEnabled" @wa-change="togglePush">Auf diesem Gerät empfangen</wa-switch>
      </div>
      <div v-else class="form-group" style="color: var(--wa-color-danger-30)">
          Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.
      </div>

      <h3 class="settings-header" style="margin-top: 2rem;">Abonnements (Web Push & Channel)</h3>
      <SubscriptionManager />
    </wa-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();
import SubscriptionManager from '../components/SubscriptionManager.vue';

const router = useRouter();
const notificationUri = ref('');
const loading = ref(false);
const loadingConfig = ref(false);

const pushSupported = ref('serviceWorker' in navigator && 'PushManager' in window);
const pushEnabled = ref(false);

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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

onMounted(async () => {
    if (pushSupported.value) {
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            pushEnabled.value = !!subscription;
        } catch (e) {
            console.error('Error checking push subscription:', e);
        }
    }
});

const togglePush = async (e) => {
    const isEnabled = e.target.checked;
    
    if (!isEnabled) {
       // Unsubscribe
       try {
           const registration = await navigator.serviceWorker.ready;
           const subscription = await registration.pushManager.getSubscription();
           if (subscription) {
               await subscription.unsubscribe();
               // Here we should ideally delete from backend, 
               // but it will also auto-delete on 410 Gone later.
           }
           pushEnabled.value = false;
       } catch (err) {
           console.error('Error unsubscribing', err);
       }
       return;
    }

    // Subscribe
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            alert('Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.');
            pushEnabled.value = false;
            return;
        }

        const vapidResponse = await axios.get('/api/push/public-key', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const publicVapidKey = vapidResponse.data;

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        });

        await axios.post('/api/push/subscribe', subscription, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        pushEnabled.value = true;
    } catch (err) {
        console.error('Failed to subscribe:', err);
        alert('Fehler beim Aktivieren der Push-Benachrichtigungen.');
        pushEnabled.value = false;
    }
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
.settings-header {
    margin: 0;
}
.form-group {
    margin-top: 1rem;
    margin-bottom: 1rem;
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
