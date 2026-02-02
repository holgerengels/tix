<template>
  <div class="log-view">
    <div class="header">
        <h2>System Logs</h2>
    </div>

    <div class="log-list-container">
        <wa-spinner v-if="loading"></wa-spinner>
        
        <div v-else-if="logs.length === 0" class="empty-state">Keine Logs gefunden.</div>

        <div v-else class="table-container">
            <table class="log-table">
            <thead>
                <tr>
                <th>Zeitpunkt</th>
                <th>User</th>
                <th>Ticket</th>
                <th>Aktion</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="log in logs" :key="log._id">
                <td>{{ formatDate(log.timestamp) }}</td>
                <td>{{ log.editor }}</td>
                <td>
                    <router-link v-if="log.ticket" :to="'/tickets/' + log.ticket.id + '/view'" style="text-decoration: none;" @click.stop>
                        <span class="ticket-link">{{ log.ticket.id }}: {{ log.ticket.title }}</span>
                    </router-link>
                    <span v-else class="text-muted">Gelöschtes Ticket</span>
                </td>
                <td>{{ log.action }}</td>
                </tr>
            </tbody>
            </table>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { format } from 'date-fns';

const logs = ref([]);
const loading = ref(false);

const fetchLogs = async () => {
    loading.value = true;
    try {
        const res = await axios.get('/api/logs', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        logs.value = res.data;
    } catch (err) {
        console.error(err);
    } finally {
        loading.value = false;
    }
};

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm:ss');

onMounted(() => {
    fetchLogs();
});
</script>

<style scoped>
.log-view {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.header {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-shrink: 0;
    margin-bottom: 1rem;
}
.header h2 {
    margin: 0;
}
.log-list-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100% - 70px);
}

.table-container {
    width: 100%;
    height: 100%;
    overflow: auto;
}

.log-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: white;
    box-shadow: var(--wa-shadow-small);
    border-radius: var(--wa-border-radius-large);
    border: 1px solid var(--wa-color-neutral-200);
}

.log-table th, .log-table td {
    padding: 0.5rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--wa-color-neutral-100);
    vertical-align: middle;
}

.log-table th {
    background-color: var(--wa-color-neutral-50);
    font-weight: 600;
    color: var(--wa-color-neutral-600);
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    position: sticky;
    top: 0;
    z-index: 10;
}

.log-table tr:hover {
    background-color: var(--wa-color-primary-50);
}

.log-table tr:last-child td {
    border-bottom: none;
}

.empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--wa-color-neutral-500);
    background: white;
    border-radius: var(--wa-border-radius-large);
    border: 1px dashed var(--wa-color-neutral-300);
}

.ticket-link {
    font-weight: 500;
    color: var(--wa-color-primary-700);
    cursor: pointer;
}
.ticket-link:hover {
    text-decoration: underline;
}
.text-muted {
    color: var(--wa-color-neutral-500);
    font-style: italic;
}
</style>
