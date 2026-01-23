<template>
  <div class="dynamic-form">
    <div v-for="field in fields" :key="field.name" class="form-field">
      <!-- Date -->
      <sl-input 
        v-if="field.type === 'Date'"
        type="date"
        :label="field.name"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-input="updateField(field.name, $event.target.value)"
      ></sl-input>

      <!-- Time -->
      <sl-input 
        v-else-if="field.type === 'Time'"
        type="time"
        :label="field.name"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-input="updateField(field.name, $event.target.value)"
      ></sl-input>

      <!-- Select -->
      <sl-select
        v-else-if="field.type === 'Select'"
        :label="field.name"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-change="updateField(field.name, $event.target.value)"
      >
        <sl-option v-for="opt in field.options" :key="opt" :value="opt">
            {{ opt }}
        </sl-option>
      </sl-select>

      <!-- RichText (Quill) -->
      <RichTextEditor
        v-else-if="field.type === 'RichText'"
        :label="field.name"
        :modelValue="modelValue[field.name] || ''"
        @update:modelValue="updateField(field.name, $event)"
      />

      <!-- Standard Text -->
      <sl-input 
        v-else
        :label="field.name"
        :required="field.required === true || field.required === 'ja'"
        :value="modelValue[field.name] || ''"
        @sl-input="updateField(field.name, $event.target.value)"
      ></sl-input>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
import RichTextEditor from './RichTextEditor.vue';

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true }
});

const emit = defineEmits(['update:modelValue']);

const updateField = (name, value) => {
    // Updates the model by emitting a new object
    emit('update:modelValue', { ...props.modelValue, [name]: value });
};
</script>

<style scoped>
.form-field {
    margin-bottom: 1rem;
}
</style>
