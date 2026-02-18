<template>
  <div class="dynamic-form" :style="gridStyle">
    <div v-for="field in visibleFields(fields)" :key="field.name" class="form-field" :style="getFieldStyle(field)">
        <FormField 
            :field="field"
            :modelValue="modelValue[field.name]"
            @update:modelValue="updateField(field.name, $event)"
        />
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, computed } from 'vue';
import FormField from './FormField.vue';

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true },
  grid: { type: Array, default: () => [] }
});

const visibleFields = (fields) => {
    return fields.filter(f => f.visible !== false);
};

const emit = defineEmits(['update:modelValue']);

const updateField = (name, value) => {
    // Updates the model by emitting a new object
    emit('update:modelValue', { ...props.modelValue, [name]: value });
};

// Start Grid Logic
import { ui } from '../state/ui';

const gridStyle = computed(() => {
    if (!ui.state.isNarrow && props.grid && props.grid.length > 0) {
        let areas = [...props.grid];
        
        // Find fields not present in the grid
        const allGridTokens = new Set(props.grid.join(' ').split(/\s+/));
        const missingFields = visibleFields(props.fields).filter(f => !allGridTokens.has(f.name));
        
        // Append a full-width row for each missing field
        missingFields.forEach(f => {
            areas.push(`${f.name} ${f.name} ${f.name} ${f.name}`);
        });

        return {
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'auto',
            gridTemplateAreas: areas.map(row => `"${row}"`).join(' '),
            gap: '1rem'
        };
    }
    return {};
});

const getFieldStyle = (field) => {
    if (!ui.state.isNarrow && props.grid && props.grid.length > 0) {
        return {
            gridArea: field.name
        };
    }
    return {};
};
</script>

<style scoped>
.dynamic-form {
    /* Default stacked */
}
.form-field {
    margin-bottom: 1rem;
    min-width: 0;
}
</style>
