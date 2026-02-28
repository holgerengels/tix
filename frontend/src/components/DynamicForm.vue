<template>
  <div class="dynamic-form">
    <div class="dynamic-form-grid" :style="gridStyle">
      <div v-for="field in orderedFields" :key="field.name" class="form-field" :style="getFieldStyle(field)">
          <FormField 
              :field="field"
              :modelValue="modelValue[field.name]"
              @update:modelValue="updateField(field.name, $event)"
          />
      </div>
    </div>
    
    <div v-if="errors.length > 0" ref="errorBox" class="error-messages">
        <div v-for="(error, index) in errors" :key="index" class="error-item">
            {{ error }}
        </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, defineExpose, computed, watch, ref, nextTick } from 'vue';
import FormField from './FormField.vue';
import { evaluateFields, validateTicket } from '../utils/evaluation';
import { ui } from '../state/ui';

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true },
  grid: { type: Array, default: () => [] },
  workflow: { type: Object, default: () => null }
});

const emit = defineEmits(['update:modelValue']);

const errors = ref([]);
const errorBox = ref(null);

const updateField = (name, value) => {
    // By mutating the proxy instead of extracting it, we avoid race conditions
    // where asynchronous wa-change events use a stale modelValue clone.
    props.modelValue[name] = value;
    emit('update:modelValue', props.modelValue);
};

// Auto re-validate dynamically if we already have errors showing
watch(props.modelValue, () => {
    if (errors.value.length > 0) {
        validate();
    }
}, { deep: true });

const validate = () => {
    errors.value = [];
    if (!props.workflow && (!props.fields || props.fields.length === 0)) {
        return true; // Nothing to validate against
    }
    
    // Fallback if workflow is incomplete but we have fields
    const wfToValidate = props.workflow || { fields: props.fields, validations: [] };
    
    const validation = validateTicket(props.modelValue, wfToValidate, props.fields);
    if (!validation.isValid) {
        errors.value = validation.errors;
        nextTick(() => {
            if (errorBox.value) {
                // Scroll the error box into view with a little top margin
                errorBox.value.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        });
    }
    return validation.isValid;
};

defineExpose({
    validate
});

// Start Grid Logic

const evaluatedFields = computed(() => {
    return evaluateFields(props.fields, props.modelValue);
});

const visibleFields = computed(() => {
    // Rely on computed evaluated fields
    return evaluatedFields.value.filter(f => f.visible !== false);
});

const orderedFields = computed(() => {
    const visible = visibleFields.value;
    
    // Only reorder if grid layout is active (not narrow and grid exists)
    if (ui.state.isNarrow || !props.grid || props.grid.length === 0) {
        return visible;
    }

    // Extract field names from grid in visual order
    const gridOrder = [];
    const seen = new Set();
    
    props.grid.forEach(row => {
        const tokens = row.split(/\s+/);
        tokens.forEach(token => {
            if (token !== '.' && !seen.has(token)) {
                seen.add(token);
                gridOrder.push(token);
            }
        });
    });

    // Sort visible fields
    const fieldMap = new Map(visible.map(f => [f.name, f]));
    const result = [];

    // Add fields present in grid
    gridOrder.forEach(name => {
        if (fieldMap.has(name)) {
            result.push(fieldMap.get(name));
            fieldMap.delete(name);
        }
    });

    // Add remaining fields (not in grid)
    visible.forEach(f => {
        if (fieldMap.has(f.name)) {
            result.push(f);
        }
    });

    return result;
});

const gridStyle = computed(() => {
    if (!ui.state.isNarrow && props.grid && props.grid.length > 0) {
        // Collect visible field names
        const visibleNames = new Set(visibleFields.value.map(f => f.name));
        
        // Filter rows: Keep row if it contains at least one visible field
        // or if it contains tokens that are not valid field names (e.g. static areas/spacers like '.').
        const allFieldNames = new Set(props.fields.map(f => f.name));
        
        let areas = props.grid.filter(rowStr => {
            const tokens = rowStr.split(/\s+/);
            // Check if any token is a visible field OR not a defined field
            return tokens.some(token => visibleNames.has(token) || !allFieldNames.has(token));
        });
        
        // Find fields not present in the original grid
        const allGridTokens = new Set(props.grid.join(' ').split(/\s+/));
        const missingFields = visibleFields.value.filter(f => !allGridTokens.has(f.name));
        
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
    display: flex;
    flex-direction: column;
    height: 100%;
}
.error-messages {
    background-color: #fee;
    border: 1px solid #faa;
    color: #c00;
    padding: 1rem;
    border-radius: 4px;
    margin-top: 1rem;
}
.error-item {
    margin-bottom: 0.5rem;
}
.error-item:last-child {
    margin-bottom: 0;
}
</style>
