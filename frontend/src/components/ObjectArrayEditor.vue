<template>
  <div class="object-array-editor">
    <div class="label" v-if="field.label">{{ field.label }}</div>

    <!-- Table Header -->
    <div class="table-header" v-if="visibleSubFields.length > 0">
      <div class="header-drag-spacer" v-if="showDragHandles"></div>
      <div
        v-for="subField in visibleSubFields"
        :key="subField.name"
        class="header-cell"
      >
        {{ subField.label }}
      </div>
      <div class="header-action-spacer" v-if="showDeleteButtons"></div>
    </div>

    <!-- Rows -->
    <draggable
      v-model="internalList"
      item-key="id"
      handle=".drag-handle"
      :disabled="isFixedOrder || field.readonly || field.disabled"
      :filter="'.is-skeleton'"
      :preventOnFilter="true"
      class="object-array-list"
      @change="emitUpdate"
    >
      <template #item="{ element: row, index }">
        <div
          class="object-row"
          :class="{ 'is-skeleton': row.isSkeleton }"
        >
          <!-- Drag Handle -->
          <div class="drag-handle" v-if="showDragHandles && !row.isSkeleton">
            <wa-icon name="grip-vertical"></wa-icon>
          </div>
          <div class="drag-handle-spacer" v-else-if="showDragHandles && row.isSkeleton"></div>

          <!-- Sub Fields -->
          <div
            v-for="subField in visibleSubFields"
            :key="subField.name"
            class="row-cell"
          >
            <FormField
              :field="{ ...subField, label: '' }"
              :context="context"
              :modelValue="(row.value || {})[subField.name]"
              @update:modelValue="updateSubField(index, subField.name, $event)"
            />
          </div>

          <!-- Delete Button -->
          <wa-button
            v-if="showDeleteButtons && !row.isSkeleton"
            appearance="plain"
            size="small"
            class="delete-btn"
            @click="deleteRow(index)"
          >
            <wa-icon name="x-lg"></wa-icon>
          </wa-button>
          <div class="action-spacer" v-else-if="showDeleteButtons && row.isSkeleton"></div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, watch, computed } from 'vue';
import draggable from 'vuedraggable';
import FormField from './FormField.vue';
import { evaluateFields } from '../utils/evaluation';

const props = defineProps({
  field: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  modelValue: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:modelValue']);

// Unique ID generator for list items
let uid = 0;
const getUid = () => `oae-${uid++}`;

// Evaluate fixedLength and fixedOrder as booleans
const isFixedLength = computed(() => {
    const val = props.field.fixedLength;
    return val === true || val === 'true';
});

const isFixedOrder = computed(() => {
    const val = props.field.fixedOrder;
    return val === true || val === 'true';
});

const showDragHandles = computed(() => {
    return !isFixedOrder.value && !props.field.readonly && !props.field.disabled;
});

const showDeleteButtons = computed(() => {
    return !isFixedLength.value && !props.field.readonly && !props.field.disabled;
});

// Sub-field definitions from items.fields, evaluated reactively
const subFields = computed(() => {
    const fields = props.field.items?.fields || [];
    return evaluateFields(fields, props.context);
});

const visibleSubFields = computed(() => {
    return subFields.value.filter(f => f.visible !== false);
});

// Build default values for a new row from sub-field defaults
const buildDefaultRow = () => {
    const row = {};
    const fields = props.field.items?.fields || [];
    fields.forEach(f => {
        if (f.default !== undefined) {
            row[f.name] = f.default;
        }
    });
    return row;
};

// Internal list state: { id: string, value: object, isSkeleton: boolean }
const internalList = ref([]);

const initList = () => {
    const list = (props.modelValue || []).map(val => ({
        id: getUid(),
        value: val || {},
        isSkeleton: false
    }));

    // Append skeleton row if not fixedLength and not readonly
    if (!isFixedLength.value && !props.field.readonly && !props.field.disabled) {
        list.push(createSkeleton());
    }

    internalList.value = list;
};

const createSkeleton = () => ({
    id: getUid(),
    value: buildDefaultRow(),
    isSkeleton: true
});

watch(() => props.modelValue, (newVal) => {
    const currentValues = internalList.value.filter(i => !i.isSkeleton).map(i => i.value);

    if (internalList.value.length === 0 || JSON.stringify(newVal) !== JSON.stringify(currentValues)) {
        initList();
    }
}, { immediate: true });

// Also re-init when fixedLength changes (e.g. state transition) to add/remove skeleton
watch(isFixedLength, () => {
    initList();
});

const updateSubField = (index, fieldName, newValue) => {
    const row = internalList.value[index];

    // Clone the value to ensure reactivity
    const updated = { ...(row.value || {}) };
    updated[fieldName] = newValue;
    row.value = updated;

    // If it was a skeleton, it's now real
    if (row.isSkeleton) {
        // Fill in defaults for other fields
        const defaults = buildDefaultRow();
        for (const [key, val] of Object.entries(defaults)) {
            if (updated[key] === undefined) {
                updated[key] = val;
            }
        }
        row.value = updated;
        row.isSkeleton = false;
        // Append new skeleton
        if (!isFixedLength.value) {
            internalList.value.push(createSkeleton());
        }
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
.object-array-editor {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.label {
    width: 100%;
    font-size: 1rem;
    font-weight: 500;
    color: var(--wa-color-neutral-20);
    margin-bottom: 0.25rem;
}

.table-header {
    display: flex;
    align-items: center;
    gap: 0rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid var(--wa-color-neutral-70);
    margin-bottom: 0.25rem;
}

.header-cell {
    flex: 1;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--wa-color-neutral-30);
    min-width: 0;
    padding: 0 0.25rem;
}

.header-drag-spacer {
    width: 2rem;
    flex-shrink: 0;
}

.header-action-spacer {
    width: 2rem;
    flex-shrink: 0;
}

.object-array-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
}

.object-row {
    display: flex;
    align-items: center;
    gap: 0rem;
    border: 1px solid transparent;
    border-radius: var(--wa-border-radius-medium);
    transition: background-color 0.2s;
    flex-shrink: 0;
    min-width: 0;
}

.object-row:hover {
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
    flex-shrink: 0;
    width: 2rem;
}

.drag-handle:active {
    cursor: grabbing;
}

.drag-handle-spacer, .action-spacer {
    width: 2rem;
    flex-shrink: 0;
}

.row-cell {
    flex: 1;
    min-width: 0;
    padding: 0 0.25rem;
}

/* Override FormField margin inside rows to tighten layout */
.row-cell :deep(.form-field-content) {
    margin-bottom: 0;
}
.row-cell :deep(.form-field-content wa-input),
.row-cell :deep(.form-field-content wa-select),
.row-cell :deep(.form-field-content wa-autocomplete) {
    margin-bottom: 0;
}

.delete-btn {
    color: var(--wa-color-neutral-40);
    flex-shrink: 0;
}

.delete-btn:hover {
    color: var(--wa-color-danger-30);
}
</style>
