import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'

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
        { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { requiresAuth: true } },
        { path: '/admin', component: () => import('./views/AdminView.vue'), meta: { requiresAuth: true } },
        { path: '/substitutes', component: () => import('./views/SubstitutesView.vue'), meta: { requiresAuth: true } }
    ]
})

router.beforeEach((to, from, next) => {
    const auth = useAuthStore();
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        auth.triggerLogin();
        next();
    } else {
        next();
    }
})

export default router
