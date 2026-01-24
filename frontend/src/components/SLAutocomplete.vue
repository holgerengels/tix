<template>
  <sl-dropdown class="autocomplete-dropdown" :open="isOpen" @sl-after-hide.stop="isOpen = false" hoist>
    <sl-input
      slot="trigger"
      :label="label"
      :value="modelValue"
      :required="required"
      @sl-input="handleInput"
      @sl-focus="handleFocus"
      @sl-blur="handleBlur"
      @keydown.down.prevent="focusMenu"
      @keydown.space.stop
      autocomplete="off"
    >
        <sl-icon slot="suffix" name="chevron-down"></sl-icon>
    </sl-input>

    <sl-menu v-if="filteredOptions.length > 0" @sl-select="handleSelect">
      <sl-menu-item v-for="opt in filteredOptions" :key="opt" :value="opt">
        {{ opt }}
      </sl-menu-item>
    </sl-menu>
    <!-- Optional: Show message if no options match? Or just hide menu -->
  </sl-dropdown>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  options: { type: Array, default: () => [] }
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

const handleSelect = (event) => {
  const selectedItem = event.detail.item;
  emit('update:modelValue', selectedItem.value);
  isOpen.value = false;
};

const focusMenu = () => {
    if (!isOpen.value) {
        isOpen.value = true;
        return;
    }
    // Logic to focus first menu item if needed, but standard Tab/Arrow keys might work if menu is focused.
    // Shoelace dropdown might handle arrow keys if trigger is focused? 
    // Usually sl-dropdown manages focus transfer. Let's rely on standard behavior or keep it simple.
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
