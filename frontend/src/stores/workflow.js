import { defineStore } from 'pinia'
import axios from 'axios'

// Module-level promise for deduplication (not reactive, not in state)
let _configPromise = null;

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
            if (this.config && !force) return this.config;
            if (_configPromise && !force) return _configPromise;

            this.loading = true;
            this.error = null;

            _configPromise = axios.get('/api/config', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            }).then(res => {
                this.config = res.data;
                return this.config;
            }).catch(err => {
                console.error('Error fetching workflow config:', err);
                this.error = err;
                _configPromise = null; // Allow retry on next call
                throw err;
            }).finally(() => {
                this.loading = false;
            });

            return _configPromise;
        },

        reset() {
            this.config = null;
            this.loading = false;
            this.error = null;
            _configPromise = null;
        }
    }
})
