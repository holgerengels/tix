<template>
  <details class="filter-details">
    <summary>Ansicht <div class="saved-filters" v-if="savedFilters.length > 0">
        <wa-tag 
            v-for="(filter, index) in savedFilters" 
            :key="index" 
            with-remove 
            @wa-remove="deleteSavedFilter(index)"
            @click.prevent.stop="applySavedFilter(filter)"
            class="saved-filter-tag"
            variant="brand"
        >
            {{ filter.name }}
        </wa-tag>
    </div>
</summary>
    <div class="view-config-container">
        <!-- Filter Section -->
        <div class="filters">
            <div class="filter-group">
                <label>Typ:</label>
                <div style="min-width: 200px;">
                    <wa-select multiple clearable :value.prop="type" @change="type = $event.target.value; handleTypeChange()">
                        <wa-option v-for="t in availableTypes" :key="t" :value="t">{{ t }}</wa-option>
                    </wa-select>
                </div>
            </div>
            <div class="filter-group">
                <label>Status:</label>
                <wa-select clearable :value.prop="status" @change="status = $event.target.value; applyAll()" placeholder="Status" size="small">
                    <wa-option value=""></wa-option>
                    <wa-option v-for="s in availableStatuses" :key="s" :value="s">{{ stateTranslations[s] || s }}</wa-option>
                </wa-select>
            </div>
            <div class="filter-group" v-if="$route.query.filter === 'assigned' || $route.query.filter === 'all'">
                <label>Zuweisung:</label>
                <wa-select clearable :value.prop="assignmentType" @change="assignmentType = $event.target.value; applyAll()" size="small" placeholder="Alle">
                    <wa-option value="personal">Nur persönlich</wa-option>
                    <wa-option value="group">Persönlich oder Gruppe</wa-option>
                </wa-select>
            </div>
            <div class="filter-group">
                <label>Ersteller:</label>
                <wa-input type="text" v-model="creator" @input="applyAllDebounced" placeholder="Name..." size="small" clearable></wa-input>
            </div>
            <div class="filter-group">
                <label>Zuständig:</label>
                <wa-input type="text" v-model="assignee" @input="applyAllDebounced" placeholder="Name..." size="small" clearable></wa-input>
            </div>
            <div class="filter-group">
                <wa-select :value.prop="dateRange" @change="dateRange = $event.target.value; handleDateRangeChange()" placeholder="Zeitraum" size="small" clearable>
                    <wa-option value="">Zeitraum wählen</wa-option>
                    <wa-option value="week">Letzte Woche</wa-option>
                    <wa-option value="month">Letzter Monat</wa-option>
                    <wa-option value="custom">Benutzerdefiniert</wa-option>
                </wa-select>
            </div>
            <div class="filter-group">
                <label>Label:</label>
                <div style="min-width: 200px;">
                    <wa-select multiple clearable :value.prop="badges" @change="badges = $event.target.value; applyAll()">
                        <wa-option v-for="badge in availableBadges" :key="badge" :value="badge">
                            <wa-badge :variant="getBadgeVariant(badge)" size="small" appearance="filled-outlined" pill>{{ badge }}</wa-badge>
                        </wa-option>
                    </wa-select>
                </div>
            </div>
            <div class="filter-group" v-if="dateRange === 'custom'">
                <wa-input type="date" :value.prop="dateFrom" @change="dateFrom = $event.target.value; applyAll()" size="small"></wa-input>
                <span>–</span>
                <wa-input type="date" :value.prop="dateTo" @change="dateTo = $event.target.value; applyAll()" size="small"></wa-input>
            </div>
        </div>

        <!-- Columns Section -->
        <div class="columns-dnd-container">
            <div class="dnd-column">
                <div class="dnd-header">Verfügbare Spalten</div>
                <draggable v-model="availableColumns" group="cols" item-key="id" class="dnd-list">
                    <template #item="{ element }">
                        <div class="dnd-item available-item">
                            <wa-icon name="grip-vertical" class="drag-handle"></wa-icon>
                            {{ element.label }}
                        </div>
                    </template>
                </draggable>
            </div>
            <div class="dnd-column">
                <div class="dnd-header">Angezeigte Spalten</div>
                <draggable v-model="visibleColumns" group="cols" item-key="id" class="dnd-list" @change="applyAll()">
                    <template #item="{ element }">
                        <div class="dnd-item">
                            <wa-icon name="grip-vertical" class="drag-handle"></wa-icon>
                            <span class="col-label">{{ element.label }}</span>
                            <span class="sort-toggles" v-if="element.sortable">
                                <button class="sort-btn" :class="{ active: sort === element.id || sort === '-' + element.id }" @click="toggleSort(element.id)">
                                    {{ getSortIcon(element.id) }}
                                </button>
                            </span>
                        </div>
                    </template>
                </draggable>
            </div>
        </div>

        <!-- Action Buttons -->
        <div class="filter-actions">
            <wa-button appearance="plain" @click="resetInternalFilters">Zurücksetzen</wa-button>
            <wa-button appearance="plain" @click="saveCurrentFilter">Speichern</wa-button>
            <slot name="actions"></slot>
        </div>
    </div>
  </details>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useWorkflowStore } from '../stores/workflow';
