<template>
  <wa-dropdown class="autocomplete-dropdown" :open="isOpen" @after-hide.stop="isOpen = false" hoist>
    <wa-input
      slot="trigger"
      :label="label"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      @input="handleInput"
      @focus="handleFocus"
      @blur="handleBlur"
      @keydown.down.prevent="focusMenu"
      @keydown.space.stop
      autocomplete="off"
    >
        <wa-icon slot="suffix" name="chevron-down"></wa-icon>
    </wa-input>

    <div v-if="filteredOptions.length > 0" class="dropdown-list">
      <wa-dropdown-item v-for="opt in filteredOptions" :key="opt" :value="opt" @click="handleItemClick(opt)">
        {{ opt }}
      </wa-dropdown-item>
    </div>
    <!-- Optional: Show message if no options match? Or just hide menu -->
  </wa-dropdown>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);

const filteredOptions = computed(() => {
  if (!props.modelValue) return props.options;
  const lowerQuery = props.modelValue.toLowerCase();
  return props.options.filter(opt => opt.toLowerCase().includes(lowerQuery));
});

const handleInput = (event) => {
  emit('update:modelValue', event.target.value);
  if (event.target.value.length >= 3) {
    isOpen.value = true;
  } else {
    isOpen.value = false;
  }
};

const handleFocus = () => {
    if (props.modelValue && props.modelValue.length >= 3) {
        isOpen.value = true;
    }
};

const handleBlur = () => {
    // Normalize immediately to ensure value is updated before any submit action (e.g. button click)
    if (props.modelValue) {
        const lowerVal = props.modelValue.toLowerCase().trim();
        const match = props.options.find(opt => opt.toLowerCase() === lowerVal);
        if (match && match !== props.modelValue) {
            emit('update:modelValue', match);
        }
    }

    // Delay closing logic to allow click event on menu item to fire first
    setTimeout(() => {
        isOpen.value = false;
    }, 150);
};

const handleItemClick = (option) => {
  emit('update:modelValue', option);
  isOpen.value = false;
};

// Removed handleSelect as we now use direct click


const focusMenu = () => {
    if (!isOpen.value) {
        isOpen.value = true;
        return;
    }
    // Logic to focus first menu item if needed, but standard Tab/Arrow keys might work if menu is focused.
    // Web Awesome dropdown might handle arrow keys if trigger is focused? 
    // Usually wa-dropdown manages focus transfer. Let's rely on standard behavior or keep it simple.
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
