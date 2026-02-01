<template>
  <div class="ticket-log">
    <h3>Verlauf</h3>
    <div v-if="loading" class="loading">Lade Verlauf...</div>
    <div v-else-if="logs.length === 0" class="empty">Kein Verlauf verfügbar.</div>
    <div v-else class="log-list">
      <div v-for="log in logs" :key="log._id" class="log-entry">
        <div class="log-header">
            <span class="editor">{{ log.editor }}</span>
            <span class="action">{{ log.action }}</span>
            <span class="date">{{ formatDate(log.timestamp) }}</span>
        </div>
        <!-- Potential for diff view here in future -->
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import axios from 'axios';
import { format } from 'date-fns';

const props = defineProps({
  ticketId: { type: String, required: true }
});

const logs = ref([]);
const loading = ref(false);

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm:ss');

const fetchLogs = async () => {
    if (!props.ticketId) return;
    loading.value = true;
    try {
        const res = await axios.get(`/api/tickets/${props.ticketId}/logs`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        logs.value = res.data;
    } catch (err) {
        console.error('Failed to load logs', err);
    } finally {
        loading.value = false;
    }
};

watch(() => props.ticketId, fetchLogs);

onMounted(fetchLogs);
</script>

<style scoped>
.ticket-log {
    margin-top: 2rem;
    border-top: 1px solid var(--wa-color-neutral-200);
    padding-top: 1rem;
}
.log-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.log-entry {
    padding: 0.5rem;
    border-bottom: 1px solid var(--wa-color-neutral-100);
    font-size: 0.9rem;
}
.log-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    color: var(--wa-color-neutral-700);
}
.editor {
    font-weight: 600;
}
.action {
    color: var(--wa-color-primary-700);
}
.date {
    margin-left: auto;
    color: var(--wa-color-neutral-500);
    font-size: 0.8rem;
}
.loading, .empty {
    color: var(--wa-color-neutral-500);
    font-style: italic;
    padding: 1rem 0;
}
</style>
