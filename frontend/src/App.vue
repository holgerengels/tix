<template>
  <div class="app-container" :class="{ 'with-sidebar': auth.isAuthenticated, 'sidebar-collapsed': !ui.sidebarOpen && auth.isAuthenticated }">
    
    <div v-if="needRefresh" class="pwa-update-prompt">
        <span>Eine neue Version von TIX ist verfügbar.</span>
        <wa-button size="small" variant="primary" @click="handleSWUpdate">Jetzt aktualisieren</wa-button>
    </div>

    <LoginOverlay v-if="auth.showLogin" />
    
    <div v-if="ui.isMobile && ui.sidebarOpen && auth.isAuthenticated" class="sidebar-backdrop" @click="ui.toggleSidebar()"></div>

    <aside v-if="auth.isAuthenticated" class="sidebar">
        <div class="logo"><img src="/vu.svg" alt="TIX" height="44"/>&nbsp;TIX</div>
        
        <nav>
            <router-link to="/?filter=my" class="nav-item" :class="{ active: $route.query.filter === 'my' || (!$route.query.filter && $route.path === '/') }">
                <wa-icon name="person"></wa-icon> <span class="nav-text">Meine Tickets</span>
            </router-link>
            <router-link to="/?filter=assigned" class="nav-item" :class="{ active: $route.query.filter === 'assigned' }">
                <wa-icon name="list-task"></wa-icon> <span class="nav-text">Mir zugewiesen</span>
            </router-link>
            <router-link to="/?filter=all" class="nav-item" :class="{ active: $route.query.filter === 'all' }">
                <wa-icon name="collection"></wa-icon> <span class="nav-text">Alle Tickets</span>
            </router-link>
            <router-link to="/tickets/new" class="nav-item" :class="{ active: $route.path && $route.path.includes('/new') }">
                <wa-icon name="plus-circle"></wa-icon> <span class="nav-text">Neues Ticket</span>
            </router-link>
            <router-link to="/logs" class="nav-item" :class="{ active: $route.path === '/logs' }">
                <wa-icon name="journal-text"></wa-icon> <span class="nav-text">Protokoll</span>
            </router-link>
            <router-link v-if="auth.user && auth.user.groups && auth.user.groups.includes('Administration')" to="/admin" class="nav-item" :class="{ active: $route.path === '/admin' }">
                <wa-icon name="shield-lock"></wa-icon> <span class="nav-text">Administration</span>
            </router-link>
            <router-link to="/settings" class="nav-item" :class="{ active: $route.path === '/settings' }">
                <wa-icon name="gear"></wa-icon> <span class="nav-text">Einstellungen</span>
            </router-link>

        </nav>

        <div class="footer">
             <div class="user-info" v-if="auth.user">
                <span class="nav-text">{{ usersStore.getDisplayName(auth.user.username) }}</span>
             </div>
             <wa-button variant="text" @click="auth.logout()" size="small" appearance="plain">
                <wa-icon slot="prefix" name="box-arrow-right"></wa-icon> <span class="nav-text">Logout</span>
             </wa-button>
             
             <wa-button v-if="isDev" variant="text" @click="reloadConfig" size="small" appearance="plain" title="Reload Config form Disk">
                <wa-icon slot="prefix" name="arrow-clockwise"></wa-icon> <span class="nav-text">Reload</span>
             </wa-button>
        </div>
    </aside>

    <main class="main-content" ref="mainContent">
      <router-view :key="auth.user?.username || ''" />
    </main>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from './stores/auth';
import { useUiStore } from './stores/ui';
import { useUsersStore } from './stores/users';
import LoginOverlay from './components/LoginOverlay.vue';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import { toast } from './composables/useToast';

const auth = useAuthStore();
const ui = useUiStore();
const usersStore = useUsersStore();

// PWA Update Logic — check for new SW when tab becomes visible
const {
  needRefresh,
  updateServiceWorker,
} = useRegisterSW({
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update();
      });
    }
  }
});

const handleSWUpdate = () => {
    updateServiceWorker(true);
};

const router = useRouter();
const route = useRoute();
const isDev = ref(false);

const checkDevMode = async () => {
     if (auth.isAuthenticated) {
        try {
            const res = await axios.get('/api/config/status');
            isDev.value = res.data.devmode;
        } catch (e) {
            console.error('Failed to check devmode:', e);
        }
    }
}

onMounted(checkDevMode);

// Re-check dev mode on login, navigate home on logout
watch(() => auth.isAuthenticated, (newVal, oldVal) => {
    if (newVal) {
        checkDevMode();
    } else if (oldVal) {
        // User logged out — leave detail views and go to list
        router.push('/');
    }
});