import { format, subDays, subMonths } from 'date-fns';
import { prompt, confirm } from '../composables/useToast';
import draggable from 'vuedraggable';

const workflow = useWorkflowStore();
const route = useRoute();
const router = useRouter();

const emit = defineEmits(['fetch', 'update']);

const allColumns = [
    { id: 'id', label: 'ID', sortable: true },
    { id: 'type', label: 'Typ', sortable: true },
    { id: 'title', label: 'Titel', sortable: true },
    { id: 'state', label: 'Status', sortable: true },
    { id: 'creator', label: 'Ersteller', sortable: true },
    { id: 'created', label: 'Erstellt am', sortable: true },
    { id: 'assignee', label: 'Zuständig', sortable: true },
    { id: 'data', label: 'Daten', sortable: true },
    { id: 'actions', label: 'Aktionen', sortable: false }
];

const type = ref([]);
const status = ref('');
const creator = ref('');
const assignee = ref('');
const assignmentType = ref('');
const dateRange = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const badges = ref([]);

const visibleColumns = ref([...allColumns]);
const availableColumns = ref([]);
const sort = ref('');

const savedFilters = ref([]);

const config = computed(() => workflow.config);
const currentFilter = computed(() => route.query.filter || 'my');

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

const emitUpdate = () => {
    emit('update', {
        visibleColumns: visibleColumns.value,
        sort: sort.value
    });
};

const emitFetch = () => {
    emit('fetch', {
        type: type.value,
        status: status.value,
        creator: creator.value,
        assignee: assignee.value,
        assignmentType: assignmentType.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        badge: badges.value
    });
};

const applyAll = () => {
    syncFiltersToRoute();
    emitUpdate();
    emitFetch();
};

let debounceTimer = null;
const applyAllDebounced = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        applyAll();
    }, 300);
};

const handleTypeChange = () => {
    status.value = '';
    applyAll();
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
    applyAll();
};

const resetInternalFilters = () => {
    type.value = [];
    status.value = '';
    creator.value = '';
    assignee.value = '';
    assignmentType.value = '';
    dateRange.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    badges.value = [];
    sort.value = '';
    visibleColumns.value = [...allColumns];
    availableColumns.value = [];
    applyAll();
};

