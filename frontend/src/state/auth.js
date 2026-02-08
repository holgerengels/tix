import { reactive, computed } from 'vue';

const state = reactive({
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || '{}'),
    showLogin: false
});

const isAuthenticated = computed(() => !!state.token);

const login = (token, user) => {
    state.token = token;
    state.user = user;
    // showLogin is managed by the caller usually, but we can reset it here too
    state.showLogin = false;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
};

const logout = () => {
    state.token = null;
    state.user = {};
    state.showLogin = true; // Show login immediately on logout
    localStorage.removeItem('token');
    localStorage.removeItem('user');
};

const triggerLogin = () => {
    state.showLogin = true;
};

export const auth = {
    state,
    isAuthenticated,
    login,
    logout,
    triggerLogin
};
