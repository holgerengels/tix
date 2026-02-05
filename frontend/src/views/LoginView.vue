<template>
  <div class="login-container">
    <wa-card class="login-card">
      <h2 slot="header">Login</h2>
      <form @submit.prevent="handleLogin">
        <wa-input 
            label="Username" 
            v-model="username" 
            required
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
import { useRouter } from 'vue-router';
import axios from 'axios';

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const router = useRouter();

const handleLogin = async () => {
    loading.value = true;
    error.value = '';
    try {
        const res = await axios.post('/api/login', {
            username: username.value,
            password: password.value
        });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        // Force reload or push to ensure App.vue re-evaluates auth state if needed, 
        // but simple push is enough if state is reactive or checked on route change
        window.location.href = '/'; 
    } catch (err) {
        error.value = 'Ungültige Anmeldedaten';
    } finally {
        loading.value = false;
    }
};
</script>

<style scoped>
.login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
}
.login-card {
    width: 400px;
}
</style>