const syncFiltersToRoute = () => {
    const query = { filter: currentFilter.value };
    
    if (type.value.length) query.type = type.value;
    if (badges.value.length) query.badge = badges.value;
    if (status.value) query.status = status.value;
    if (creator.value) query.creator = creator.value;
    if (assignee.value) query.assignee = assignee.value;
    if (assignmentType.value) query.assignmentType = assignmentType.value;
    if (dateRange.value) query.dateRange = dateRange.value;
    if (dateFrom.value) query.dateFrom = dateFrom.value;
    if (dateTo.value) query.dateTo = dateTo.value;
    
    if (sort.value) {
        query.sort = sort.value;
    }

    const defaultCols = allColumns.map(c => c.id).join(',');
    const currentCols = visibleColumns.value.map(c => c.id).join(',');
    if (currentCols !== defaultCols) {
        query.cols = currentCols;
    }

    router.replace({ query }).catch(() => {});
};

const initFiltersFromRoute = () => {
    const parseArray = (val) => {
        if (!val) return [];
        return Array.isArray(val) ? val : [val];
    };

    type.value = parseArray(route.query.type);
    badges.value = parseArray(route.query.badge);
    
    status.value = route.query.status || '';
    creator.value = route.query.creator || '';
    assignee.value = route.query.assignee || '';
    assignmentType.value = route.query.assignmentType || '';
    dateRange.value = route.query.dateRange || '';
    dateFrom.value = route.query.dateFrom || '';
    dateTo.value = route.query.dateTo || '';

    sort.value = route.query.sort || '';

    if (route.query.cols) {
        const colIds = route.query.cols.split(',');
        visibleColumns.value = colIds.map(id => allColumns.find(c => c.id === id)).filter(Boolean);
        const visibleIds = visibleColumns.value.map(c => c.id);
        availableColumns.value = allColumns.filter(c => !visibleIds.includes(c.id));
    } else {
        visibleColumns.value = [...allColumns];
        availableColumns.value = [];
    }
};

const loadSavedFilters = () => {
    const key = `vin_saved_filters_${currentFilter.value}`;
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            savedFilters.value = JSON.parse(saved);
        } else {
            savedFilters.value = [];
        }
    } catch (e) {
        console.error('Error loading saved filters:', e);
        savedFilters.value = [];
    }
};

const saveCurrentFilter = async () => {
    const name = await prompt('Bitte gib einen Namen für diese Ansicht ein:');
    if (!name) return;

    const newFilter = {
        name,
        type: type.value,
        status: status.value,
        creator: creator.value,
        assignee: assignee.value,
        assignmentType: assignmentType.value,
        dateRange: dateRange.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        badges: [...badges.value],
        sort: sort.value,
        cols: visibleColumns.value.map(c => c.id).join(',')
    };

    savedFilters.value.push(newFilter);
    const key = `vin_saved_filters_${currentFilter.value}`;
    localStorage.setItem(key, JSON.stringify(savedFilters.value));
};

const deleteSavedFilter = async (index) => {
    if (await confirm('Soll die Ansicht wirklich gelöscht werden?')) {
        savedFilters.value.splice(index, 1);
        const key = `vin_saved_filters_${currentFilter.value}`;
        localStorage.setItem(key, JSON.stringify(savedFilters.value));
    }
};

const applySavedFilter = (filter) => {
    type.value = filter.type || [];
    status.value = filter.status || '';
    creator.value = filter.creator || '';
    assignee.value = filter.assignee || '';
    assignmentType.value = filter.assignmentType || '';
    dateRange.value = filter.dateRange || '';
    dateFrom.value = filter.dateFrom || '';
    dateTo.value = filter.dateTo || '';
    badges.value = filter.badges || [];
    
    sort.value = filter.sort || '';
    
    if (filter.cols) {
        const colIds = filter.cols.split(',');
        visibleColumns.value = colIds.map(id => allColumns.find(c => c.id === id)).filter(Boolean);
        const visibleIds = visibleColumns.value.map(c => c.id);
        availableColumns.value = allColumns.filter(c => !visibleIds.includes(c.id));
    } else {
        visibleColumns.value = [...allColumns];
        availableColumns.value = [];
    }
    
    applyAll();
};

