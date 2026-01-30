<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue']);

const availableBadges = [
  { label: 'dringend', color: 'red' },
  { label: 'langfristig', color: 'blue' },
  { label: 'wichtig', color: 'red' },
  { label: 'unwichtig', color: 'blue' },
  { label: 'eskaliert', color: 'red' },
  { label: 'obsolet', color: 'green' },
  { label: 'wartet', color: 'green' }
];

const toggleBadge = (badgeLabel) => {
  const newBadges = [...props.modelValue];
  const index = newBadges.indexOf(badgeLabel);
  if (index === -1) {
    newBadges.push(badgeLabel);
  } else {
    newBadges.splice(index, 1);
  }
  emit('update:modelValue', newBadges);
};

const isSelected = (badgeLabel) => props.modelValue.includes(badgeLabel);

const getVariant = (color) => {
  switch (color) {
    case 'red': return 'danger';
    case 'blue': return 'brand';
    case 'green': return 'success';
    default: return 'neutral';
  }
};
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <wa-badge
      v-for="badge in availableBadges"
      :key="badge.label"
      @click="toggleBadge(badge.label)"
      class="cursor-pointer"
      pill
      :variant="getVariant(badge.color)"
      :appearance="isSelected(badge.label) ? 'filled-outlined' : 'outlined'"
    >
      {{ badge.label }}
    </wa-badge>
  </div>
</template>
