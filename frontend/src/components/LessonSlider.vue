<template>
    <!-- Lessons (Range) -->
    <wa-slider 
      v-if="isRange"
      ref="sliderRef"
      :label="label"
      :min="1"
      :max="11"
      :min-value="modelValue?.min || 1"
      :max-value="modelValue?.max || 11"
      :disabled="readonly"
      range
      with-markers
      with-tooltip
      :hint="hint"
      @change="updateRange($event)"
    >
        <span slot="reference" class="tick" v-for="i in 11" :key="'ts'+i">{{ i }}</span>
    </wa-slider>

    <!-- Lesson (Single) -->
    <wa-slider 
      v-else
      ref="sliderRef"
      class="lesson"
      :class="{'single': !indicator}"
      :indicator-offset="indicator === 'until' ? '1' : (indicator === 'from' ? '11' : undefined)"
      :label="label"
      :min="1"
      :max="11"
      :value="modelValue || 1"
      :disabled="readonly"
      with-markers
      with-tooltip
      :hint="hint"
      @change="updateSingle($event)"
    >
        <span slot="reference" class="tick" v-for="i in 11" :key="'ts'+i">{{ i }}</span>
    </wa-slider>
</template>

<script setup>
import { defineProps, defineEmits, ref, onMounted, watch } from 'vue';

// Lesson schedule: index 0 = Stunde 1, etc.
const LESSON_TIMES = [
  { start: '07:50', end: '08:35' },  // 1
  { start: '08:35', end: '09:20' },  // 2
  { start: '09:40', end: '10:25' },  // 3
  { start: '10:25', end: '11:10' },  // 4
  { start: '11:20', end: '12:05' },  // 5
  { start: '12:05', end: '12:50' },  // 6
  { start: '13:35', end: '14:20' },  // 7
  { start: '14:20', end: '15:05' },  // 8
  { start: '15:05', end: '15:50' },  // 9
  { start: '15:50', end: '16:35' },  // 10
  { start: '16:35', end: '17:20' },  // 11
];

const props = defineProps({
  isRange: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  indicator: { type: String, default: '' }, // 'from' or 'until'
  modelValue: { required: true } // Number or {min, max}
});

const emit = defineEmits(['update:modelValue']);
const sliderRef = ref(null);

const applyFormatter = () => {
  const el = sliderRef.value;
  if (!el) return;
  
  el.valueFormatter = (value) => {
    const lesson = LESSON_TIMES[value - 1];
    if (!lesson) return String(value);
    
    if (props.indicator === 'from') return lesson.start;
    if (props.indicator === 'until') return lesson.end;
    return `${lesson.start} – ${lesson.end}`;
  };
};

onMounted(applyFormatter);
watch(() => props.indicator, applyFormatter);

const updateSingle = (event) => {
    emit('update:modelValue', parseFloat(event.target.value));
};

const updateRange = (event) => {
    emit('update:modelValue', { 
        min: parseFloat(event.target.minValue), 
        max: parseFloat(event.target.maxValue) 
    });
};
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
wa-slider::part(label) {
    line-height: 1.5;
}
</style>

