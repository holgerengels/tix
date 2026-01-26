<template>
  <div class="dynamic-form">
    <div v-for="field in visibleFields(fields)" :key="field.name" class="form-field">
      <!-- Date -->
      <wa-input 
        v-if="field.type === 'Date'"
        type="date"
        :label="field.label"
        :required="field.required === true"
        :value="modelValue[field.name] || ''"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>

      <!-- Time -->
      <wa-input 
        v-else-if="field.type === 'Time'"
        type="time"
        :label="field.label"
        :required="field.required === true"
        :value="modelValue[field.name] || ''"
        @input="updateField(field.name, $event.target.value)"
      ></wa-input>

      <!-- Select -->
      <wa-select
        v-else-if="field.type === 'Select'"
        hoist
        :label="field.label"
        :required="field.required === true"
        :value="modelValue[field.name] || ''"
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
            :modelValue="modelValue[field.name] || ''"
            :options="field.options"
            @update:modelValue="updateField(field.name, $event)"
        />
      </div>

      <!-- Rich Text -->
      <RichTextEditor
        v-else-if="field.type === 'RichText'"
        :label="field.label"
        :modelValue="modelValue[field.name] || ''"
        @update:modelValue="updateField(field.name, $event)"
      />

      <!-- User Select -->
      <wa-select
        v-else-if="field.type === 'User'"
        hoist
        :label="field.label"
        :required="field.required === true"
        :value="modelValue[field.name] || ''"
        @change.stop="updateField(field.name, $event.target.value)"
        @input.stop
        @after-hide.stop="isOpen = false"
      >
        <wa-option v-for="user in getFilteredUsers(field.groups)" :key="user.username" :value="user.username">
            {{ user.username }}
        </wa-option>
      </wa-select>

      <!-- Standard Text -->
      <wa-input 
        v-else
        :label="field.label"
        :required="field.required === true"
        :value="modelValue[field.name] || ''"
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

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true }
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
        const res = await axios.get('/api/users', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        users.value = res.data;
    } catch (err) {
        console.error("Failed to fetch users", err);
    }
};

const getFilteredUsers = (groups) => {
    if (!groups || groups.length === 0) return users.value;
    return users.value.filter(u => u.groups && u.groups.some(g => groups.includes(g)));
};

onMounted(() => {
    fetchUsers();
});
</script>

<style scoped>
.form-field {
    margin-bottom: 1rem;
}
</style>
