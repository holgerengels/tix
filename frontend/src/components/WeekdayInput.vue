<template>
  <div class="weekday-group">
    <label v-if="label" class="weekday-label">{{ label }}</label>
    <wa-button-group>
        <wa-button 
            v-for="day in days" 
            :key="day"
            pill
            size="small"
            variant="brand"
            :appearance="modelValue === day ? 'accent' : 'filled-outlined'"
            :disabled="readonly"
            @click="toggleValue(day)"
        >
            {{ day }}
        </wa-button>
    </wa-button-group>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  readonly: { type: Boolean, default: false },
  label: { type: String, default: '' },
  modelValue: { type: [String, null], default: null }
});

const emit = defineEmits(['update:modelValue']);
const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

const toggleValue = (day) => {
    emit('update:modelValue', props.modelValue === day ? null : day);
};
</script>

<style scoped>
.weekday-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.weekday-label {
    font-size: 1rem;
    font-weight: 500;
    color: var(--wa-color-neutral-20);
    line-height: 1.5; /* Match other labels */
}
</style>
