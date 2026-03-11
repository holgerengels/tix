import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
    state: () => ({
        sidebarOpen: JSON.parse(localStorage.getItem('sidebarOpen') !== null ? localStorage.getItem('sidebarOpen') : 'true'),
        isMobile: false,
        isNarrow: false
    }),

    getters: {
        isSidebarOpen: (state) => state.sidebarOpen
    },

    actions: {
        toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
            localStorage.setItem('sidebarOpen', this.sidebarOpen);
        },

        setSidebar(isOpen) {
            this.sidebarOpen = isOpen;
            localStorage.setItem('sidebarOpen', isOpen);
        },

        setIsMobile(isMobile) {
            this.isMobile = isMobile;
        },

        setIsNarrow(isNarrow) {
            this.isNarrow = isNarrow;
        }
    }
})
