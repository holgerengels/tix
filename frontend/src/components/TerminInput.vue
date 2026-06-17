<template>
  <div class="termin-input">
    <label v-if="label" class="termin-label">{{ label }}</label>
    
    <div v-if="readonly" class="termin-readonly">
      <div v-if="!modelValue || !modelValue.room" class="termin-empty">
        Kein Raum gebucht.
      </div>
      <div v-else class="termin-readonly-value">
        <div class="readonly-room">{{ modelValue.room }}</div>
        <div class="readonly-time">{{ modelValue.start }} - {{ modelValue.end }} Uhr</div>
      </div>
    </div>

    <template v-else>
      <div v-if="!date" class="termin-empty">
        Bitte wähle zuerst ein Datum aus.
      </div>
      
      <div v-else-if="loading" class="termin-loading">
        Termine werden geladen...
      </div>

      <div v-else class="termin-calendars-wrapper">
        <div class="termin-calendars" ref="scrollContainer" @wheel="onScrollWheel">
          <div v-for="room in calendars" :key="room" class="calendar-row">
            <div class="calendar-name">{{ room }}</div>
            
            <div class="timeline-track" 
                 @click="onTrackClick($event, room)"
                 @touchend.prevent="onTrackTap($event, room)"
                 :data-room="room"
                 ref="tracks">
                 
              <!-- Render occupied blocks (red) -->
              <div v-for="(block, idx) in filteredAvailability[room]" :key="'occ-'+idx"
                   class="timeline-block occupied"
                   :style="{ left: getPositionPercent(block.startMin) + '%', width: getWidthPercent(block.startMin, block.endMin) + '%' }"
                   :title="`Belegt: ${minutesToTime(block.startMin)} - ${minutesToTime(block.endMin)}${block.ticketId ? ' (Ticket: ' + block.ticketId + ')' : ''}`">
                   <div class="occupied-time" v-if="block.ticketId">
                     {{ block.ticketId }}
                   </div>
              </div>
              
              <!-- Render interactive selection block (green) -->
              <div v-if="selection && selection.room === room"
                   class="timeline-block selection"
                   :style="{ left: getPositionPercent(selection.startMin) + '%', width: getWidthPercent(selection.startMin, selection.endMin) + '%' }"
                   @mousedown.left.stop="startDrag($event)"
                   @touchstart.stop.prevent="startDrag($event)"
                   @click.stop>
                   
                   <div class="selection-time">
                     {{ minutesToTime(selection.startMin) }} - {{ minutesToTime(selection.endMin) }}
                   </div>
                   
                   <!-- Right edge resize handle -->
                   <div class="resize-handle" @mousedown.left.stop="startResize($event)" @touchstart.stop.prevent="startResize($event)"></div>
              </div>
              
              <!-- Render explicit requested marker ticks (behind everything) -->
              <div v-for="(marker, index) in visualMarkers"
                   :key="'tick-'+index"
                   class="timeline-tick"
                   :style="{ left: marker.position + '%' }"
                   :title="marker.time">
              </div>
            </div>
          </div>
          
          <!-- Labels aligned under the timeline tracks -->
          <div class="timeline-labels-row">
            <div class="calendar-name-spacer"></div>
            <div class="timeline-labels-container">
              <span class="timeline-label-item left" style="left: 0%;">{{ minutesToTime(MIN_START) }}</span>
              <span v-for="(marker, index) in visualMarkers"
                    :key="'label-'+index"
                    class="timeline-label-item"
                    :class="marker.align"
                    :style="{ left: marker.position + '%' }">
                {{ marker.time }}
              </span>
              <span class="timeline-label-item right" style="left: 100%;">{{ minutesToTime(MAX_END) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';

const props = defineProps({
  label: { type: String, default: '' },
  date: { type: String, default: null }, // YYYY-MM-DD
  readonly: { type: Boolean, default: false },
  modelValue: { type: Object, default: () => null } // { room: "Raum 1", start: "09:00", end: "10:00" }
});

const emit = defineEmits(['update:modelValue']);

const MIN_START = 7 * 60 + 50; // 07:50
const MAX_END = 20 * 60;       // 20:00
const TOTAL_MINUTES = MAX_END - MIN_START;
const DEFAULT_DURATION = 45; // Minutes
const SNAP_MINUTES = 5;

// Data state
const loading = ref(false);
const availability = ref({});
const selection = ref(null); // { room, startMin, endMin }
const tracks = ref([]); 
const scrollContainer = ref(null);
const initialValue = ref(null); // Stores the initial modelValue to exclude own event from availability

// Filter out the block matching the initial (existing) booking so the own event is not treated as occupied
const filteredAvailability = computed(() => {
  const iv = initialValue.value;
  if (!iv) return availability.value;

  const result = {};
  for (const room in availability.value) {
    if (room === iv.room) {
      result[room] = availability.value[room].filter(b =>
        !(b.startMin === iv.startMin && b.endMin === iv.endMin)
      );
    } else {
      result[room] = availability.value[room];
    }
  }
  return result;
});

const calendars = computed(() => Object.keys(availability.value));

// Static Markers
const markerConfig = [
  { time: '09:20', align: 'right' },
  { time: '09:40', align: 'left' },
  { time: '11:10', align: 'right' },
  { time: '11:20', align: 'left' },
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

// Helpers
const timeToMinutes = (timeInt) => {
  const tStr = String(timeInt).padStart(4, '0');
  const hours = parseInt(tStr.substring(0, 2), 10);
  const minutes = parseInt(tStr.substring(2, 4), 10);
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getPositionPercent = (mins) => {
  return Math.max(0, Math.min(100, ((mins - MIN_START) / TOTAL_MINUTES) * 100));
};

const getWidthPercent = (startMin, endMin) => {
  const duration = endMin - startMin;
  return Math.max(0, Math.min(100, (duration / TOTAL_MINUTES) * 100));
};

// Fetch data
const fetchAvailability = async () => {
  if (!props.date) {
    availability.value = {};
    return;
  }
  
  loading.value = true;
  try {
    const res = await fetch(`/api/caldav/availability?date=${props.date}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}` // Adjust based on your auth
      }
    });
    if (res.ok) {
      const data = await res.json();
      // Pre-process occupied blocks to minutes
      for (const room in data) {
        data[room] = data[room].map(b => ({
          ...b,
          startMin: timeToMinutes(b.start),
          endMin: timeToMinutes(b.end)
        }));
      }
      availability.value = data;
    }
  } catch (err) {
    console.error("Failed to fetch availability", err);
  } finally {
    loading.value = false;
  }
};

watch(() => props.date, fetchAvailability, { immediate: true });

// Sync modelValue => local selection
watch(() => props.modelValue, (newVal) => {
  if (newVal && newVal.room && newVal.start && newVal.end) {
    const sel = {
      room: newVal.room,
      startMin: timeToMinutes(newVal.start.replace(':', '')),
      endMin: timeToMinutes(newVal.end.replace(':', ''))
    };
    selection.value = sel;

    // Store the first non-null value as the initial booking to exclude from availability
    if (!initialValue.value) {
      initialValue.value = { ...sel };
    }
  } else {
    selection.value = null;
  }
}, { deep: true, immediate: true });

const emitSelection = () => {
  if (selection.value) {
    emit('update:modelValue', {
      room: selection.value.room,
      start: minutesToTime(selection.value.startMin),
      end: minutesToTime(selection.value.endMin)
    });
  } else {
    emit('update:modelValue', null);
  }
};

// --- Interactions ---

// Unified helper: extract clientX/clientY from mouse or touch event
const getClientXY = (e) => {
  if (e.touches && e.touches.length > 0) return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length > 0) return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  return { clientX: e.clientX, clientY: e.clientY };
};

// Convert mouse/touch X relative to track into Minutes
const getMinutesFromMouseEvent = (e) => {
  const trackElement = e.currentTarget.classList.contains('timeline-track') ? e.currentTarget : e.currentTarget.closest('.timeline-track');
  const rect = trackElement.getBoundingClientRect();
  const { clientX } = getClientXY(e);
  const x = clientX - rect.left;
  const percent = x / rect.width;
  let rawMins = MIN_START + (percent * TOTAL_MINUTES);
  
  // Snap to nearest SNAP_MINUTES
  const snappedMins = Math.round(rawMins / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(MIN_START, Math.min(MAX_END, snappedMins));
};

// Calculate next free block start
const findClosestAllowedSlot = (room, targetStartMin, duration) => {
  const blocks = filteredAvailability.value[room] || [];
  
  const isAvailable = (s) => {
    const e = s + duration;
    if (s < MIN_START || e > MAX_END) return false;
    return !blocks.some(b => 
      (s >= b.startMin && s < b.endMin) || 
      (e > b.startMin && e <= b.endMin) ||
      (s <= b.startMin && e >= b.endMin)
    );
  };

  if (isAvailable(targetStartMin)) {
    return { startMin: targetStartMin, endMin: targetStartMin + duration };
  }
  
  // Search left and right for nearest allowed slot
  let offset = SNAP_MINUTES;
  while (true) {
    const leftStart = targetStartMin - offset;
    const rightStart = targetStartMin + offset;
    const canGoLeft = leftStart >= MIN_START;
    const canGoRight = rightStart + duration <= MAX_END;
    
    if (!canGoLeft && !canGoRight) return null; // No space anywhere
    
    // Check left first
    if (canGoLeft && isAvailable(leftStart)) {
      return { startMin: leftStart, endMin: leftStart + duration };
    }
    if (canGoRight && isAvailable(rightStart)) {
      return { startMin: rightStart, endMin: rightStart + duration };
    }
    offset += SNAP_MINUTES;
  }
};

const onTrackClick = (e, room) => {
  // Ignore clicks if they started on the selection block (handled by drag)
  if (e.target.closest('.selection')) return;

  const clickMins = getMinutesFromMouseEvent(e);
  const slot = findClosestAllowedSlot(room, clickMins, DEFAULT_DURATION);
  
  if (slot) {
    selection.value = {
      room,
      startMin: slot.startMin,
      endMin: slot.endMin
    };
    emitSelection();
  }
};

// Touch tap on track (uses changedTouches for position since touchend has no touches)
const onTrackTap = (e, room) => {
  if (e.target.closest('.selection')) return;
  if (isDragging || isResizing) return; // Ignore if we just finished a drag/resize

  const trackEl = e.currentTarget;
  const rect = trackEl.getBoundingClientRect();
  const { clientX } = getClientXY(e);
  const x = clientX - rect.left;
  const percent = x / rect.width;
  let rawMins = MIN_START + (percent * TOTAL_MINUTES);
  const snappedMins = Math.round(rawMins / SNAP_MINUTES) * SNAP_MINUTES;
  const clickMins = Math.max(MIN_START, Math.min(MAX_END, snappedMins));

  const slot = findClosestAllowedSlot(room, clickMins, DEFAULT_DURATION);
  if (slot) {
    selection.value = {
      room,
      startMin: slot.startMin,
      endMin: slot.endMin
    };
    emitSelection();
  }
};

// --- Horizontal Scroll conversion ---
const onScrollWheel = (e) => {
  if (e.deltaY !== 0) {
    e.preventDefault();
    if (scrollContainer.value) {
      scrollContainer.value.scrollLeft += e.deltaY;
    }
  }
};

// --- Drag and Drop (Custom JS) ---
let isDragging = false;
let dragOffsetMins = 0;
let dragDuration = 0;

let scrollInterval = null;
let lastPointerEvent = null;

const startAutoScroll = (direction) => {
  if (scrollInterval) return;
  scrollInterval = setInterval(() => {
    if (!scrollContainer.value) return;
    scrollContainer.value.scrollLeft += direction * 8;
    
    // Trigger updates while scrolling with fixed pointer
    if (lastPointerEvent) {
      if (isDragging) {
        const elements = document.elementsFromPoint(lastPointerEvent.clientX, lastPointerEvent.clientY);
        const trackEl = elements.find(el => el.classList && el.classList.contains('timeline-track'));
        let targetRoom = selection.value.room;
        if (trackEl) {
          targetRoom = trackEl.dataset.room;
        }
        updateDragPosition(lastPointerEvent.clientX, targetRoom);
      } else if (isResizing) {
        updateResizePosition(lastPointerEvent.clientX);
      }
    }
  }, 16);
};

const stopAutoScroll = () => {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
};

const checkAutoScroll = (clientX) => {
  if (!scrollContainer.value) return;
  const rect = scrollContainer.value.getBoundingClientRect();
  const stickyWidth = 100; // room name sticky column width
  const threshold = 50;
  
  const leftEdge = rect.left + stickyWidth;
  const rightEdge = rect.right;
  
  if (clientX > rightEdge - threshold) {
    startAutoScroll(1);
  } else if (clientX < leftEdge + threshold) {
    startAutoScroll(-1);
  } else {
    stopAutoScroll();
  }
};

const updateDragPosition = (clientX, targetRoom) => {
  const currentTrackEl = tracks.value.find(t => t.dataset && t.dataset.room === selection.value.room) || tracks.value[0];
  if (!currentTrackEl) return;
  const trackRect = currentTrackEl.getBoundingClientRect();
  
  const x = clientX - trackRect.left;
  const percent = x / trackRect.width;
  const rawMins = MIN_START + (percent * TOTAL_MINUTES);
  
  const intendedStartMin = rawMins - dragOffsetMins;
  const snappedStartMin = Math.round(intendedStartMin / SNAP_MINUTES) * SNAP_MINUTES;
  const clampedStartMin = Math.max(MIN_START, Math.min(MAX_END - dragDuration, snappedStartMin));
  
  const slot = findClosestAllowedSlot(targetRoom, clampedStartMin, dragDuration);
  if (slot) {
    selection.value.room = targetRoom;
    selection.value.startMin = slot.startMin;
    selection.value.endMin = slot.endMin;
  }
};

const startDrag = (e) => {
  if (e.target.closest('.resize-handle')) return;
  if (e.cancelable) e.preventDefault();
  
  isDragging = true;
  dragDuration = selection.value.endMin - selection.value.startMin;
  
  const { clientX, clientY } = getClientXY(e);
  lastPointerEvent = { clientX, clientY };
  
  const currentTrackEl = tracks.value.find(t => t.dataset && t.dataset.room === selection.value.room) || tracks.value[0];
  if (!currentTrackEl) return;
  const trackRect = currentTrackEl.getBoundingClientRect();
  const clickPercent = (clientX - trackRect.left) / trackRect.width;
  const clickMins = MIN_START + (clickPercent * TOTAL_MINUTES);
  dragOffsetMins = clickMins - selection.value.startMin;
  
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEndCustom);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEndCustom);
  document.body.style.userSelect = 'none';
};

