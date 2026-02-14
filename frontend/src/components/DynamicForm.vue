<template>
  <div class="dynamic-form" :style="gridStyle">
    <div v-for="field in visibleFields(fields)" :key="field.name" class="form-field" :style="getFieldStyle(field)">
      <!-- Date -->
      <wa-input 
        v-if="field.type === 'Date'"
        type="date"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue[field.name] || ''"
        :hint="field.hint"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>

      <!-- Time -->
      <wa-input 
        v-else-if="field.type === 'Time'"
        type="time"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue[field.name] || ''"
        :hint="field.hint"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>

      <!-- Select -->
      <wa-select
        v-else-if="field.type === 'Select'"
        hoist
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue[field.name] || ''"
        :hint="field.hint"
        @change.stop="updateField(field.name, $event.target.value)"
        @input.stop
        @after-hide.stop="isOpen = false"
      >
        <wa-option v-for="opt in field.options" :key="opt" :value="opt">
            {{ opt }}
        </wa-option>
      </wa-select>

      <!-- Autocomplete -->
      <div v-else-if="field.type === 'Autocomplete'">
        <WAAutocomplete
            :label="field.label"
            :required="field.required === true"
            :disabled="field.readonly === true"
            :modelValue="modelValue[field.name] || ''"
            :hint="field.hint"
            :options="field.options"
            @update:modelValue="updateField(field.name, $event)"
        />
      </div>

      <!-- Rich Text -->
      <RichTextEditor
        v-else-if="field.type === 'RichText'"
        :label="field.label"
        :disabled="field.readonly === true"
        :required="field.required === true"
        :modelValue="modelValue[field.name] || ''"
        :hint="field.hint"
        @update:modelValue="updateField(field.name, $event)"
      />

      <!-- User Select -->
      <div v-else-if="field.type === 'User'">
        <WAAutocomplete
            :label="field.label"
            :required="field.required === true"
            :disabled="field.readonly === true"
            :modelValue="modelValue[field.name] || ''"
            :hint="field.hint"
            :options="getDisplayUsers(field).map(u => u.username)"
            @update:modelValue="updateField(field.name, $event)"
        />
      </div>

      <!-- Badges -->
      <BadgeEditor
        v-else-if="field.type === 'Badges'"
        :disabled="field.readonly === true"
        :modelValue="modelValue[field.name] || []"
        @update:modelValue="updateField(field.name, $event)"
      />

      <!-- Lessons (Slider) -->
      <wa-slider v-else-if="field.type === 'Lessons'"
          :label="field.label"
          :min="1"
          :max="11"
          :min-value="modelValue[field.name]?.min || 1"
          :max-value="modelValue[field.name]?.max || 6"
          :disabled="field.readonly === true"
          range
          with-markers
          with-tooltip
          :hint="field.hint"
          @input="updateField(field.name, { min: $event.target.minValue, max: $event.target.maxValue })"
        >
            <span slot="reference">1</span>
            <span slot="reference">2</span>
            <span slot="reference">3</span>
            <span slot="reference">4</span>
            <span slot="reference">5</span>
            <span slot="reference">6</span>
            <span slot="reference">7</span>
            <span slot="reference">8</span>
            <span slot="reference">9</span>
            <span slot="reference">10</span>
            <span slot="reference">11</span>
        </wa-slider>

      <!-- Boolean -->
      <wa-checkbox
        v-else-if="field.type === 'Boolean'"
        :checked="modelValue[field.name] === true"
        :disabled="field.readonly === true"
        :required="field.required === true"
        :hint="field.hint"
        @change="updateField(field.name, $event.target.checked)"
      >{{ field.label }}</wa-checkbox>

      <!-- Integer -->
      <wa-input 
        v-else-if="field.type === 'Integer'"
        type="number"
        step="1"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue[field.name] || ''"
        :hint="field.hint"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>

      <!-- Decimal -->
      <wa-input 
        v-else-if="field.type === 'Decimal'"
        type="number"
        step="any"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue[field.name] || ''"
        :hint="field.hint"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>

       <!-- Standard Text -->
      <wa-input 
        v-else
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue[field.name] || ''"
        :hint="field.hint"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, onMounted } from 'vue';
import axios from 'axios';
import RichTextEditor from './RichTextEditor.vue';
import WAAutocomplete from './WAAutocomplete.vue';
import BadgeEditor from './BadgeEditor.vue';


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

const users = ref([]);

const fetchUsers = async () => {
    try {
        // Collect groups from User fields
        const allGroups = new Set();
        props.fields.forEach(f => {
            if (f.type === 'User' && f.groups) {
                f.groups.forEach(g => allGroups.add(g));
            }
        });
        const groupsParam = Array.from(allGroups).join(',');

        const res = await axios.get('/api/users', {
            params: { groups: groupsParam },
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        users.value = res.data;
    } catch (err) {
        console.error("Failed to fetch users", err);
    }
};

const getDisplayUsers = (field) => {
    // 1. Start with all fetched users
    let displayUsers = [...users.value];

    // Filter by field groups if defined
    if (field.groups && field.groups.length > 0) {
        displayUsers = displayUsers.filter(u => u.groups && u.groups.some(g => field.groups.includes(g)));
    }

    // 2. Check if current value exists
    const currentValue = props.modelValue[field.name];
    if (currentValue) {
        // 3. If current value is not in the list, add it partially
        const exists = displayUsers.find(u => u.username === currentValue);
        if (!exists) {
            displayUsers.push({ username: currentValue });
        }
    }
    return displayUsers;
};

import { watch, computed } from 'vue';

watch(() => props.fields, () => {
    fetchUsers();
}, { immediate: true });

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
.form-field {
    margin-bottom: 1rem;
    min-width: 0;
}
</style>
