<template>
  <wa-dropdown class="autocomplete-dropdown" :open="isOpen" @after-hide.stop="isOpen = false" hoist>
    <wa-input
      slot="trigger"
      :label="label"
      :value="displayValue"
      :required="required"
      :disabled="disabled"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown.down.prevent="focusMenu"
      @keydown.space.stop
      autocomplete="off"
      :hint="hint"
    >
        <wa-icon slot="suffix" name="chevron-down"></wa-icon>
    </wa-input>

    <div v-if="filteredOptions.length > 0" class="dropdown-list">
      <wa-dropdown-item v-for="opt in filteredOptions" :key="optValue(opt)" :value="optValue(opt)" @click="handleItemClick(opt)">
        {{ optLabel(opt) }}
      </wa-dropdown-item>
    </div>
  </wa-dropdown>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  hint: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const searchText = ref('');
const hasSelected = ref(false);
let suppressOpen = false; // Guard to prevent reopening after selection or blur

// Helpers to handle both string[] and { value, label }[] options
const optValue = (opt) => typeof opt === 'object' ? opt.value : opt;
const optLabel = (opt) => typeof opt === 'object' ? opt.label : opt;

// Find the label for the current modelValue
const displayValue = computed(() => {
    if (searchText.value !== '' && !hasSelected.value) return searchText.value;
    if (!props.modelValue) return '';
    const match = props.options.find(opt => optValue(opt) === props.modelValue);
    return match ? optLabel(match) : props.modelValue;
});

const filteredOptions = computed(() => {
    const query = (searchText.value || displayValue.value || '').toLowerCase();
    if (!query) return props.options;
    return props.options.filter(opt => optLabel(opt).toLowerCase().includes(query));
});

const handleInput = (event) => {
    searchText.value = event.target.value;
    hasSelected.value = false;
    suppressOpen = false;
    // Also emit the raw text as value so partial typing works
    // Check if text matches a value exactly
    const match = props.options.find(opt => optLabel(opt).toLowerCase() === event.target.value.toLowerCase());
    if (match) {
        emit('update:modelValue', optValue(match));
    } else {
        emit('update:modelValue', event.target.value);
    }
    if (event.target.value.length >= 3) {
        isOpen.value = true;
    } else {
        isOpen.value = false;
    }
};

const handleFocus = () => {
    // Don't reopen if we just closed after a selection or blur
    if (suppressOpen) return;
    if (searchText.value && searchText.value.length >= 3) {
        isOpen.value = true;
    }
};

const handleBlur = () => {
    // Normalize immediately to ensure value is updated before any submit action
    if (searchText.value) {
        const lowerVal = searchText.value.toLowerCase().trim();
        const match = props.options.find(opt => optLabel(opt).toLowerCase() === lowerVal);
        if (match) {
            emit('update:modelValue', optValue(match));
            hasSelected.value = true;
            searchText.value = '';
        }
    }

    // Suppress reopening and close after a short delay (to allow click on menu item)
    suppressOpen = true;
    setTimeout(() => {
        isOpen.value = false;
    }, 150);
    setTimeout(() => {
        suppressOpen = false;
    }, 300);
};

const handleItemClick = (option) => {
    suppressOpen = true;
    emit('update:modelValue', optValue(option));
    hasSelected.value = true;
    searchText.value = '';
    isOpen.value = false;
    setTimeout(() => {
        suppressOpen = false;
    }, 300);
};

const focusMenu = () => {
    if (!isOpen.value) {
        suppressOpen = false;
        isOpen.value = true;
        return;
    }
};
</script>

<style scoped>
.autocomplete-dropdown {
    width: 100%;
}
.autocomplete-dropdown::part(panel) {
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
}
</style>
