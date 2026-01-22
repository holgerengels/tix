<template>
  <div class="app-container">
    <header v-if="isLoggedIn">
      <sl-button variant="text" @click="logout">Logout</sl-button>
    </header>
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const isLoggedIn = computed(() => !!localStorage.getItem('token'));

const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
};
</script>

<style>
body {
    font-family: var(--sl-font-sans);
    background-color: var(--sl-color-neutral-50);
    margin: 0;
}
.app-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}
</style>
