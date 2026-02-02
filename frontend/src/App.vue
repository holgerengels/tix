<template>
  <div class="app-container" :class="{ 'with-sidebar': isLoggedIn }">
    
    <aside v-if="isLoggedIn" class="sidebar">
        <div class="logo">Ticket System</div>
        
        <nav>
            <router-link to="/?filter=my" class="nav-item" :class="{ active: $route.query.filter === 'my' || (!$route.query.filter && $route.path === '/') }">
                <wa-icon name="person"></wa-icon> Meine Tickets
            </router-link>
            <router-link to="/?filter=assigned" class="nav-item" :class="{ active: $route.query.filter === 'assigned' }">
                <wa-icon name="list-task"></wa-icon> Mir zugewiesen
            </router-link>
            <router-link to="/?filter=all" class="nav-item" :class="{ active: $route.query.filter === 'all' }">
                <wa-icon name="collection"></wa-icon> Alle Tickets
            </router-link>
             <router-link to="/tickets/new" class="nav-item" :class="{ active: $route.path.includes('/new') }">
                <wa-icon name="plus-circle"></wa-icon> Neues Ticket
            </router-link>
            <router-link to="/logs" class="nav-item" :class="{ active: $route.path === '/logs' }">
                <wa-icon name="journal-text"></wa-icon> Protokoll
            </router-link>
        </nav>

        <div class="footer">
             <div class="user-info" v-if="user">
                <small>{{ user.username }}</small>
             </div>
             <wa-button variant="text" @click="logout" size="small" appearance="plain">
                <wa-icon slot="prefix" name="box-arrow-right"></wa-icon> Logout
             </wa-button>
             
             <wa-button v-if="isDev" variant="text" @click="reloadConfig" size="small" appearance="plain" title="Reload Config form Disk">
                <wa-icon slot="prefix" name="arrow-clockwise"></wa-icon> Reload
             </wa-button>
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
    font-family: var(--wa-font-sans);
    background-color: var(--wa-color-neutral-50);
    margin: 0;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
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
    width: 210px;
    background: linear-gradient(180deg, #ffffff 0%, var(--wa-color-neutral-50) 100%);
    border-right: 1px solid var(--wa-color-neutral-200);
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    flex-shrink: 0;
    box-shadow: 1px 0 10px rgba(0,0,0,0.02);
}

.logo {
    font-size: 1.5rem;
    font-weight: 800;
    margin-bottom: 2.5rem;
    color: var(--wa-color-primary-700);
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--wa-color-primary-600), var(--wa-color-primary-800));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    color: var(--wa-color-neutral-600);
    text-decoration: none;
    border-radius: var(--wa-border-radius-medium);
    margin-bottom: 0.375rem;
    transition: all 0.2s ease;
    font-weight: 500;
}

.nav-item:hover {
    background: var(--wa-color-primary-50);
    color: var(--wa-color-primary-700);
    transform: translateX(2px);
}

.nav-item.active {
    background: var(--wa-color-primary-100);
    color: var(--wa-color-primary-800);
    font-weight: 600;
}

.nav-item wa-icon {
    font-size: 1.25rem;
    opacity: 0.8;
}
.nav-item.active wa-icon {
    opacity: 1;
}

.footer {
    margin-top: auto;
    padding-top: 1.5rem;
    text-align: center;
}

.user-info {
    margin-bottom: 1rem;
    color: var(--wa-color-neutral-500);
    font-size: 0.875rem;
    padding-left: 0.5rem;
    font-weight: 500;
}

/* Main Content */
.main-content {
    flex: 1;
    padding: 1rem;
    background-color: var(--wa-color-neutral-50);
}
</style>
