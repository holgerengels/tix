<template>
  <div class="dynamic-form">
    <div class="dynamic-form-grid" :style="gridStyle">
      <div v-for="field in orderedFields" :key="field.name" class="form-field" :class="{ 'field-highlight': field.highlight === true }" :style="getFieldStyle(field)">
          <FormField 
              v-if="field.visible !== false"
              :field="field"
              :context="modelValue"
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
import { defineProps, defineEmits, defineExpose, computed, watch, ref, nextTick, provide } from 'vue';
import FormField from './FormField.vue';
import { evaluateFields, validateTicket, computeFills } from '../utils/evaluation';
import { useUiStore } from '../stores/ui';

const ui = useUiStore();

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true },
  grid: { type: Array, default: () => [] },
  workflow: { type: Object, default: () => null },
  action: { type: String, default: null }
});

const emit = defineEmits(['update:modelValue']);

const errors = ref([]);
const errorBox = ref(null);
const activeUploadCount = ref(0);

const trackUpload = (delta) => {
    activeUploadCount.value = Math.max(0, activeUploadCount.value + delta);
};
provide('trackUpload', trackUpload);

const updateField = (name, value) => {
    // By mutating the proxy instead of extracting it, we avoid race conditions
    // where asynchronous wa-change events use a stale modelValue clone.
    props.modelValue[name] = value;

    // Compute fills: derive values from other fields
    const { defaults, computeds } = computeFills(props.fields, props.modelValue, name);
    for (const [key, val] of Object.entries(defaults)) {
        if (props.modelValue[key] === undefined || props.modelValue[key] === null || props.modelValue[key] === '') {
            props.modelValue[key] = val;
        }
    }
    for (const [key, val] of Object.entries(computeds)) {
        props.modelValue[key] = val;
    }

    emit('update:modelValue', props.modelValue);
};

// Re-validate if errors are already displayed to give immediate feedback
watch([() => props.modelValue, activeUploadCount], () => {
    if (errors.value.length > 0) {
        validate();
    }
}, { deep: true });

const validate = (actionOverride = null) => {
    errors.value = [];
    const errs = [];

    if (activeUploadCount.value > 0) {
        errs.push('Bitte warten, bis der Datei-Upload abgeschlossen ist.');
    }

    if (props.workflow || (props.fields && props.fields.length > 0)) {
        // Fallback if workflow is incomplete but we have fields
        const wfToValidate = props.workflow || { fields: props.fields, validations: [] };
        const currentAction = actionOverride || props.action || null;

        const validation = validateTicket(props.modelValue, wfToValidate, props.fields, currentAction);
        if (!validation.isValid) {
            errs.push(...validation.errors);
        }
    }

    if (errs.length > 0) {
        errors.value = errs;
        nextTick(() => {
            if (errorBox.value) {
                // Scroll the error box into view with a little top margin
                errorBox.value.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        });
        return false;
    }
    return true;
};

const clearErrors = () => {
    errors.value = [];
};

// Clear validation errors when workflow definition or fields change
watch([() => props.workflow, () => props.fields], () => {
    clearErrors();
});

defineExpose({
    validate,
    clearErrors
});

// Start Grid Logic

const evaluatedFields = computed(() => {
    return evaluateFields(props.fields, props.modelValue);
});

const visibleFields = computed(() => {
    // Rely on cached evaluated fields
    const visible = evaluatedFields.value.filter(f => f.visible !== false);
    return visible;
});

const orderedFields = computed(() => {
    const visible = visibleFields.value;
    
    // Only reorder if grid layout is active (not narrow and grid exists)
    if (ui.isNarrow || !props.grid || props.grid.length === 0) {
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
    if (!ui.isNarrow && props.grid && props.grid.length > 0) {
        // Collect visible field names
        const visibleNames = new Set(visibleFields.value.map(f => f.name));
        
        // Filter rows: Keep row if it contains at least one visible field
        // or if it contains tokens that are not valid field names (e.g. static areas/spacers like '.').
        const allFieldNames = new Set(props.fields.map(f => f.name));
        
        let areas = props.grid.filter(rowStr => {
            const tokens = rowStr.split(/\s+/);
            const fieldsInRow = tokens.filter(token => allFieldNames.has(token));
            
            if (fieldsInRow.length > 0) {
                // If row contains defined fields, keep it ONLY if at least one is visible
                return fieldsInRow.some(fieldName => visibleNames.has(fieldName));
            } else {
                // If row contains NO defined fields (e.g. only '.'), preserve it as a fixed spacer
                return true; 
            }
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
    if (!ui.isNarrow && props.grid && props.grid.length > 0) {
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

/* Field flagged via the "highlight" property (e.g. "{{ticket.a != ticket.b}}") */
.form-field.field-highlight {
    --wa-form-control-border-color: #d00000;
    --wa-form-control-border-width: 4px;
    --wa-form-control-background-color: #ffe5e5;
}
.form-field.field-highlight :deep(::part(base)) {
    border: 4px solid #d00000;
    background-color: #ffe5e5;
    box-shadow: 0 0 0 5px rgba(220, 0, 0, 0.45);
}
</style>
