<template>
  <wa-dropdown
    ref="dropdownRef"
    class="autocomplete-dropdown"
    :open="isOpen && filteredOptions.length > 0"
    @wa-after-show.stop="handleAfterShow"
    @wa-after-hide.stop="handleAfterHide"
    @wa-select.stop="handleDropdownSelect"
    hoist
  >
    <wa-input
      ref="inputRef"
      slot="trigger"
      :label="label"
      :value="displayValue"
      :required="required"
      :disabled="disabled"
      @click.stop="openDropdown(true)"
      @input="handleInput"
      @blur="handleBlur"
      @keydown.down.prevent="focusMenu"
      @keydown.space.stop
      autocomplete="off"
      :hint="hint"
    >
        <wa-icon slot="suffix" name="chevron-down" @click.stop="toggleDropdown"></wa-icon>
    </wa-input>

    <div v-if="isOpen && filteredOptions.length > 0" class="dropdown-list" @mousedown.prevent>
      <wa-dropdown-item v-for="opt in filteredOptions" :key="optValue(opt)" :value="optValue(opt)" @click="selectOption(opt)">
        {{ optLabel(opt) }}
      </wa-dropdown-item>
    </div>
  </wa-dropdown>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  options: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  allowFreetext: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

const dropdownRef = ref(null);
const inputRef = ref(null);
const isOpen = ref(false);
const searchText = ref('');
// wa-dropdown focuses item 0 after opening; restore input focus unless opened via ArrowDown
let keepInputFocus = false;

const optValue = (opt) => typeof opt === 'object' ? opt.value : opt;
const optLabel = (opt) => typeof opt === 'object' ? opt.label : opt;
const getEl = (r) => r.value?.$el || r.value;

const displayValue = computed(() => {
    if (searchText.value !== '') return searchText.value;
    if (!props.modelValue) return '';
    const match = props.options.find(opt => optValue(opt) === props.modelValue);
    return match ? optLabel(match) : props.modelValue;
});

const filteredOptions = computed(() => {
    if (!isOpen.value) return [];
    const query = searchText.value.toLowerCase();
    if (!query) return props.options;
    return props.options.filter(opt => optLabel(opt).toLowerCase().includes(query));
});

const openDropdown = (keepFocus = true) => {
    if (isOpen.value || props.disabled || props.options.length === 0) return;
    keepInputFocus = keepFocus;
    isOpen.value = true;
};

const toggleDropdown = () => {
    if (isOpen.value) {
        isOpen.value = false;
    } else {
        openDropdown(true);
    }
};

const handleAfterShow = () => {
    if (keepInputFocus) {
        keepInputFocus = false;
        getEl(inputRef)?.focus?.();
    }
};

const handleAfterHide = () => {
    // Keep isOpen true if closed transiently because searchText matched 0 options
    if (isOpen.value && filteredOptions.value.length === 0 && searchText.value) return;
    isOpen.value = false;
};

const handleDropdownSelect = (event) => {
    if (!isOpen.value) return;
    const item = event?.detail?.item;
    const match = item && props.options.find(opt => optValue(opt) === item.value);
    if (match) selectOption(match);
};

const handleInput = (event) => {
    const val = event.target.value;
    searchText.value = val;
    const match = props.options.find(opt => optLabel(opt).toLowerCase() === val.toLowerCase());
    if (match) {
        emit('update:modelValue', optValue(match));
    } else {
        emit('update:modelValue', props.allowFreetext ? val : '');
    }
    if (val.length >= 3) {
        openDropdown(true);
    }
};

const handleBlur = (event) => {
    const related = event?.relatedTarget;
    const dropdownEl = getEl(dropdownRef);
    if (related && typeof dropdownEl?.contains === 'function' && dropdownEl.contains(related)) {
        return;
    }

    if (searchText.value) {
        const lowerVal = searchText.value.toLowerCase().trim();
        const match = props.options.find(opt => optLabel(opt).toLowerCase() === lowerVal);
        if (match) {
            emit('update:modelValue', optValue(match));
            searchText.value = '';
        } else if (!props.allowFreetext) {
            searchText.value = '';
            emit('update:modelValue', '');
        } else {
            emit('update:modelValue', searchText.value);
        }
    } else if (!props.modelValue) {
        emit('update:modelValue', '');
    }

    setTimeout(() => {
        isOpen.value = false;
    }, 150);
};

const selectOption = (option) => {
    keepInputFocus = false;
    emit('update:modelValue', optValue(option));
    searchText.value = '';
    isOpen.value = false;
};

const focusMenu = () => {
    if (!isOpen.value) {
        openDropdown(false);
        return;
    }
    const dropdownEl = getEl(dropdownRef);
    const firstItem = typeof dropdownEl?.querySelector === 'function'
        ? dropdownEl.querySelector('.dropdown-list > :not([disabled])')
        : null;
    firstItem?.focus?.();
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
