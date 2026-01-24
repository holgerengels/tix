<template>
  <div class="app-container" :class="{ 'with-sidebar': isLoggedIn }">
    
    <aside v-if="isLoggedIn" class="sidebar">
        <div class="logo">Ticket System</div>
        
        <nav>
            <router-link to="/?filter=my" class="nav-item" :class="{ active: $route.query.filter === 'my' || (!$route.query.filter && $route.path === '/') }">
                <sl-icon name="person"></sl-icon> Meine Tickets
            </router-link>
            <router-link to="/?filter=assigned" class="nav-item" :class="{ active: $route.query.filter === 'assigned' }">
                <sl-icon name="list-task"></sl-icon> Mir zugewiesen
            </router-link>
            <router-link to="/?filter=all" class="nav-item" :class="{ active: $route.query.filter === 'all' }">
                <sl-icon name="collection"></sl-icon> Alle Tickets
            </router-link>
             <router-link to="/tickets/new" class="nav-item" :class="{ active: $route.path.includes('/new') }">
                <sl-icon name="plus-circle"></sl-icon> Neues Ticket
            </router-link>
        </nav>

        <div class="footer">
             <div class="user-info" v-if="user">
                <small>{{ user.username }}</small>
             </div>
             <sl-button variant="text" @click="logout" size="small">
                <sl-icon slot="prefix" name="box-arrow-right"></sl-icon> Logout
             </sl-button>
             
             <sl-button v-if="isDev" variant="text" @click="reloadConfig" size="small" title="Reload Config form Disk">
                <sl-icon slot="prefix" name="arrow-clockwise"></sl-icon> Reload
             </sl-button>
        </div>
    </aside>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const route = useRoute();
const isLoggedIn = computed(() => !!localStorage.getItem('token'));
const user = computed(() => JSON.parse(localStorage.getItem('user') || '{}'));

const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Force reload to clear state effectively or push login
    window.location.href = '/login';
};

const isDev = import.meta.env.DEV;

const reloadConfig = async () => {
    try {
        await axios.post('/api/config/reload', {}, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        window.location.reload();
    } catch (err) {
        alert('Reload failed: ' + err.message);
    }
};
</script>

<style>
body {
    font-family: var(--sl-font-sans);
    background-color: var(--sl-color-neutral-50);
    margin: 0;
    height: 100vh;
}
#app {
    height: 100%;
    width: 100%;
}
.app-container {
    height: 100%;   
    width: 100%;
    display: flex;
    flex-direction: column;
}
.app-container.with-sidebar {
    flex-direction: row;
}

/* Sidebar Styles */
.sidebar {
    width: 250px;
    background: white;
    border-right: 1px solid var(--sl-color-neutral-200);
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    flex-shrink: 0;
}

.logo {
    font-size: 1.25rem;
    font-weight: bold;
    margin-bottom: 2rem;
    color: var(--sl-color-primary-600);
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    color: var(--sl-color-neutral-700);
    text-decoration: none;
    border-radius: var(--sl-border-radius-medium);
    margin-bottom: 0.25rem;
    transition: background 0.2s;
}

.nav-item:hover {
    background: var(--sl-color-neutral-100);
    color: var(--sl-color-primary-600);
}

.nav-item.active {
    background: var(--sl-color-primary-50);
    color: var(--sl-color-primary-700);
    font-weight: 500;
}

.nav-item sl-icon {
    font-size: 1.1rem;
}

.footer {
    margin-top: auto;
    border-top: 1px solid var(--sl-color-neutral-200);
    padding-top: 1rem;
}
.footer sl-button {
    margin-left: 1rem;
}
.user-info {
    margin-bottom: 0.5rem;
    color: var(--sl-color-neutral-500);
}

/* Main Content */
.main-content {
    flex: 2;
    padding: 2rem;
    overflow-y: auto;
}
sl-dialog {
    --width: 60%;
    --max-width: 800px;
}
</style>
