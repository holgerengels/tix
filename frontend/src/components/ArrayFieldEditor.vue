<template>
  <div class="array-field-editor" :style="field.minWidth ? { '--item-min-width': field.minWidth } : {}">
    <div class="label" v-if="field.label">{{ field.label }}</div>
    
    <draggable
        v-model="internalList"
        item-key="id"
        handle=".drag-handle"
        :disabled="field.readonly || field.disabled"
        :filter="'.is-skeleton'"
        :preventOnFilter="true"
        class="array-field-list"
        :class="[
          field.layout === 'columns' ? 'layout-row' : 'layout-column',
          { 'responsive-grid': !!field.minWidth }
        ]"
        @change="emitUpdate"
    >
      <template #item="{ element: row, index }">
        <div 
            class="array-row"
            :class="{ 'is-skeleton': row.isSkeleton }"
        >
          <!-- Drag Handle -->
          <div class="drag-handle" v-if="!field.readonly && !field.disabled && !row.isSkeleton">
            <wa-icon name="grip-vertical"></wa-icon>
          </div>
          <div class="drag-handle-spacer" v-else-if="!field.readonly && !field.disabled && row.isSkeleton"></div>

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
            v-if="!row.isSkeleton && !field.readonly && !field.disabled" 
            appearance="plain" 
            size="small" 
            class="delete-btn"
            @click="deleteRow(index)"
          >
            <wa-icon name="x-lg"></wa-icon>
          </wa-button>
          <div class="action-spacer" v-else-if="row.isSkeleton && !field.readonly && !field.disabled"></div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, watch, computed } from 'vue';
import draggable from 'vuedraggable';
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

watch(() => props.modelValue, (newVal) => {
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
</script>

<style scoped>
.array-field-editor {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.array-field-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    width: 100%;
}

.array-field-list.layout-column {
    flex-direction: column;
}

.array-field-list.layout-row {
    flex-direction: row;
    align-items: flex-start;
}

/* Responsive Grid Layout when minWidth is set */
.array-field-list.responsive-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--item-min-width), 1fr));
    align-items: stretch;
}

.label {
    width: 100%; /* Label always full width */
    grid-column: 1 / -1; /* Make label span full width in grid */
    font-size: 1rem;
    font-weight: 500;
    color: var(--wa-color-neutral-20);
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
.array-field-list.responsive-grid .array-row {
    width: auto;
}

.array-row:hover {
    background-color: var(--wa-color-neutral-90);
}

.is-skeleton {
    opacity: 0.7;
}

.drag-handle {
    cursor: grab;
    color: var(--wa-color-neutral-50);
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
    color: var(--wa-color-neutral-40);
}

.delete-btn:hover {
    color: var(--wa-color-danger-30);
}
</style>
