import { reactive, computed } from 'vue';

const state = reactive({
    sidebarOpen: JSON.parse(localStorage.getItem('sidebarOpen') !== null ? localStorage.getItem('sidebarOpen') : 'true')
});

const toggleSidebar = () => {
    state.sidebarOpen = !state.sidebarOpen;
    localStorage.setItem('sidebarOpen', state.sidebarOpen);
};

const setSidebar = (isOpen) => {
    state.sidebarOpen = isOpen;
    localStorage.setItem('sidebarOpen', isOpen);
};

export const ui = {
    state,
    toggleSidebar,
    setSidebar,
    isSidebarOpen: computed(() => state.sidebarOpen)
};
