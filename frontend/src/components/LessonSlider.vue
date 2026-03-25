<template>
    <!-- Lessons (Range) -->
    <wa-slider 
      v-if="isRange"
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
import { defineProps, defineEmits } from 'vue';

const props = defineProps({
  isRange: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  indicator: { type: String, default: '' }, // 'from' or 'until'
  modelValue: { required: true } // Number or {min, max}
});

const emit = defineEmits(['update:modelValue']);

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
