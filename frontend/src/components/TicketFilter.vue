<template>
  <details class="filter-details">
    <summary>Filter</summary>
    <div class="filters">
        <div class="filter-group">
            <label>Typ:</label>
            <div style="min-width: 200px;">
                <wa-select multiple clearable v-model="type" @change="handleTypeChange">
                    <wa-option v-for="t in availableTypes" :key="t" :value="t">{{ t }}</wa-option>
                </wa-select>
            </div>
        </div>
        <div class="filter-group">
            <label>Status:</label>
            <select v-model="status" @change="emit('apply')">
                <option value=""></option>
                <option v-for="s in availableStatuses" :key="s" :value="s">{{ stateTranslations[s] || s }}</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Ersteller:</label>
            <input type="text" v-model="creator" @input="emit('apply-debounced')" placeholder="Name..." />
        </div>
        <div class="filter-group">
            <select v-model="dateRange" @change="handleDateRangeChange">
                <option value="">Zeitraum wählen</option>
                <option value="week">Letzte Woche</option>
                <option value="month">Letzter Monat</option>
                <option value="custom">Benutzerdefiniert</option>
            </select>
        </div>
        <div class="filter-group">
            <label>Label:</label>
            <div style="min-width: 200px;">
                <wa-select multiple clearable v-model="badges" @change="emit('apply')">
                    <wa-option v-for="badge in availableBadges" :key="badge" :value="badge">
                        <wa-badge :variant="getBadgeVariant(badge)" size="small" appearance="filled-outlined" pill>{{ badge }}</wa-badge>
                    </wa-option>
                </wa-select>
            </div>
        </div>
        <div class="filter-group" v-if="dateRange === 'custom'">
            <input type="date" v-model="dateFrom" @change="emit('apply')" />
            <span>-</span>
            <input type="date" v-model="dateTo" @change="emit('apply')" />
        </div>
        <div class="filter-group">
            <wa-button appearance="plain" @click="resetInternalFilters">Reset</wa-button>
            <slot name="actions"></slot>
        </div>
    </div>
    
    <slot name="footer"></slot>
  </details>
</template>

<script setup>
import { computed } from 'vue';
import { workflow } from '../state/workflow';
import { format, subDays, subMonths } from 'date-fns';

const type = defineModel('type', { type: Array, default: () => [] });
const status = defineModel('status', { type: String, default: '' });
const creator = defineModel('creator', { type: String, default: '' });
const dateRange = defineModel('dateRange', { type: String, default: '' });
const dateFrom = defineModel('dateFrom', { type: String, default: '' });
const dateTo = defineModel('dateTo', { type: String, default: '' });
const badges = defineModel('badges', { type: Array, default: () => [] });

const emit = defineEmits(['apply', 'apply-debounced', 'reset']);

const config = workflow.config;

const availableTypes = computed(() => {
    return config.value ? Object.keys(config.value) : [];
});

const stateTranslations = computed(() => {
    const translations = {
      'offen.*': 'offen',
      'geschlossen.*': 'geschlossen'
    };
    if (config.value) {
        Object.values(config.value).forEach(wf => {
            if (wf.states) {
                wf.states.forEach(s => {
                    translations[s.name] = s.label || s.name;
                });
            }
        });
    }
    return translations;
});

const availableStatuses = computed(() => {
    if (!type.value || type.value.length === 0) {
        return ['offen.*', 'geschlossen.*'];
    }
    const types = Array.isArray(type.value) ? type.value : [type.value];
    const states = new Set();
    types.forEach(t => {
        if (config.value && config.value[t] && config.value[t].states) {
            config.value[t].states.forEach(s => states.add(s.name));
        }
    });
    if (states.size === 0) return ['offen.*', 'geschlossen.*'];
    return Array.from(states);
});

const availableBadges = [
  'dringend', 'wichtig', 'eskaliert', 
  'langfristig', 'unwichtig', 
  'obsolet', 'wartet'
];

const getBadgeVariant = (badge) => {
    switch (badge) {
        case 'dringend':
        case 'wichtig':
        case 'eskaliert':
            return 'danger';
        case 'langfristig':
        case 'unwichtig':
            return 'brand';
        case 'obsolet':
        case 'wartet':
            return 'success';
        default:
            return 'neutral';
    }
};

const handleTypeChange = () => {
    status.value = '';
    emit('apply');
};

const handleDateRangeChange = () => {
    const now = new Date();
    if (dateRange.value === 'week') {
        dateFrom.value = format(subDays(now, 7), 'yyyy-MM-dd');
        dateTo.value = format(now, 'yyyy-MM-dd');
    } else if (dateRange.value === 'month') {
        dateFrom.value = format(subMonths(now, 1), 'yyyy-MM-dd');
        dateTo.value = format(now, 'yyyy-MM-dd');
    } else if (dateRange.value === '') {
        dateFrom.value = '';
        dateTo.value = '';
    }
    emit('apply');
};

const resetInternalFilters = () => {
    type.value = [];
    status.value = '';
    creator.value = '';
    dateRange.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    badges.value = [];
    emit('reset');
};
</script>

<style scoped>
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
.filter-group wa-select::part(tag) {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 9999px;
    border: 1px solid var(--wa-color-neutral-300);
}
</style>
