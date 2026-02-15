<template>
  <div class="log-view" :class="{ 'is-mobile': ui.state.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>Protokoll</h2>
    </div>

    <div class="content-container">
        <details class="filter-details">
            <summary>Filter</summary>
            <div class="filters">
                <div class="filter-group">
                    <label>Typ:</label>
                    <select v-model="filterType" @change="fetchLogs">
                        <option value="">Alle</option>
                        <option v-for="type in availableTypes" :key="type" :value="type">{{ type }}</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>User:</label>
                    <input type="text" v-model="filterEditor" @input="fetchLogsDebounced" placeholder="Name..." />
                </div>
                <div class="filter-group">
                    <select v-model="filterDateRange" @change="handleDateRangeChange">
                        <option value="">Zeitraum wählen</option>
                        <option value="week">Letzte Woche</option>
                        <option value="month">Letzter Monat</option>
                        <option value="custom">Benutzerdefiniert</option>
                    </select>
                </div>
                 <div class="filter-group" v-if="filterDateRange === 'custom'">
                    <input type="date" v-model="filterDateFrom" @change="fetchLogs" />
                    <span>-</span>
                    <input type="date" v-model="filterDateTo" @change="fetchLogs" />
                </div>
                <div class="filter-group">
                    <wa-button appearance="plain" @click="resetFilters">Reset</wa-button>
                </div>
            </div>
        </details>

        <wa-spinner v-if="loading"></wa-spinner>

        <div v-else class="table-container">
            <table class="log-table">
                <thead>
                    <tr>
                    <th>Zeitpunkt</th>
                    <th>ID</th>
                    <th>Typ</th>
                    <th>Titel</th>
                    <th>User</th>
                    <th>Aktion</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="log in logs" :key="log._id">
                    <td data-label="Zeitpkt">{{ formatDate(log.timestamp) }}</td>
                    <td data-label="ID">
                        <router-link :to="'/tickets/' + log.ticket.id + '/view'" @click.stop class="ticket-link">
                            {{ log.ticket.id }}
                        </router-link>
                    </td>
                    <td data-label="Typ">{{ log.ticket ? log.ticket.type : '-' }}</td>
                    <td data-label="Titel">{{ log.ticket ? log.ticket.title : 'Gelöschtes Ticket' }}</td>
                    <td data-label="User">{{ log.editor }}</td>
                    <td data-label="Aktion">{{ log.action }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { format, subDays, subMonths } from 'date-fns';
import { ui } from '../state/ui';

const logs = ref([]);
const loading = ref(true);
const error = ref(null);
const config = ref({});

const filterType = ref('');
const filterEditor = ref('');
const filterDateRange = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');

let debounceTimer = null;

const availableTypes = computed(() => {
    return config.value ? Object.keys(config.value) : [];
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

const fetchLogs = async () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    
    loading.value = true;
    error.value = null;
    
    try {
        const params = {
            type: filterType.value,
            editor: filterEditor.value,
            dateFrom: filterDateFrom.value,
            dateTo: filterDateTo.value
        };

        const res = await axios.get('/api/logs', {
            params,
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        logs.value = res.data;
    } catch (err) {
        console.error(err);
        error.value = "Fehler beim Laden der Protokolle.";
    } finally {
        loading.value = false;
    }
};

const fetchLogsDebounced = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchLogs, 300);
};

const handleDateRangeChange = () => {
    const now = new Date();
    if (filterDateRange.value === 'week') {
        filterDateFrom.value = format(subDays(now, 7), 'yyyy-MM-dd');
        filterDateTo.value = format(now, 'yyyy-MM-dd');
    } else if (filterDateRange.value === 'month') {
        filterDateFrom.value = format(subMonths(now, 1), 'yyyy-MM-dd');
        filterDateTo.value = format(now, 'yyyy-MM-dd');
    } else if (filterDateRange.value === '') {
        filterDateFrom.value = '';
        filterDateTo.value = '';
    }
    fetchLogs();
};

const resetFilters = () => {
    filterType.value = '';
    filterEditor.value = '';
    filterDateRange.value = '';
    filterDateFrom.value = '';
    filterDateTo.value = '';
    fetchLogs();
};

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

onMounted(async () => {
    await fetchConfig();
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
    margin: 1rem;
    flex-shrink: 0;
}
.header h2 {
    margin: 0;
}
.content-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: calc(100% - 82px);
    margin: 0 1rem 1rem 1rem;
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
    position: sticky;
    top: 0;
    z-index: 10;
}
.log-table tr {
    transition: background-color 0.2s;
}
.log-table tr:hover {
    background-color: var(--wa-color-primary-50);
}
.log-table tr:last-child td {
    border-bottom: none;
}
.ticket-link {
    text-decoration: none;
    font-weight: 600;
    white-space: nowrap;
    color: var(--wa-color-primary-600);
    cursor: pointer;
}
.ticket-link:hover {
    text-decoration: underline;
}
.text-muted {
    color: var(--wa-color-neutral-500);
    font-style: italic;
}

.filter-details {
    background: white;
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    border: 1px solid var(--wa-color-neutral-200);
    flex-shrink: 0;
}

.filter-details summary {
    padding: 1rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--wa-color-neutral-700);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.filter-details summary::-webkit-details-marker {
  display: none;
}

.filter-details summary::after {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-right: 2px solid var(--wa-color-neutral-500);
    border-bottom: 2px solid var(--wa-color-neutral-500);
    transform: rotate(45deg);
    margin-left: auto;
    transition: transform 0.2s;
}

.filter-details[open] summary::after {
    transform: rotate(225deg);
}

.filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5rem;
    padding: 0 1.5rem 1.5rem 1.5rem;
    background: transparent;
    border-radius: 0;
    box-shadow: none;
    border: none;
    margin-bottom: 0;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.filter-group label {
    font-weight: 500;
    color: var(--wa-color-neutral-700);
    font-size: 0.9rem;
}

.filter-group select,
.filter-group input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--wa-color-neutral-300);
    border-radius: 6px;
    font-size: 0.9rem;
    min-width: 140px;
    transition: all 0.2s;
    background-color: var(--wa-color-neutral-50);
}

.filter-group select:focus,
.filter-group input:focus {
    outline: none;
    border-color: var(--wa-color-primary-500);
    box-shadow: 0 0 0 2px var(--wa-color-primary-100);
    background-color: white;
}
/* Mobile Styles using .is-mobile class */
.is-mobile .header {
    margin: 1rem;
}

.is-mobile .log-table {
    display: block;
    background: transparent;
    box-shadow: none;
    border: none;
}

.is-mobile .log-table thead {
    display: none;
}

.is-mobile .log-table tbody {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.is-mobile .log-table tr {
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid var(--wa-color-neutral-200);
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    padding: 1rem;
    gap: 0.5rem;
}

.is-mobile .log-table td {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: flex-start;
    justify-items: start;
    padding: 0.25rem 0;
    border: none;
    text-align: left;
}

.is-mobile .log-table td::before {
    content: attr(data-label); 
    font-weight: 600;
    color: var(--wa-color-neutral-600);
    margin-right: 1rem;
    flex-shrink: 0;
    font-size: 0.85rem;
    margin-top: 0.1rem;
}

.is-mobile .log-table tr:hover {
    background-color: white;
}
</style>
