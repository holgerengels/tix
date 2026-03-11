import { defineStore } from 'pinia'
import axios from 'axios'

export const useWorkflowStore = defineStore('workflow', {
    state: () => ({
        config: null,
        loading: false,
        error: null
    }),

    getters: {
        isLoading: (state) => state.loading
    },

    actions: {
        async fetchConfig(force = false) {
            if (this.config && !force) return;

            this.loading = true;
            this.error = null;
            try {
                const res = await axios.get('/api/config', {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                });
                this.config = res.data;
            } catch (err) {
                console.error('Error fetching workflow config:', err);
                this.error = err;
            } finally {
                this.loading = false;
            }
        }
    }
})
