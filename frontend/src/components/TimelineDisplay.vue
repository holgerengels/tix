<template>
  <div class="timeline-container">
    <label v-if="label" class="timeline-label">{{ label }}</label>
    
    <div class="timeline-wrapper">
      <div 
        v-if="!blocks || blocks.length === 0" 
        class="timeline-empty"
      >
        Keine Daten verfügbar
      </div>
      
      <div v-else class="timeline-track">
        <!-- Render each block proportionally to its duration in minutes -->
        <div 
          v-for="(block, index) in visualBlocks" 
          :key="index"
          class="timeline-block"
          :class="block.status"
          :style="{ flex: block.duration }"
          :title="getTooltip(block)"
        ></div>
        
        <!-- Render explicit requested marker ticks -->
        <div 
          v-for="(marker, index) in visualMarkers"
          :key="'tick-'+index"
          class="timeline-tick"
          :style="{ left: marker.position + '%' }"
          :title="marker.time"
        ></div>
      </div>
      
      <!-- Current time cursor overlay -->
      <div 
        v-if="blocks && blocks.length > 0 && cursorPosition !== null"
        class="timeline-cursor"
        :style="{ left: cursorPosition + '%' }"
        title="Aktuelle Uhrzeit"
      ></div>

      <!-- Labels aligned under the markers -->
      <div class="timeline-labels-container">
        <!-- Start label -->
        <span class="timeline-label-item left" style="left: 0%;">07:50</span>
        
        <span 
          v-for="(marker, index) in visualMarkers"
          :key="'label-'+index"
          class="timeline-label-item"
          :class="marker.align"
          :style="{ left: marker.position + '%' }"
        >{{ marker.time }}</span>

        <!-- End label -->
        <span class="timeline-label-item right" style="left: 100%;">15:05</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  label: { type: String, default: '' },
  blocks: { type: Array, default: () => [] } // Array of { start: Number, end: Number, status: 'free' | 'occupied' }
});

const MIN_START = 7 * 60 + 50; // 07:50 in minutes = 470
const MAX_END = 15 * 60 + 5;   // 15:05 in minutes = 905
const TOTAL_MINUTES = MAX_END - MIN_START;

// --- Current Time Cursor Logic ---
const currentTimeMinutes = ref(0);
let timer = null;

const updateCurrentTime = () => {
  const now = new Date();
  currentTimeMinutes.value = now.getHours() * 60 + now.getMinutes();
};

onMounted(() => {
  updateCurrentTime();
  timer = setInterval(updateCurrentTime, 60000); // 1 minute
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const cursorPosition = computed(() => {
  if (currentTimeMinutes.value < MIN_START || currentTimeMinutes.value > MAX_END) return null;
  return ((currentTimeMinutes.value - MIN_START) / TOTAL_MINUTES) * 100;
});
// ---------------------------------

// Helper to convert HHMM integer to total minutes from midnight
const timeToMinutes = (timeInt) => {
  const tStr = String(timeInt).padStart(4, '0');
  const hours = parseInt(tStr.substring(0, 2), 10);
  const minutes = parseInt(tStr.substring(2, 4), 10);
  return hours * 60 + minutes;
};

// Helper: minutes to HH:MM format
const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const visualBlocks = computed(() => {
  if (!props.blocks || props.blocks.length === 0) return [];
  
  let processed = [];
  
  for (const block of props.blocks) {
    let rawStartMin = timeToMinutes(block.start);
    // End can be null/undefined for "until end of day", fallback to MAX_END if empty or larger
    let rawEndMin = block.end ? timeToMinutes(block.end) : MAX_END;
    
    // Clamp to 7:50 - 15:05
    const startMin = Math.max(MIN_START, rawStartMin);
    const endMin = Math.min(MAX_END, rawEndMin);
    
    const duration = endMin - startMin;
    if (duration > 0) {
      processed.push({
        status: block.status,
        startMin,
        endMin,
        duration
      });
    }
  }
  
  return processed;
});

// Explicit markers requested by user with alignment directions
const markerConfig = [
  { time: '09:20', align: 'right' },
  { time: '09:40', align: 'left' },
  { time: '11:20', align: 'right' },
  { time: '11:40', align: 'left' },
  { time: '12:50', align: 'right' },
  { time: '13:35', align: 'left' }
];

const visualMarkers = computed(() => {
  return markerConfig.map(mc => {
    const [h, m] = mc.time.split(':').map(Number);
    const totalMins = h * 60 + m;
    const position = ((totalMins - MIN_START) / TOTAL_MINUTES) * 100;
    return { time: mc.time, position, align: mc.align };
  }).filter(m => m.position >= 0 && m.position <= 100);
});

const getTooltip = (block) => {
  const statusStr = block.status === 'free' ? 'Frei' : 'Belegt';
  return `${statusStr}: ${minutesToTime(block.startMin)} - ${minutesToTime(block.endMin)}`;
};
</script>

<style scoped>
.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.timeline-label {
  font-size: var(--wa-font-size-m);
  font-weight: 500;
  color: var(--wa-color-neutral-700);
}

.timeline-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.timeline-track {
  display: flex;
  height: 24px;
  background-color: var(--wa-color-neutral-100);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--wa-color-neutral-200);
}

.timeline-empty {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wa-color-neutral-500);
  font-size: 0.875rem;
  background-color: var(--wa-color-neutral-100);
  border-radius: 4px;
  border: 1px dashed var(--wa-color-neutral-300);
}

.timeline-block {
  height: 100%;
}

.timeline-block.free {
  background-color: var(--wa-color-red-70); /* Emerald 200 */
}
.timeline-block.free:hover {
  background-color: var(--wa-color-red-80); /* Emerald 300 */
}

.timeline-block.occupied {
  background-color: var(--wa-color-green-70); /* Red 200 */
}
.timeline-block.occupied:hover {
  background-color: var(--wa-color-green-80); /* Red 300 */
}

/* Static Markers inside the track */
.timeline-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 5;
  pointer-events: none;
}

/* Cursor Element */
.timeline-cursor {
  position: absolute;
  top: -2px;
  height: 28px;
  width: 2px;
  background-color: var(--wa-color-primary-700, #1d4ed8);
  z-index: 10;
  transform: translateX(-50%);
  pointer-events: none;
}
.timeline-cursor::after {
  content: '';
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: inherit;
}

.timeline-labels-container {
  position: relative;
  height: 16px;
  margin-top: 2px;
}

.timeline-label-item {
  position: absolute;
  font-size: 0.65rem;
  color: var(--wa-color-neutral-500);
  top: 0;
  white-space: nowrap;
}

/* Align text relative to the tick mark */
.timeline-label-item.left {
  /* left aligned starting at position */
  transform: translateX(2px);
}

.timeline-label-item.right {
  /* right aligned ending before position */
  transform: translateX(calc(-100% - 2px));
}
</style>