const onDragMove = (e) => {
  if (!isDragging || !selection.value) return;
  if (e.cancelable) e.preventDefault(); // Prevent scrolling during drag
  
  const { clientX, clientY } = getClientXY(e);
  lastPointerEvent = { clientX, clientY };
  
  const elements = document.elementsFromPoint(clientX, clientY);
  const trackEl = elements.find(el => el.classList && el.classList.contains('timeline-track'));
  
  let targetRoom = selection.value.room;
  if (trackEl) {
    targetRoom = trackEl.dataset.room;
  }
  
  updateDragPosition(clientX, targetRoom);
  checkAutoScroll(clientX);
};

const onDragEndCustom = () => {
  if (isDragging) {
    isDragging = false;
    stopAutoScroll();
    lastPointerEvent = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEndCustom);
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('touchend', onDragEndCustom);
    document.body.style.userSelect = '';
    emitSelection();
  }
};

// --- Resizing ---
let isResizing = false;

const updateResizePosition = (clientX) => {
  const currentTrackEl = tracks.value.find(t => t.dataset && t.dataset.room === selection.value.room) || tracks.value[0];
  if (!currentTrackEl) return;
  const trackRect = currentTrackEl.getBoundingClientRect();
  
  const x = clientX - trackRect.left;
  const percent = x / trackRect.width;
  const rawMins = MIN_START + (percent * TOTAL_MINUTES);
  
  let intendedEndMin = Math.round(rawMins / SNAP_MINUTES) * SNAP_MINUTES;
  
  // Constrain to MAX_END and at least 5 mins duration
  intendedEndMin = Math.min(MAX_END, Math.max(selection.value.startMin + SNAP_MINUTES, intendedEndMin));

  // Check conflicts
  const room = selection.value.room;
  const blocks = filteredAvailability.value[room] || [];
  
  // Disallow resize over an occupied block. Max allowed end is the start of the next block.
  const nextBlock = blocks.filter(b => b.startMin >= selection.value.startMin)
                          .sort((a, b) => a.startMin - b.startMin)[0];
  
  if (nextBlock && intendedEndMin > nextBlock.startMin) {
    intendedEndMin = nextBlock.startMin;
  }

  selection.value.endMin = intendedEndMin;
};

