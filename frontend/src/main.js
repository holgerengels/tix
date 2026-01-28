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

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';
import '@awesome.me/webawesome/dist/components/tab-panel/tab-panel.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import '@awesome.me/webawesome/dist/components/dialog/dialog.js';
import { registerIconLibrary } from '@awesome.me/webawesome/dist/components/icon/library.js';

registerIconLibrary('default', {
    resolver: name => `https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons/${name}.svg`
});

import LoginView from './views/LoginView.vue'
import ListView from './views/ListView.vue'
import NewTicketView from './views/NewTicketView.vue'

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/login', component: LoginView },
        { path: '/', component: ListView, meta: { requiresAuth: true } },
        { path: '/tickets/new', component: NewTicketView, meta: { requiresAuth: true } },
        { path: '/tickets/:id', component: ListView, meta: { requiresAuth: true } },
        { path: '/tickets/:id/view', component: () => import('./views/ViewView.vue'), meta: { requiresAuth: true } },
        { path: '/tickets/:id/edit', component: () => import('./views/EditView.vue'), meta: { requiresAuth: true } },
        { path: '/tickets/:id/action/:action', component: () => import('./views/ActionView.vue'), meta: { requiresAuth: true } }
    ]
})

router.beforeEach((to, from, next) => {
    const token = localStorage.getItem('token');
    if (to.meta.requiresAuth && !token) next('/login');
    else next();
})

const app = createApp(App);

app.config.errorHandler = (err, instance, info) => {
    console.error("Global Error:", err);
    console.error("Info:", info);
    alert(`Ein Fehler ist aufgetreten: ${err.message}`);
};

app.use(router).mount('#app');
