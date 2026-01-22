<template>
  <div class="dynamic-form">
    <div v-for="field in fields" :key="field.name" class="form-field">
      <!-- Datum -->
      <sl-input 
        v-if="field.typ === 'Datum'"
        type="date"
        :label="field.name"
        :required="field.pflicht === 'ja'"
        v-model="model[field.name]"
      ></sl-input>

      <!-- Zeit -->
      <sl-input 
        v-else-if="field.typ === 'Zeit'"
        type="time"
        :label="field.name"
        :required="field.pflicht === 'ja'"
        v-model="model[field.name]"
      ></sl-input>

      <!-- Auswahl -->
      <sl-select
        v-else-if="field.typ === 'Auswahl'"
        :label="field.name"
        :required="field.pflicht === 'ja'"
        v-model="model[field.name]"
      >
        <sl-option v-for="opt in field.optionen" :key="opt" :value="opt">
            {{ opt }}
        </sl-option>
      </sl-select>

      <!-- Standard Text -->
      <sl-input 
        v-else
        :label="field.name"
        :required="field.pflicht === 'ja'"
        v-model="model[field.name]"
      ></sl-input>
    </div>
  </div>
</template>

<script setup>
import { defineProps, computed } from 'vue';

const props = defineProps({
  fields: { type: Array, required: true },
  modelValue: { type: Object, required: true }
});

const emit = defineEmits(['update:modelValue']);

const model = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});
</script>

<style scoped>
.form-field {
    margin-bottom: 1rem;
}
</style>
