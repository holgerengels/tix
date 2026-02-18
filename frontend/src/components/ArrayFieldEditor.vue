<template>
  <div class="array-field-editor" 
       :class="[
         field.layout === 'columns' ? 'layout-row' : 'layout-column',
         { 'responsive-grid': !!field.minWidth }
       ]"
       :style="field.minWidth ? { '--item-min-width': field.minWidth } : {}">
    <div class="label" v-if="field.label">{{ field.label }}</div>
    
    <div 
        v-for="(row, index) in internalList" 
        :key="row.id" 
        class="array-row"
        :class="{ 'is-skeleton': row.isSkeleton }"
        :draggable="!field.readonly"
        @dragstart="onDragStart($event, index)"
        @dragover.prevent
        @drop="onDrop($event, index)"
    >
      <!-- Drag Handle -->
      <div class="drag-handle" draggable="true" @dragstart.stop="onDragStart($event, index)" v-if="!field.readonly">
        <wa-icon name="grip-vertical"></wa-icon>
      </div>

      <!-- Field Content -->
      <div class="row-content">
        <FormField 
            :field="itemField"
            :modelValue="row.value"
            @update:modelValue="updateRow(index, $event)"
        />
      </div>

      <!-- Actions -->
      <wa-button 
        v-if="!row.isSkeleton && !field.readonly" 
        appearance="plain" 
        size="small" 
        class="delete-btn"
        @click="deleteRow(index)"
      >
        <wa-icon name="x-lg"></wa-icon>
      </wa-button>
      <div class="action-spacer" v-else-if="row.isSkeleton && !field.readonly"></div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, watch, computed } from 'vue';
import FormField from './FormField.vue';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:modelValue']);

// Unique ID generator for list items
let uid = 0;
const getUid = () => `item-${uid++}`;

// The field definition for items
const itemField = computed(() => {
    return {
        ...props.field.items,
        label: '', // Hide label for inner items to avoid repetition
        readonly: props.field.readonly || props.field.disabled // Inherit readonly/disabled
    };
});

// Internal list state
// { id: string, value: any, isSkeleton: boolean }
const internalList = ref([]);

const initList = () => {
    const list = (props.modelValue || []).map(val => ({
        id: getUid(),
        value: val,
        isSkeleton: false
    }));
    
    // Append Skeleton ONLY if not readonly
    if (!props.field.readonly && !props.field.disabled) {
        list.push(createSkeleton());
    }
    
    internalList.value = list;
};

const createSkeleton = () => ({
    id: getUid(),
    value: null, // Initial value
    isSkeleton: true
});

// Watch for external model changes (optional, might conflict with local updates if not careful)
// For now we init once. If two-way binding is strict, we might need deep watch.
// But usually form updates come from here. To support external reset, we watch prop length maybe?
watch(() => props.modelValue, (newVal) => {
    // Basic sync: if empty and internal has only skeleton, fine.
    // If visible items differ from internal non-skeletons, re-init.
    // Also init if internal list is completely empty (first run).
    const currentValues = internalList.value.filter(i => !i.isSkeleton).map(i => i.value);
    
    if (internalList.value.length === 0 || JSON.stringify(newVal) !== JSON.stringify(currentValues)) {
        initList();
    }
}, { immediate: true });


const updateRow = (index, newValue) => {
    const row = internalList.value[index];
    
    // Update value
    row.value = newValue;
    
    // If it was skeleton, it's now real
    if (row.isSkeleton) {
        row.isSkeleton = false;
        // Append new skeleton
        internalList.value.push(createSkeleton());
    }
    
    emitUpdate();
};

const deleteRow = (index) => {
    internalList.value.splice(index, 1);
    emitUpdate();
};

const emitUpdate = () => {
    const values = internalList.value
        .filter(row => !row.isSkeleton)
        .map(row => row.value);
    emit('update:modelValue', values);
};

// Drag and Drop
const onDragStart = (event, index) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index);
};

const onDrop = (event, index) => {
    const fromIndex = parseInt(event.dataTransfer.getData('text/plain'));
    const toIndex = index;
    
    if (fromIndex === toIndex) return;
    
    // Prevent dropping on skeleton? Maybe allow reordering to end (before skeleton)?
    // If dropped on skeleton, insert before it.
    
    const item = internalList.value[fromIndex];
    internalList.value.splice(fromIndex, 1);
    internalList.value.splice(toIndex, 0, item);
    
    emitUpdate();
};
</script>

<style scoped>
.array-field-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.array-field-editor.layout-column {
    flex-direction: column;
}

.array-field-editor.layout-row {
    flex-direction: row;
    align-items: flex-start;
}

/* Responsive Grid Layout when minWidth is set */
.array-field-editor.responsive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--item-min-width), 1fr));
    align-items: stretch;
}

.label {
    width: 100%; /* Label always full width */
    grid-column: 1 / -1; /* Make label span full width in grid */
    font-size: 1rem;
    font-weight: 500;
    color: var(--wa-color-neutral-700);
    margin-bottom: 0.25rem;
}

.array-row {
    display: flex;
    align-items: center;
    gap: 0rem;
    border: 1px solid transparent;
    border-radius: var(--wa-border-radius-medium);
    transition: background-color 0.2s;
    flex-shrink: 0;
    min-width: 0; /* Prevent overflow */
}

/* In grid layout, items fill the cell */
.array-field-editor.responsive-grid .array-row {
    width: auto;
}

.array-row:hover {
    background-color: var(--wa-color-neutral-50);
}

.is-skeleton {
    opacity: 0.7;
}

.drag-handle {
    cursor: grab;
    color: var(--wa-color-neutral-400);
    display: flex;
    align-items: center;
    padding: 0;
}

.drag-handle:active {
    cursor: grabbing;
}

.drag-handle-spacer, .action-spacer {
    width: 2rem; 
}

.row-content {
    flex: 1;
    min-width: 150px; /* Ensure some width in row layout */
}

/* Override FormField margin inside array to tighten layout */
.row-content :deep(.form-field-content) {
    margin-bottom: 0; 
}
.row-content :deep(.form-field-content wa-input),
.row-content :deep(.form-field-content wa-select),
.row-content :deep(.form-field-content wa-autocomplete) {
    margin-bottom: 0;
}

.delete-btn {
    color: var(--wa-color-neutral-500);
}

.delete-btn:hover {
    color: var(--wa-color-danger-600);
}
</style>
