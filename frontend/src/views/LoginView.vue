<template>
  <div class="login-container">
    <sl-card class="login-card">
      <h2 slot="header">Login</h2>
      <form @submit.prevent="handleLogin">
        <sl-input 
            label="Username" 
            v-model="username" 
            required
        ></sl-input>
        <br />
        <sl-input 
            label="Password" 
            type="password" 
            v-model="password" 
            password-toggle 
            required
        ></sl-input>
        <br />
        <sl-button type="submit" variant="primary" :loading="loading">Login</sl-button>
      </form>
      <sl-alert v-if="error" variant="danger" open>
        <sl-icon slot="icon" name="exclamation-octagon"></sl-icon>
        {{ error }}
      </sl-alert>
    </sl-card>
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
        error.value = 'Invalid credentials';
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