const handleResize = (e) => {
    const mobile = e.matches;
    ui.setIsMobile(mobile);
    if (mobile) {
        ui.setSidebar(false);
    } else {
        ui.setSidebar(true);
    }
};

const mainContent = ref(null);
let resizeObserver = null;

onMounted(() => {
    const mediaQuery = window.matchMedia('(max-width: 1000px)');
    // Initial check
    const mobile = mediaQuery.matches;
    ui.setIsMobile(mobile);
    
    // Initial state check - if mobile, ensure closed. If desktop, ensure open (or whatever was last state? Maybe user wants persistent state)
    // Requirement says: "standardmäßig zugeklappt" (default collapsed) < 1000px.
    if (mobile) {
         ui.setSidebar(false);
    }

    mediaQuery.addEventListener('change', handleResize);
    
    // Setup ResizeObserver for main content width
    resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            if (entry.contentRect) {
                const width = entry.contentRect.width;
                ui.setIsNarrow(width < 720);
            }
        }
    });
    
    if (mainContent.value) {
        resizeObserver.observe(mainContent.value);
    }
    
    onUnmounted(() => {
        mediaQuery.removeEventListener('change', handleResize);
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
    });
});

watch(route, () => {
    if (ui.isMobile && ui.sidebarOpen) {
        ui.setSidebar(false);
    }
});

// Since auth state is reactive, we don't need manual reload logic for sidebar anymore!
const reloadConfig = async () => {
    try {
        await axios.post('/api/config/reload', {}, {
            headers: { Authorization: `Bearer ${auth.token}` }
        });
        window.location.reload();
    } catch (err) {
        toast.error('Reload failed: ' + err.message);
    }
};

</script>

<style>
body {
    font-family: var(--wa-font-sans);
    background-color: var(--wa-color-neutral-90);
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
    width: 200px;
    background-color: white;
    border-right: 1px solid var(--wa-color-neutral-80);
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    flex-shrink: 0;
    box-shadow: 1px 0 10px rgba(0,0,0,0.02);
    transition: all 0.3s ease;
    overflow: hidden;
    white-space: nowrap;
}

.logo {
    font-size: 32px;
    line-height: 34px;
    font-weight: 800;
    margin-bottom: 2rem;
    color: var(--wa-color-brand-20);
    display: flex;
    align-items: center;
    justify-content: center;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    color: var(--wa-color-neutral-30);
    text-decoration: none;
    border-radius: var(--wa-border-radius-medium);
    margin-bottom: 0.375rem;
    transition: all 0.2s ease;
    font-weight: 500;
}

.nav-item:hover {
    background: var(--wa-color-brand-90);
    color: var(--wa-color-brand-20);
    transform: translateX(2px);
}

.nav-item.active {
    background: var(--wa-color-brand-80);
    color: var(--wa-color-brand-15);
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
    color: var(--wa-color-neutral-40);
    font-size: 0.875rem;
    padding-left: 0.5rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
}

/* Main Content */
.main-content {
    flex: 1;
    padding: 0;
    background-color: var(--wa-color-neutral-95);
    overflow: hidden; /* Ensure content doesn't spill over when sidebar is toggled */
    container-type: inline-size;
    container-name: main;
}


/* Sidebar Collapsed State */
.app-container.sidebar-collapsed .sidebar {
    width: 0;
    padding-left: 0;
    padding-right: 0;
    opacity: 0;
    border-right: none;
    pointer-events: none; /* Prevent clicks when hidden */
}

.sidebar-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
    backdrop-filter: blur(2px);
}

@media (max-width: 1000px) {
    .app-container {
        position: relative;
    }

    .sidebar {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 200px;
        z-index: 1000;
        box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        transform: translateX(0);
        transition: transform 0.3s ease;
    }
    
    .app-container.sidebar-collapsed .sidebar {
        transform: translateX(-100%);
        width: 200px; 
        padding-left: 1.5rem; /* Restore padding because default collapsed removes it */
        padding-right: 1.5rem;
        border-right: 1px solid var(--wa-color-neutral-70); /* Restore border */
        opacity: 1; 
        pointer-events: none;
    }

    .main-content {
        width: 100%;
        height: 100%;
        overflow-y: auto; /* Allow main content to scroll on mobile */
    }
}

.pwa-update-prompt {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    padding: 1rem;
    border-radius: var(--wa-border-radius-medium);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--wa-color-brand-70);
}
</style>
