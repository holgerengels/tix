import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createRouter, createWebHistory } from 'vue-router'
import '@awesome.me/webawesome/dist/styles/themes/default.css';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/checkbox/checkbox.js';
import '@awesome.me/webawesome/dist/components/slider/slider.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';
import '@awesome.me/webawesome/dist/components/tab-panel/tab-panel.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js';

registerIconLibrary('default', {
    resolver: name => `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/${name}.svg`
});

import ListView from './views/ListView.vue'
import NewTicketView from './views/NewTicketView.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', component: ListView, meta: { requiresAuth: true } },
        { path: '/tickets/new', component: NewTicketView, meta: { requiresAuth: true } },
        { path: '/tickets/:id', component: ListView, meta: { requiresAuth: true } },
        { path: '/tickets/:id/view', component: () => import('./views/ViewView.vue'), meta: { requiresAuth: true } },
        { path: '/tickets/:id/edit', component: () => import('./views/EditView.vue'), meta: { requiresAuth: true } },
        { path: '/tickets/:id/action/:action', component: () => import('./views/ActionView.vue'), meta: { requiresAuth: true } },
        { path: '/logs', component: () => import('./views/LogView.vue'), meta: { requiresAuth: true } },
        { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { requiresAuth: true } }
    ]
})

import axios from 'axios';
import { auth } from './state/auth';
import { requestQueue } from './state/requestQueue';

// Request interceptor to add token
axios.interceptors.request.use(config => {
    const token = auth.state.token;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor to handle 401
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 401 && !error.config.url.endsWith('/login')) {
            // Trigger Login Overlay
            auth.triggerLogin();

            // Create a promise that resolves when the request is retried
            return new Promise((resolve, reject) => {
                requestQueue.add((token) => {
                    const originalRequest = error.config;
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    axios(originalRequest).then(resolve).catch(reject);
                });
            });
        }
        return Promise.reject(error);
    }
);

router.beforeEach((to, from, next) => {
    // Check auth using our state
    if (to.meta.requiresAuth && !auth.isAuthenticated.value) {
        // Trigger login overlay
        auth.triggerLogin();
        // Allow navigation anyway! The component will mount, try to fetch data,
        // fail with 401, scan trigger queue, and wait.
        // This preserves the URL and allows "Deep Link" behavior seamlessly.
        next();
    } else {
        next();
    }
})

const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
    console.error("Global Error:", err);
    console.error("Info:", info);
    // Alert is too intrusive for 401s handled by interceptor
    if (err.response && err.response.status === 401) return;
    alert(`Ein Fehler ist aufgetreten: ${err.message}`);
};

app.use(router).mount('#app');
