<template>
  <div class="form-field-content">
      <!-- Date -->
      <wa-input 
        v-if="field.type === 'Date'"
        type="date"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>

      <!-- Time -->
      <wa-input 
        v-else-if="field.type === 'Time'"
        type="time"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>

      <!-- Email -->
      <wa-input 
        v-else-if="field.type === 'Email'"
        type="email"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>

      <!-- Select -->
      <wa-select
        v-else-if="field.type === 'Select'"
        hoist
        :multiple="field.multiple === true"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || (field.multiple ? [] : '')"
        :hint="field.hint"
        @change.stop="updateValue(field.multiple && $event.target.value === '' ? [] : $event.target.value)"
        @input.stop
      >
        <wa-option v-for="opt in field.options" :key="opt" :value="opt">
            {{ opt }}
        </wa-option>
      </wa-select>

      <!-- Autocomplete -->
      <WAAutocomplete
        v-else-if="field.type === 'Autocomplete'"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :modelValue="modelValue || ''"
        :hint="field.hint"
        :options="field.options"
        @update:modelValue="updateValue"
      />

      <!-- Rich Text -->
      <RichTextEditor
        v-else-if="field.type === 'RichText'"
        :label="field.label"
        :disabled="field.readonly === true"
        :required="field.required === true"
        :modelValue="modelValue || ''"
        :hint="field.hint"
        @update:modelValue="updateValue"
      />

      <!-- User Select -->
      <WAAutocomplete class="user"
        v-else-if="field.type === 'User'"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :modelValue="modelValue || ''"
        :hint="field.hint"
        :options="displayUsers.map(u => ({ value: u.username, label: u.displayName || u.username }))"
        @update:modelValue="updateValue"
      />

      <!-- Badges -->
      <BadgeEditor
        v-else-if="field.type === 'Badges'"
        :disabled="field.readonly === true"
        :modelValue="modelValue || []"
        @update:modelValue="updateValue"
      />

      <!-- Lesson / Lessons -->
      <LessonSlider
        v-else-if="field.type === 'Lesson' || field.type === 'Lessons'"
        :label="field.label"
        :isRange="field.type === 'Lessons'"
        :readonly="field.readonly === true"
        :hint="field.hint"
        :indicator="field.indicator"
        :modelValue="modelValue"
        @update:modelValue="updateValue"
      />

      <!-- Boolean -->
      <wa-checkbox
        v-else-if="field.type === 'Boolean'"
        :defaultChecked="modelValue === true ? true : undefined"
        :checked="modelValue === true ? true : undefined"
        :disabled="field.readonly === true"
        :required="field.required === true"
        :hint="field.hint"
        @change="updateValue($event.target.checked)"
      >{{ field.label }}</wa-checkbox>

      <!-- Integer -->
      <wa-input 
        v-else-if="field.type === 'Integer'"
        type="number"
        step="1"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>

      <!-- Decimal -->
      <wa-input 
        v-else-if="field.type === 'Decimal'"
        type="number"
        step="any"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>

      <!-- Weekday -->
      <WeekdayInput
        v-else-if="field.type === 'Weekday'"
        :label="field.label"
        :readonly="field.readonly === true"
        :modelValue="modelValue"
        @update:modelValue="updateValue"
      />

      <!-- ObjectArray -->
      <ObjectArrayEditor
        v-else-if="field.type === 'ObjectArray'"
        :field="field"
        :context="context"
        :modelValue="modelValue || []"
        @update:modelValue="updateValue"
      />

      <!-- Array -->
      <ArrayFieldEditor
        v-else-if="field.type === 'Array'"
        :field="field"
        :modelValue="modelValue || []"
        @update:modelValue="updateValue"
      />

      <!-- Timeline -->
      <TimelineDisplay
        v-else-if="field.type === 'Timeline'"
        :label="field.label"
        :blocks="modelValue || []"
      />

      <!-- Termin (Interactive Calendar Selection) -->
      <TerminInput
        v-else-if="field.type === 'Termin'"
        :label="field.label"
        :date="context?.date"
        :readonly="field.readonly === true"
        :modelValue="modelValue || null"
        @update:modelValue="updateValue"
      />

      <!-- Attachments -->
      <FileAttachments
        v-else-if="field.type === 'Attachments'"
        :readonly="field.readonly === true"
        :label="field.label"
        :modelValue="modelValue || []"
        @update:modelValue="updateValue"
      />

       <!-- Standard Text -->
      <wa-input 
        v-else
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, watch, computed } from 'vue';
import RichTextEditor from './RichTextEditor.vue';
import WAAutocomplete from './WAAutocomplete.vue';
import BadgeEditor from './BadgeEditor.vue';
import ArrayFieldEditor from './ArrayFieldEditor.vue';
import ObjectArrayEditor from './ObjectArrayEditor.vue';
import TimelineDisplay from './TimelineDisplay.vue';
import TerminInput from './TerminInput.vue';
import FileAttachments from './FileAttachments.vue';
import WeekdayInput from './WeekdayInput.vue';
import LessonSlider from './LessonSlider.vue';
import { useUsersStore } from '../stores/users';

const props = defineProps({
  field: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  modelValue: { required: true } // Can be String, Number, Boolean, Object, Array
});

const emit = defineEmits(['update:modelValue']);

const updateValue = (val) => {
    emit('update:modelValue', val);
};

// User Handling
const usersStore = useUsersStore();
const users = ref([]);

const fetchUsers = async () => {
    if (props.field.type !== 'User') return;
    
    try {
        const groups = props.field.groups || [];
        users.value = await usersStore.fetchUsersByGroup(groups, false);
    } catch (err) {
        console.error("Failed to fetch users", err);
    }
};

const displayUsers = computed(() => {
    if (props.field.type !== 'User') return [];

    // 1. Start with all fetched users
    let displayUsers = [...users.value];

    // Filter by field groups if defined (already done by backend mostly, but double check)
    // Actually backend handles ?groups=... param so usually users is already filtered.
    
    // 2. Check if current value exists
    const currentValue = props.modelValue;
    if (currentValue) {
        // 3. If current value is not in the list, add it partially
        const exists = displayUsers.find(u => u.username === currentValue);
        if (!exists) {
            displayUsers.push({ username: currentValue });
        }
    }
    return displayUsers;
});

const userGroupsKey = computed(() => {
    if (props.field.type !== 'User') return null;
    return (props.field.groups || []).join(',');
});

// Fetch users if needed when field definition changes or mostly on mount
watch(userGroupsKey, () => {
    if (props.field.type === 'User') {
        fetchUsers();
    }
}, { immediate: true });

// Initialize Default Values if empty
watch(() => [props.field.type, props.field.default], ([newType, newDefault]) => {
    if (props.modelValue === undefined) {
        if (newDefault !== undefined) {
            updateValue(newDefault);
        } else if (newType === 'Lesson') {
            updateValue(1);
        } else if (newType === 'Lessons') {
            updateValue({ min: 1, max: 11 });
        }
    }
}, { immediate: true });

</script>

<style scoped>
</style>

<style>
/* Fix alignment between Ort and Kategorie labels (ensuring all labels have the exact same line height across components) */
wa-input::part(label),
wa-select::part(label),
wa-slider::part(label),
wa-checkbox::part(label),
.weekday-label {
    line-height: 1.5;
}
</style>