const startResize = (e) => {
  isResizing = true;
  if (e.cancelable) e.preventDefault();
  const { clientX, clientY } = getClientXY(e);
  lastPointerEvent = { clientX, clientY };
  
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
  document.addEventListener('touchmove', onResizeMove, { passive: false });
  document.addEventListener('touchend', onResizeEnd);
};

const onResizeMove = (e) => {
  if (!isResizing || !selection.value) return;
  if (e.cancelable) e.preventDefault(); // Prevent scrolling during resize
  
  const { clientX, clientY } = getClientXY(e);
  lastPointerEvent = { clientX, clientY };
  
  updateResizePosition(clientX);
  checkAutoScroll(clientX);
};

const onResizeEnd = () => {
  if (isResizing) {
    isResizing = false;
    stopAutoScroll();
    lastPointerEvent = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
    document.removeEventListener('touchmove', onResizeMove);
    document.removeEventListener('touchend', onResizeEnd);
    emitSelection();
  }
};

</script>

<style scoped>
.termin-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.termin-label {
  font-size: var(--wa-font-size-m);
  font-weight: 500;
  color: var(--wa-color-neutral-20);
}

.termin-empty, .termin-loading, .termin-readonly {
  background: var(--wa-color-neutral-90);
  border: 1px dashed var(--wa-color-neutral-60);
  padding: 1rem;
  border-radius: 4px;
  text-align: center;
  color: var(--wa-color-neutral-40);
  font-size: 0.875rem;
}

