<template>
  <div class="app-container" :class="{ 'with-sidebar': auth.isAuthenticated.value, 'sidebar-collapsed': !ui.state.sidebarOpen && auth.isAuthenticated.value }">
    
    <LoginOverlay v-if="auth.state.showLogin" />
    
    <div v-if="ui.state.isMobile && ui.state.sidebarOpen && auth.isAuthenticated.value" class="sidebar-backdrop" @click="ui.toggleSidebar()"></div>

    <aside v-if="auth.isAuthenticated.value" class="sidebar">
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
            <router-link v-if="auth.state.user && auth.state.user.groups && auth.state.user.groups.includes('Administration')" to="/admin" class="nav-item" :class="{ active: $route.path === '/admin' }">
                <wa-icon name="shield-lock"></wa-icon> <span class="nav-text">Administration</span>
            </router-link>

        </nav>

        <div class="footer">
             <div class="user-info" v-if="auth.state.user">
                <small class="nav-text">{{ auth.state.user.username }}</small>
                <wa-button variant="text" size="small" appearance="plain" @click="$router.push('/settings')" tooltip="Einstellungen">
                    <wa-icon name="gear" style="font-size: 1rem;"></wa-icon>
                </wa-button>
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
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import axios from 'axios';
import { auth } from './state/auth';
import { ui } from './state/ui';
import LoginOverlay from './components/LoginOverlay.vue';

const router = useRouter();
const route = useRoute();
const isDev = ref(false);

const checkDevMode = async () => {
     if (auth.isAuthenticated.value) {
        try {
            const res = await axios.get('/api/config/status');
            isDev.value = res.data.devmode;
        } catch (e) {
            console.error('Failed to check devmode:', e);
        }
    }
}

onMounted(checkDevMode);

// Re-check dev mode on login
watch(auth.isAuthenticated, (newVal) => {
    if (newVal) checkDevMode();
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
    if (ui.state.isMobile && ui.state.sidebarOpen) {
        ui.setSidebar(false);
    }
});

// Since auth state is reactive, we don't need manual reload logic for sidebar anymore!
const reloadConfig = async () => {
    try {
        await axios.post('/api/config/reload', {}, {
            headers: { Authorization: `Bearer ${auth.state.token}` }
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
    width: 200px;
    background: linear-gradient(180deg, #ffffff 0%, var(--wa-color-neutral-50) 100%);
    border-right: 1px solid var(--wa-color-neutral-200);
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
    color: var(--wa-color-primary-700);
    display: flex;
    align-items: center;
    justify-content: center;
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
}

/* Main Content */
.main-content {
    flex: 1;
    padding: 0;
    background-color: var(--wa-color-neutral-50);
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
        border-right: 1px solid var(--wa-color-neutral-200); /* Restore border */
        opacity: 1; 
        pointer-events: none;
    }

    .main-content {
        width: 100%;
        height: 100%;
        overflow-y: auto; /* Allow main content to scroll on mobile */
    }
}
</style>