onMounted(() => {
    initFiltersFromRoute();
    loadSavedFilters();
    emitUpdate();
    emitFetch();
});

watch(currentFilter, () => {
    initFiltersFromRoute();
    loadSavedFilters();
    emitUpdate();
    emitFetch();
});

const toggleSort = (colId) => {
    if (sort.value === colId) {
        sort.value = '-' + colId;
    } else if (sort.value === '-' + colId) {
        sort.value = '';
    } else {
        sort.value = colId;
    }
    applyAll();
};

const getSortIcon = (colId) => {
    if (sort.value === colId) return '↑';
    if (sort.value === '-' + colId) return '↓';
    return '↕';
};

defineExpose({ toggleSort });

</script>

<style scoped>
.filter-details {
    background: white;
    border-radius: var(--wa-border-radius-large);
    box-shadow: var(--wa-shadow-small);
    border: 1px solid var(--wa-color-neutral-80);
    flex-shrink: 0;
}

.filter-details summary {
    padding: 1rem;
    font-weight: 600;
    cursor: pointer;
    color: var(--wa-color-neutral-20);
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
    border-right: 2px solid var(--wa-color-neutral-40);
    border-bottom: 2px solid var(--wa-color-neutral-40);
    transform: rotate(45deg);
    margin-left: auto;
    transition: transform 0.2s;
}

.filter-details[open] summary::after {
    transform: rotate(225deg);
}

.view-config-container {
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem 1.5rem 1.5rem;
    gap: 1.5rem;
}

@media (min-width: 1200px) {
    .view-config-container {
        display: grid;
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        grid-template-areas: 
            "filters columns"
            "actions actions";
        align-items: start;
    }
    .filters {
        grid-area: filters;
    }
    .columns-dnd-container {
        grid-area: columns;
        border-top: none;
        padding-top: 0;
        padding-left: 1.5rem;
    }
    .filter-actions {
        grid-area: actions;
    }
}

.filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.5rem;
}

.filter-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
}

.filter-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.filter-group label {
    font-weight: 500;
    color: var(--wa-color-neutral-20);
    font-size: 0.9rem;
}

.filter-group wa-select,
.filter-group wa-input {
    min-width: 140px;
}

.filter-group wa-select::part(tag) {
    font-size: 0.75rem;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 9999px;
    border: 1px solid var(--wa-color-neutral-60);
}

.columns-dnd-container {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    height: 100%;
}

.dnd-column {
    flex: 1;
    min-width: 180px;
    background: var(--wa-color-neutral-95);
    border-radius: var(--wa-border-radius-medium);
    padding: 1rem;
    border: 1px solid var(--wa-color-neutral-80);
    display: flex;
    flex-direction: column;
}

.dnd-header {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--wa-color-neutral-30);
    margin-bottom: 0.75rem;
    text-transform: uppercase;
}

.dnd-list {
    min-height: 50px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
}

.dnd-item {
    background: white;
    border: 1px solid var(--wa-color-neutral-70);
    border-radius: var(--wa-border-radius-small);
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: grab;
    user-select: none;
    box-shadow: var(--wa-shadow-x-small);
}

.dnd-item:active {
    cursor: grabbing;
}

.available-item {
    color: var(--wa-color-neutral-40);
}

.drag-handle {
    color: var(--wa-color-neutral-50);
    cursor: grab;
}

.col-label {
    flex: 1;
    font-weight: 500;
}

.sort-toggles {
    display: flex;
    gap: 0.25rem;
}

.sort-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--wa-color-neutral-50);
    transition: all 0.2s;
}

.sort-btn:hover {
    background: var(--wa-color-neutral-90);
}

.sort-btn.active {
    background: var(--wa-color-brand-90);
    color: var(--wa-color-brand-30);
    border-color: var(--wa-color-brand-70);
    font-weight: bold;
}
</style>
