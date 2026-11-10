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
      <wa-time-input 
        v-else-if="field.type === 'Time'"
        step="300" hour-format="24"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value.prop="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-time-input>

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
        <wa-option v-for="opt in selectOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
        </wa-option>
      </wa-select>

      <!-- Group Select -->
      <GroupSelect
        v-else-if="field.type === 'Group'"
        :multiple="field.multiple === true"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :modelValue="modelValue"
        :hint="field.hint"
        :options="field.options"
        @update:modelValue="updateValue"
      />

      <!-- Autocomplete -->
      <WAAutocomplete
        v-else-if="field.type === 'Autocomplete'"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :modelValue="modelValue || ''"
        :hint="field.hint"
        :options="field.options"
        :allowFreetext="field.allowFreetext !== false && field.freetext !== false"
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
        @change="updateValue"
        @update:modelValue="updateValue"
      />

      <!-- User Select -->
      <UserSelect
        v-else-if="field.type === 'User'"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :modelValue="modelValue || ''"
        :hint="field.hint"
        :allowFreetext="field.allowFreetext === true || field.freetext === true"
        :groups="field.groups"
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
import { computed, defineAsyncComponent } from 'vue';
import WAAutocomplete from './WAAutocomplete.vue';
import UserSelect from './UserSelect.vue';
import GroupSelect from './GroupSelect.vue';

const RichTextEditor = defineAsyncComponent(() => import('./RichTextEditor.vue'));
const BadgeEditor = defineAsyncComponent(() => import('./BadgeEditor.vue'));
const ArrayFieldEditor = defineAsyncComponent(() => import('./ArrayFieldEditor.vue'));
const ObjectArrayEditor = defineAsyncComponent(() => import('./ObjectArrayEditor.vue'));
const TimelineDisplay = defineAsyncComponent(() => import('./TimelineDisplay.vue'));
const TerminInput = defineAsyncComponent(() => import('./TerminInput.vue'));
const FileAttachments = defineAsyncComponent(() => import('./FileAttachments.vue'));
const WeekdayInput = defineAsyncComponent(() => import('./WeekdayInput.vue'));
const LessonSlider = defineAsyncComponent(() => import('./LessonSlider.vue'));

const props = defineProps({
  field: { type: Object, required: true },
  context: { type: Object, default: () => ({}) },
  modelValue: { required: true } // Can be String, Number, Boolean, Object, Array
});

const emit = defineEmits(['update:modelValue']);

const updateValue = (val) => {
    emit('update:modelValue', val);
};

const selectOptions = computed(() => {
    return (props.field.options || []).map(opt => typeof opt === 'object' ? opt : { value: opt, label: opt });
});
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