.termin-readonly {
  border: 1px solid var(--wa-color-neutral-70);
  background: var(--wa-color-neutral-80);
  display: flex;
  align-items: center;
  justify-content: center;
}

.termin-readonly-value {
  display: flex;
  gap: 1rem;
  align-items: baseline;
}

.readonly-room {
  font-weight: 600;
  color: var(--wa-color-neutral-15);
}

.readonly-time {
  color: var(--wa-color-neutral-30);
  font-size: 0.9em;
}

.termin-calendars-wrapper {
  border: 1px solid var(--wa-color-neutral-70);
  border-radius: var(--wa-border-radius-medium);
  background: var(--wa-color-neutral-95);
  overflow: hidden;
}

.termin-calendars {
  overflow-x: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  scroll-behavior: smooth;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
}

.calendar-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: max-content;
}

.calendar-name {
  width: 100px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--wa-color-neutral-20);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  background: var(--wa-color-neutral-95);
  z-index: 15;
  padding-right: 0.5rem;
}

.timeline-track {
  position: relative;
  width: 1200px;
  height: 28px;
  background-color: var(--wa-color-neutral-80);
  border-radius: 4px;
  border: 1px solid var(--wa-color-neutral-70);
  cursor: pointer;
  flex-shrink: 0;
}

.timeline-block {
  position: absolute;
  top: 0;
  bottom: 0;
  height: 100%;
}

