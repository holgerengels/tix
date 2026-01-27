<template>
  <div class="dashboard">
    <div class="header" style="margin-bottom: 0">
        <h2>{{ pageTitle }}</h2>
    </div>

    <div class="content">
        <TicketList :filter="currentFilter" :config="config" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import TicketList from '../components/TicketList.vue';

const route = useRoute();
const config = ref({});
const user = JSON.parse(localStorage.getItem('user') || '{}');

const currentFilter = computed(() => route.query.filter || 'my');

const pageTitle = computed(() => {
    switch(currentFilter.value) {
        case 'my': return 'Meine Tickets';
        case 'assigned': return 'Mir zugewiesen';
        case 'all': return 'Alle Tickets';
        default: return 'Tickets';
    }
});

const fetchConfig = async () => {
    try {
        const res = await axios.get('/api/config', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        config.value = res.data;
    } catch (err) {
        console.error(err);
    }
};


onMounted(fetchConfig);
</script>

<style scoped>
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
}
</style>
