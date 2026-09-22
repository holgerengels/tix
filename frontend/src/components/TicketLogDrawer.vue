<template>
  <wa-drawer
    :label="drawerTitle"
    placement="end"
    ref="drawerRef"
    class="ticket-log-drawer"
    :open="open"
    light-dismiss
    @wa-after-hide="handleClose"
  >
    <div slot="header-actions">
      <wa-button variant="text" size="small" @click="fetchLogs" title="Aktualisieren">
        <wa-icon name="arrow-clockwise"></wa-icon>
      </wa-button>
    </div>

    <div v-if="loading" class="log-state log-loading">
      <wa-spinner style="font-size: 2rem;"></wa-spinner>
      <span>Lade Protokoll...</span>
    </div>

    <div v-else-if="error" class="log-state log-error">
      <wa-callout variant="danger">
        <wa-icon slot="icon" name="exclamation-octagon"></wa-icon>
        {{ error }}
      </wa-callout>
      <wa-button size="small" variant="neutral" appearance="outlined" @click="fetchLogs" style="margin-top: 0.5rem;">
        Erneut versuchen
      </wa-button>
    </div>

    <div v-else-if="logs.length === 0" class="log-state log-empty">
      <wa-icon name="journal-x" style="font-size: 2.5rem; color: var(--wa-color-neutral-40); margin-bottom: 0.5rem;"></wa-icon>
      <span>Keine Protokolleinträge vorhanden.</span>
    </div>

    <div v-else class="timeline-container">
      <div class="timeline">
        <div v-for="(entry, index) in logs" :key="entry._id || index" class="timeline-item">
          <div class="timeline-axis">
            <div class="timeline-dot"></div>
            <div v-if="index < logs.length - 1" class="timeline-line"></div>
          </div>
          <div class="timeline-body">
            <div class="timeline-meta">
              <span class="timeline-user">
                <wa-icon name="person" class="meta-icon"></wa-icon>
                {{ usersStore.getDisplayName(entry.editor) }}
              </span>
              <span class="timeline-time" :title="entry.timestamp">
                {{ formatDateTime(entry.timestamp) }}
              </span>
            </div>
            <div class="timeline-action">
              {{ entry.action }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </wa-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { format } from 'date-fns';
import { useUsersStore } from '../stores/users';
import { useTicketsStore } from '../stores/tickets';

const props = defineProps({
  ticketId: {
    type: String,
    required: false,
    default: ''
  },
  ticketDisplayId: {
    type: String,
    required: false,
    default: ''
  },
  open: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close']);

const drawerRef = ref(null);
const logs = ref([]);
const loading = ref(false);
const error = ref(null);

const usersStore = useUsersStore();
const ticketsStore = useTicketsStore();

const drawerTitle = computed(() => {
  if (props.ticketDisplayId) {
    return `Protokoll: ${props.ticketDisplayId}`;
  }
  return 'Ticket-Protokoll';
});

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy HH:mm:ss');
  } catch (e) {
    return dateStr;
  }
};

const fetchLogs = async () => {
  if (!props.ticketId) return;

  loading.value = true;
  error.value = null;

  try {
    const data = await ticketsStore.fetchTicketLogs(props.ticketId);
    logs.value = data || [];
  } catch (err) {
    console.error('Failed to fetch ticket logs:', err);
    error.value = 'Fehler beim Laden des Protokolls.';
  } finally {
    loading.value = false;
  }
};

const handleClose = (event) => {
  if (event && event.target && drawerRef.value) {
    const drawerEl = drawerRef.value.$el || drawerRef.value;
    if (event.target !== drawerEl && event.target !== drawerRef.value) {
      return;
    }
  }
  emit('close');
};

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.ticketId) {
      fetchLogs();
    }
  },
  { immediate: true }
);

watch(
  () => props.ticketId,
  (newId) => {
    if (props.open && newId) {
      fetchLogs();
    }
  }
);
</script>

<style scoped>
.ticket-log-drawer {
  --size: min(440px, 92vw);
}

.log-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--wa-color-neutral-60);
  gap: 0.75rem;
}

.timeline-container {
  padding: 0.5rem 0.25rem 2rem 0.25rem;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  position: relative;
  min-height: 4.5rem;
}

.timeline-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 2rem;
  flex-shrink: 0;
  position: relative;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--wa-color-brand-60, #3b82f6);
  border: 2px solid white;
  box-shadow: 0 0 0 2px var(--wa-color-brand-60, #3b82f6);
  margin-top: 0.35rem;
  z-index: 1;
  flex-shrink: 0;
}

.timeline-line {
  position: absolute;
  top: 1.1rem;
  bottom: 0;
  width: 2px;
  background-color: var(--wa-color-neutral-85, #e5e7eb);
}

.timeline-body {
  flex: 1;
  padding-left: 0.75rem;
  padding-bottom: 1.25rem;
}

.timeline-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.timeline-user {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--wa-color-neutral-20, #1f2937);
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.meta-icon {
  font-size: 0.85rem;
  color: var(--wa-color-neutral-40, #9ca3af);
}

.timeline-time {
  font-size: 0.75rem;
  color: var(--wa-color-neutral-50, #6b7280);
  white-space: nowrap;
}

.timeline-action {
  font-size: 0.875rem;
  line-height: 1.4;
  color: var(--wa-color-neutral-30, #374151);
  background: var(--wa-color-neutral-95, #f9fafb);
  border: 1px solid var(--wa-color-neutral-90, #e5e7eb);
  border-radius: var(--wa-border-radius-medium, 6px);
  padding: 0.5rem 0.75rem;
  margin-top: 0.25rem;
  word-break: break-word;
}
</style>
