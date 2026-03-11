import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
    state: () => ({
        token: localStorage.getItem('token'),
        user: JSON.parse(localStorage.getItem('user') || '{}'),
        showLogin: false
    }),

    getters: {
        isAuthenticated: (state) => !!state.token
    },

    actions: {
        login(token, user) {
            this.token = token;
            this.user = user;
            this.showLogin = false;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
        },

        logout() {
            this.token = null;
            this.user = {};
            this.showLogin = true;
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        },

        triggerLogin() {
            this.showLogin = true;
        }
    }
})
