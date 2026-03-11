<template>
  <div class="login-overlay">
    <wa-card class="login-card">
      <h2 slot="header">Login Required</h2>
      <form @submit.prevent="handleLogin">
        <wa-input 
            label="Username" 
            v-model="username" 
            required
            autofocus
        ></wa-input>
        <br />
        <wa-input 
            label="Password" 
            type="password" 
            v-model="password" 
            password-toggle 
            required
        ></wa-input>
        <br />
        <wa-button type="submit" variant="primary" :loading="loading">Login</wa-button>
      </form>
      <wa-callout v-if="error" variant="danger">
        <wa-icon slot="icon" name="exclamation-octagon"></wa-icon>
        {{ error }}
      </wa-callout>
    </wa-card>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { useRequestQueueStore } from '../stores/requestQueue';

const auth = useAuthStore();
const requestQueue = useRequestQueueStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const handleLogin = async () => {
    loading.value = true;
    error.value = '';
    try {
        const res = await axios.post('/api/login', {
            username: username.value,
            password: password.value
        });
        
        // Update global auth state
        auth.login(res.data.token, res.data.user);
        
        // Retry queued requests
        requestQueue.retryAll(res.data.token);
        
    } catch (err) {
        console.error(err);
        error.value = 'Ungültige Anmeldedaten';
    } finally {
        loading.value = false;
    }
};
</script>

<style scoped>
.login-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.5); /* Semi-transparent backdrop */
    backdrop-filter: blur(5px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000; /* Ensure on top */
}
.login-card {
    width: 400px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
</style>
