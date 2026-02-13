import { reactive, computed } from 'vue';

const state = reactive({
    sidebarOpen: JSON.parse(localStorage.getItem('sidebarOpen') !== null ? localStorage.getItem('sidebarOpen') : 'true'),
    isMobile: false,
    isNarrow: false
});

const toggleSidebar = () => {
    state.sidebarOpen = !state.sidebarOpen;
    localStorage.setItem('sidebarOpen', state.sidebarOpen);
};

const setSidebar = (isOpen) => {
    state.sidebarOpen = isOpen;
    localStorage.setItem('sidebarOpen', isOpen);
};

const setIsMobile = (isMobile) => {
    state.isMobile = isMobile;
};

const setIsNarrow = (isNarrow) => {
    state.isNarrow = isNarrow;
};

export const ui = {
    state,
    toggleSidebar,
    setSidebar,
    setIsMobile,
    setIsNarrow,
    isSidebarOpen: computed(() => state.sidebarOpen)
};