.timeline-block.occupied {
  background-color: rgba(239, 68, 68, 0.4); /* Red */
  border: 1px solid rgba(239, 68, 68, 0.8);
  pointer-events: none; /* Let clicks pass through */
  display: flex;
  align-items: center;
  justify-content: center;
}

.occupied-time {
  font-size: 0.6rem;
  color: rgba(185, 28, 28, 0.95); /* Darker red for good readability */
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 4px;
}

.timeline-block.selection {
  background-color: rgba(34, 197, 94, 0.7); /* Green */
  border: 1px solid rgb(21, 128, 61);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  cursor: grab;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}

.timeline-block.selection:active {
  cursor: grabbing;
}

.selection-time {
  font-size: 0.6rem;
  color: white;
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  padding: 0 4px;
}

.resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 16px;
  cursor: ew-resize;
  background: rgba(255, 255, 255, 0.3);
  border-left: 1px solid rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.resize-handle::after {
  content: "";
  display: block;
  width: 4px;
  height: 12px;
  border-left: 1px solid rgba(0,0,0,0.3);
  border-right: 1px solid rgba(0,0,0,0.3);
}
.resize-handle:hover {
  background: rgba(255, 255, 255, 0.6);
}

.timeline-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: rgba(0, 0, 0, 0.1);
  z-index: 1;
  pointer-events: none;
}

.timeline-labels-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: max-content;
}

.calendar-name-spacer {
  width: 100px;
  flex-shrink: 0;
  position: sticky;
  left: 0;
  background: var(--wa-color-neutral-95);
  z-index: 15;
}

.timeline-labels-container {
  position: relative;
  width: 1200px;
  height: 16px;
  margin-top: 2px;
  flex-shrink: 0;
}

.timeline-label-item {
  position: absolute;
  font-size: 0.65rem;
  color: var(--wa-color-neutral-40);
  top: 0;
  white-space: nowrap;
}

.timeline-label-item.left {
  transform: translateX(2px);
}

.timeline-label-item.right {
  transform: translateX(calc(-100% - 2px));
}
</style>
