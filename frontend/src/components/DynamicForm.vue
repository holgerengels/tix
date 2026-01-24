<template>
  <div class="dynamic-form">
    <div v-for="field in fields" :key="field.name" class="form-field">
      <!-- Date -->
      <sl-input 
        v-if="field.type === 'Date'"
        type="date"
        :label="field.label"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-input="updateField(field.name, $event.target.value)"
      ></sl-input>

      <!-- Time -->
      <sl-input 
        v-else-if="field.type === 'Time'"
        type="time"
        :label="field.label"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-input="updateField(field.name, $event.target.value)"
      ></sl-input>

      <!-- Select -->
      <sl-select
        v-else-if="field.type === 'Select'"
        hoist
        :label="field.label"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-change.stop="updateField(field.name, $event.target.value)"
        @sl-input.stop
        @sl-after-hide.stop="isOpen = false"
      >
        <sl-option v-for="opt in field.options" :key="opt" :value="opt">
            {{ opt }}
        </sl-option>
      </sl-select>

      <!-- Autocomplete -->
      <div v-else-if="field.type === 'Autocomplete'">
        <SLAutocomplete
            :label="field.label"
            :required="field.required === true || field.required === 'ja'"
            :modelValue="modelValue[field.name] || ''"
            :options="field.options"
            @update:modelValue="updateField(field.name, $event)"
        />
      </div>

      <RichTextEditor
        v-else-if="field.type === 'RichText'"
        :label="field.label"
        :modelValue="modelValue[field.name] || ''"
        @update:modelValue="updateField(field.name, $event)"
      />

      <!-- User Select -->
      <sl-select
        v-else-if="field.type === 'User'"
        hoist
        :label="field.label"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-change.stop="updateField(field.name, $event.target.value)"
        @sl-input.stop
        @sl-after-hide.stop="isOpen = false"
      >
        <sl-option v-for="user in getFilteredUsers(field.groups)" :key="user.username" :value="user.username">
            {{ user.username }}
        </sl-option>
      </sl-select>

      <!-- Standard Text -->
      <sl-input 
        v-else
        :label="field.label"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-input="updateField(field.name, $event.target.value)"
      ></sl-input>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, onMounted } from 'vue';
import axios from 'axios';
import RichTextEditor from './RichTextEditor.vue';
import SLAutocomplete from './SLAutocomplete.vue';

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true }
});

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
