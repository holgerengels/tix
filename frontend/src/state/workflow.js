import { reactive, computed } from 'vue';
import axios from 'axios';

const state = reactive({
    config: null,
    loading: false,
    error: null
});

const fetchConfig = async (force = false) => {
    if (state.config && !force) return;

    state.loading = true;
    state.error = null;
    try {
        const res = await axios.get('/api/config', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        state.config = res.data;
    } catch (err) {
        console.error('Error fetching workflow config:', err);
        state.error = err;
    } finally {
        state.loading = false;
    }
};

const getConfig = () => state.config;

export const workflow = {
    state,
    fetchConfig,
    getConfig,
    config: computed(() => state.config),
    isLoading: computed(() => state.loading)
};
