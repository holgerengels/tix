<template>
  <wa-select
    hoist
    :multiple="multiple"
    :label="label"
    :required="required"
    :disabled="disabled"
    :value.prop="modelValue || (multiple ? [] : '')"
    :hint="hint"
    @change.stop="onChange"
    @input.stop
  >
    <wa-option v-for="opt in groupOptions" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </wa-option>
  </wa-select>
</template>

<script setup>
import { ref, computed, onMounted, defineProps, defineEmits } from 'vue';
import { useUsersStore } from '../stores/users';

const props = defineProps({
  modelValue: { default: () => [] },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
  options: { type: Array, default: () => [] }
});

const emit = defineEmits(['update:modelValue']);

const usersStore = useUsersStore();
const availableGroups = ref([]);

const groupOptions = computed(() => {
    const raw = [...(props.options || []), ...availableGroups.value];
    return raw.map(opt => typeof opt === 'object' ? opt : { value: opt, label: opt });
});

const onChange = (event) => {
    const val = event.target.value;
    emit('update:modelValue', props.multiple && val === '' ? [] : val);
};

onMounted(async () => {
    try {
        const [groups] = await Promise.all([
            usersStore.fetchGroups ? usersStore.fetchGroups() : [],
            usersStore.fetchUsersByGroup ? usersStore.fetchUsersByGroup([], false) : []
        ]);
        availableGroups.value = groups || [];
    } catch (err) {
        console.error('Failed to fetch groups', err);
    }
});
</script>
