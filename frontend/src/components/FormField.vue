<template>
  <div class="form-field-content">
      <!-- Date -->
      <wa-input 
        v-if="field.type === 'Date'"
        type="date"
        :label="field.label"
        :required="field.required === true"
        :disabled="field.readonly === true"
        :value="modelValue || ''"
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
        :value="modelValue || ''"
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
        :value="modelValue || (field.multiple ? [] : '')"
        :hint="field.hint"
        @change.stop="updateValue(field.multiple && $event.target.value === '' ? [] : $event.target.value)"
        @input.stop
      >
        <wa-option v-for="opt in field.options" :key="opt" :value="opt">
            {{ opt }}
        </wa-option>
      </wa-select>

      <!-- Autocomplete -->
      <div v-else-if="field.type === 'Autocomplete'">
        <WAAutocomplete
            :label="field.label"
            :required="field.required === true"
            :disabled="field.readonly === true"
            :modelValue="modelValue || ''"
            :hint="field.hint"
            :options="field.options"
            @update:modelValue="updateValue"
        />
      </div>

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
      <div v-else-if="field.type === 'User'">
        <WAAutocomplete class="user"
            :label="field.label"
            :required="field.required === true"
            :disabled="field.readonly === true"
            :modelValue="modelValue || ''"
            :hint="field.hint"
            :options="displayUsers.map(u => u.username)"
            @update:modelValue="updateValue"
        />
      </div>

      <!-- Badges -->
      <BadgeEditor
        v-else-if="field.type === 'Badges'"
        :disabled="field.readonly === true"
        :modelValue="modelValue || []"
        @update:modelValue="updateValue"
      />

      <!-- Lesson (Slider) -->
      <wa-slider v-else-if="field.type === 'Lesson'"
        class="lesson"
        :class="{'single': !field.indicator}"
        :indicator-offset="field.indicator === 'until' ? '1' : (field.indicator === 'from' ? '11' : undefined)"
        :label="field.label"
        :min="1"
        :max="11"
        :value="modelValue"
        :disabled="field.readonly === true"
        with-markers
        with-tooltip
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      >
            <span slot="reference" class="tick">1</span>
            <span slot="reference" class="tick">2</span>
            <span slot="reference" class="tick">3</span>
            <span slot="reference" class="tick">4</span>
            <span slot="reference" class="tick">5</span>
            <span slot="reference" class="tick">6</span>
            <span slot="reference" class="tick">7</span>
            <span slot="reference" class="tick">8</span>
            <span slot="reference" class="tick">9</span>
            <span slot="reference" class="tick">10</span>
            <span slot="reference" class="tick">11</span>
        </wa-slider>

      <!-- Lessons (Slider) -->
      <wa-slider v-else-if="field.type === 'Lessons'"
          :label="field.label"
          :min="1"
          :max="11"
          :min-value="modelValue?.min"
          :max-value="modelValue?.max"
          :disabled="field.readonly === true"
          range
          with-markers
          with-tooltip
          :hint="field.hint"
          @change="updateValue({ min: $event.target.minValue, max: $event.target.maxValue })"
        >
            <span slot="reference" class="tick">1</span>
            <span slot="reference" class="tick">2</span>
            <span slot="reference" class="tick">3</span>
            <span slot="reference" class="tick">4</span>
            <span slot="reference" class="tick">5</span>
            <span slot="reference" class="tick">6</span>
            <span slot="reference" class="tick">7</span>
            <span slot="reference" class="tick">8</span>
            <span slot="reference" class="tick">9</span>
            <span slot="reference" class="tick">10</span>
            <span slot="reference" class="tick">11</span>
        </wa-slider>

      <!-- Boolean -->
      <wa-checkbox
        v-else-if="field.type === 'Boolean'"
        :checked="modelValue === true"
        :disabled="field.readonly === true"
        :required="field.required === true"
        :hint="field.hint"
        @wa-change="updateValue($event.target.checked)"
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
        :value="modelValue || ''"
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
        :value="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>

      <!-- Weekday -->
      <div v-else-if="field.type === 'Weekday'" class="weekday-group">
        <label v-if="field.label" class="weekday-label">{{ field.label }}</label>
        <wa-button-group>
            <wa-button 
                v-for="day in ['Mo', 'Di', 'Mi', 'Do', 'Fr']" 
                :key="day"
                pill
                size="small"
                variant="brand"
                :appearance="modelValue === day ? 'accent' : 'filled-outlined'"
                :disabled="field.readonly === true"
                @click="updateValue(modelValue === day ? null : day)"
            >
                {{ day }}
            </wa-button>
        </wa-button-group>
      </div>

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
        :ticketId="context?._id"
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
        :value="modelValue || ''"
        :hint="field.hint"
        @change="updateValue($event.target.value)"
      ></wa-input>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref, watch, computed } from 'vue';
import axios from 'axios';
import RichTextEditor from './RichTextEditor.vue';
import WAAutocomplete from './WAAutocomplete.vue';
import BadgeEditor from './BadgeEditor.vue';
import ArrayFieldEditor from './ArrayFieldEditor.vue';
import TimelineDisplay from './TimelineDisplay.vue';
import TerminInput from './TerminInput.vue';
import FileAttachments from './FileAttachments.vue';

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
const users = ref([]);

const fetchUsers = async () => {
    if (props.field.type !== 'User') return;
    
    try {
        const groups = props.field.groups || [];
        const groupsParam = groups.join(',');

        const res = await axios.get('/api/users', {
            params: { groups: groupsParam },
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        users.value = res.data;
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

// Initialize Default Values for Sliders if empty
watch(() => props.field.type, (newType) => {
    if (props.modelValue == null) {
        if (newType === 'Lesson') {
            updateValue(1);
        } else if (newType === 'Lessons') {
            updateValue({ min: 1, max: 11 });
        }
    }
}, { immediate: true });

</script>

<style scoped>
.tick {
  width: 2ch;
  text-align: center;
}
wa-slider {
    margin: 0 1rem;
}
.single::part(indicator) {
    background-color: unset;
}
.weekday-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}
.weekday-label {
    font-size: 1rem;
    font-weight: 500;
    color: var(--wa-color-neutral-700);
}
</style>
