<template>
  <WAAutocomplete
    class="user"
    :label="label"
    :required="required"
    :disabled="disabled"
    :modelValue="modelValue"
    :hint="hint"
    :allowFreetext="allowFreetext"
    :options="userOptions"
    @update:modelValue="$emit('update:modelValue', $event)"
  />
</template>

<script setup>
import { ref, computed, watch, defineProps, defineEmits } from 'vue';
import WAAutocomplete from './WAAutocomplete.vue';
import { useUsersStore } from '../stores/users';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  allowFreetext: { type: Boolean, default: false },
  groups: { type: Array, default: () => [] }
});

defineEmits(['update:modelValue']);

const usersStore = useUsersStore();
const users = ref([]);

const fetchUsers = async () => {
    try {
        users.value = await usersStore.fetchUsersByGroup(props.groups || [], false);
    } catch (err) {
        console.error('Failed to fetch users', err);
    }
};

const userOptions = computed(() => {
    const base = users.value.map(u => ({ value: u.username, label: u.displayName || u.username }));
    const currentValue = props.modelValue;
    if (currentValue && !base.some(opt => opt.value === currentValue)) {
        base.push({ value: currentValue, label: currentValue });
    }
    return base;
});

watch(
    () => (props.groups || []).join(','),
    () => {
        fetchUsers();
    },
    { immediate: true }
);
</script>
