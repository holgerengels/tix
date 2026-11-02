<template>
  <wa-dialog
    label="Als Duplikat schließen"
    ref="dialogRef"
    class="duplicate-dialog"
    :open="open"
    @wa-after-hide="handleClose"
  >
    <div class="duplicate-dialog-content">
      <!-- Search Input for Target Ticket -->
      <div class="search-section">
        <label class="field-label">Original-Ticket auswählen:</label>
        <div class="search-box">
          <wa-input
            v-model="searchQuery"
            placeholder="Ticket suchen (ID oder Titel)…"
            size="small"
            with-clear
            @input="onSearchInput"
            @wa-clear="searchQuery = ''; onSearchInput()"
          >
            <wa-icon slot="prefix" name="search"></wa-icon>
          </wa-input>
        </div>

        <!-- Candidate Results Area (fixed height container to prevent dialog jumps) -->
        <div v-if="!selectedTicket" class="candidates-container">
          <div v-if="loadingCandidates" class="loading-candidates">
            <wa-spinner size="small"></wa-spinner> <span>Lade Tickets…</span>
          </div>

          <!-- Candidate Results List -->
          <div v-else-if="candidates.length > 0" class="candidates-list">
            <div
              v-for="candidate in candidates"
              :key="candidate._id || candidate.id"
              class="candidate-item"
              @click="selectTargetTicket(candidate)"
            >
              <div class="candidate-header">
                <span class="candidate-id">{{ candidate.id }}</span>
                <wa-tag size="small" :variant="getStatusColor(candidate)">
                  {{ getStatusLabel(candidate) }}
                </wa-tag>
              </div>
              <div class="candidate-title">{{ candidate.title || '(Kein Titel)' }}</div>
              <div class="candidate-meta">
                <span>{{ usersStore.getDisplayName(candidate.creator) }}</span>
                <span v-if="candidate.created"> · {{ formatDate(candidate.created) }}</span>
              </div>
            </div>
          </div>

          <div v-else-if="searchQuery && candidates.length === 0" class="no-candidates">
            Keine passenden Tickets gefunden.
          </div>

          <div v-else class="no-candidates">
            Keine weiteren Tickets vorhanden.
          </div>
        </div>
      </div>

      <!-- Comparison / Direction Section (when a ticket is selected) -->
      <div v-if="selectedTicket" class="relation-section">
        <div class="tickets-comparison">
          <!-- Ticket to be closed -->
          <div class="ticket-box duplicate-box">
            <div class="box-badge">
              <wa-tag variant="danger" size="small">Wird geschlossen</wa-tag>
            </div>
            <div class="box-role">⧉ Duplikat</div>
            <div class="box-ticket-id">{{ duplicateTicket.id }}</div>
            <div class="box-ticket-title">{{ duplicateTicket.title || '(Kein Titel)' }}</div>
            <div class="box-ticket-meta">
              {{ usersStore.getDisplayName(duplicateTicket.creator) }}
            </div>
          </div>

          <!-- Swap Button / Arrow -->
          <div class="swap-action">
            <div class="relation-arrow">
              <wa-icon name="arrow-right"></wa-icon>
            </div>
            <wa-button
              size="small"
              variant="neutral"
              appearance="outlined"
              class="swap-btn"
              title="Rollen tauschen (welches Ticket geschlossen wird)"
              @click="toggleSwap"
            >
              <wa-icon slot="start" name="arrow-left-right"></wa-icon> Tauschen
            </wa-button>
          </div>

          <!-- Master ticket staying open -->
          <div class="ticket-box master-box">
            <div class="box-badge">
              <wa-tag variant="success" size="small">Bleibt offen</wa-tag>
            </div>
            <div class="box-role">★ Original</div>
            <div class="box-ticket-id">{{ masterTicket.id }}</div>
            <div class="box-ticket-title">{{ masterTicket.title || '(Kein Titel)' }}</div>
            <div class="box-ticket-meta">
              {{ usersStore.getDisplayName(masterTicket.creator) }}
            </div>
          </div>
        </div>

        <!-- Options -->
        <div class="options-section">
          <wa-checkbox
            :checked.prop="starTarget"
            @change="starTarget = $event.target.checked"
          >
            Ersteller von <strong>{{ duplicateTicket.id }}</strong> ({{ usersStore.getDisplayName(duplicateTicket.creator) }}) zu Favoriten von <strong>{{ masterTicket.id }}</strong> hinzufügen
          </wa-checkbox>

          <wa-textarea
            v-model="comment"
            label="Begründung / Notiz (optional)"
            rows="2"
            :placeholder="masterTicket?.id ? `z. B. Gleiche Ursache wie in ${masterTicket.id}, wird dort bearbeitet…` : 'z. B. Gleiche Ursache…'"
          ></wa-textarea>
        </div>
      </div>
    </div>

    <!-- Dialog Footer (Wizard navigation) -->
    <div slot="footer" class="dialog-footer">
      <div class="footer-left">
        <wa-button
          v-if="selectedTicket"
          class="back-btn"
          appearance="outlined"
          variant="neutral"
          @click="selectedTicket = null"
        >
          <wa-icon slot="start" name="arrow-left"></wa-icon>
          Zurück
        </wa-button>
      </div>
      <div class="footer-right">
        <wa-button class="cancel-btn" appearance="outlined" variant="neutral" @click="handleClose">
          Abbrechen
        </wa-button>
        <wa-button
          class="submit-btn"
          appearance="filled"
          variant="danger"
          :disabled="!selectedTicket || submitting"
          :loading="submitting"
          @click="submitDuplicate"
        >
          <wa-icon slot="start" name="copy"></wa-icon>
          Als Duplikat schließen
        </wa-button>
      </div>
    </div>
  </wa-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { format } from 'date-fns';
import { useTicketsStore } from '../stores/tickets';
import { useUsersStore } from '../stores/users';
import { useWorkflowStore } from '../stores/workflow';
import { toast } from '../composables/useToast';

const props = defineProps({
  open: { type: Boolean, default: false },
  ticket: { type: Object, default: null },
  action: { type: Object, default: () => ({ name: 'als Duplikat schließen' }) }
});

const emit = defineEmits(['update:open', 'done']);

const ticketsStore = useTicketsStore();
const usersStore = useUsersStore();
const workflowStore = useWorkflowStore();

const searchQuery = ref('');
const candidates = ref([]);
const loadingCandidates = ref(false);
const selectedTicket = ref(null);
const isSwapped = ref(false);
const starTarget = ref(true);
const comment = ref('');
const submitting = ref(false);

const duplicateTicket = computed(() => {
  if (!selectedTicket.value) return props.ticket;
  return isSwapped.value ? selectedTicket.value : props.ticket;
});

const masterTicket = computed(() => {
  if (!selectedTicket.value) return null;
  return isSwapped.value ? props.ticket : selectedTicket.value;
});

const getStatusColor = (t) => {
  if (!t || !workflowStore.config) return 'neutral';
  const conf = workflowStore.config[t.type];
  if (!conf || !conf.states) return 'neutral';
  const stateDef = conf.states.find(s => s.name === t.state);
  const colorMap = {
    blue: 'brand',
    green: 'success',
    yellow: 'warning',
    red: 'danger',
    gray: 'neutral'
  };
  return stateDef ? (colorMap[stateDef.color] || 'neutral') : 'neutral';
};

const getStatusLabel = (t) => {
  if (!t || !workflowStore.config) return t?.state || '';
  const conf = workflowStore.config[t.type];
  if (!conf || !conf.states) return t.state;
  const stateDef = conf.states.find(s => s.name === t.state);
  return stateDef ? stateDef.label : t.state;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return format(new Date(dateStr), 'dd.MM.yyyy');
  } catch {
    return '';
  }
};

let debounceTimer = null;
const onSearchInput = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    fetchCandidates();
  }, 250);
};

const fetchCandidates = async () => {
  if (!props.ticket) return;
  loadingCandidates.value = true;
  try {
    const params = {
      type: props.ticket.type
    };
    if (searchQuery.value && searchQuery.value.trim()) {
      params.search = searchQuery.value.trim();
    }
    const results = await ticketsStore.fetchTickets(params);
    // Filter out current ticket
    candidates.value = (results || []).filter(t => t.id !== props.ticket.id);
  } catch (err) {
    console.error('Error fetching candidates:', err);
  } finally {
    loadingCandidates.value = false;
  }
};

const selectTargetTicket = (t) => {
  selectedTicket.value = t;
  isSwapped.value = false;
};

const toggleSwap = () => {
  isSwapped.value = !isSwapped.value;
};

const resetState = () => {
  searchQuery.value = '';
  candidates.value = [];
  selectedTicket.value = null;
  isSwapped.value = false;
  starTarget.value = true;
  comment.value = '';
  submitting.value = false;
};

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    resetState();
    fetchCandidates();
  }
}, { immediate: true });

const handleClose = () => {
  emit('update:open', false);
};

const submitDuplicate = async () => {
  if (!selectedTicket.value || !props.ticket) return;

  const toClose = duplicateTicket.value;
  const toKeep = masterTicket.value;

  submitting.value = true;
  try {
    const payload = {
      actionName: props.action.name,
      targetTicketId: toKeep.id,
      comment: comment.value,
      starTarget: starTarget.value
    };

    await ticketsStore.executeAction(toClose._id, payload);
    toast.success(`Ticket ${toClose.id} als Duplikat von ${toKeep.id} geschlossen.`);
    emit('done', { duplicate: toClose, target: toKeep, isSwapped: isSwapped.value });
    handleClose();
  } catch (err) {
    console.error('Error closing duplicate:', err);
    toast.error('Fehler beim Schließen als Duplikat: ' + (err.response?.data?.message || err.message));
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.duplicate-dialog {
  --width: 620px;
}

.duplicate-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 330px;
}

.field-label {
  display: block;
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 0.35rem;
}

.search-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.candidates-container {
  height: 240px;
  border: 1px solid var(--wa-color-neutral-80);
  border-radius: var(--wa-border-radius-medium);
  background-color: white;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.loading-candidates {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--wa-color-neutral-40);
  height: 100%;
}

.candidates-list {
  display: flex;
  flex-direction: column;
}

.candidate-item {
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--wa-color-neutral-90);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.candidate-item:last-child {
  border-bottom: none;
}

.candidate-item:hover {
  background-color: var(--wa-color-brand-90);
}

.candidate-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.2rem;
}

.candidate-id {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--wa-color-brand-30);
}

.candidate-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--wa-color-neutral-10);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-meta {
  font-size: 0.75rem;
  color: var(--wa-color-neutral-40);
  margin-top: 0.2rem;
}

.no-candidates {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  color: var(--wa-color-neutral-40);
  font-style: italic;
  height: 100%;
  padding: 1rem;
}

.relation-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tickets-comparison {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.ticket-box {
  flex: 1;
  padding: 0.85rem;
  border-radius: var(--wa-border-radius-medium);
  border: 1px solid var(--wa-color-neutral-80);
  background-color: var(--wa-color-neutral-95);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.duplicate-box {
  border-color: var(--wa-color-danger-70);
  background-color: var(--wa-color-danger-95);
}

.master-box {
  border-color: var(--wa-color-success-70);
  background-color: var(--wa-color-success-95);
}

.box-badge {
  margin-bottom: 0.25rem;
}

.box-role {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--wa-color-neutral-40);
}

.duplicate-box .box-role {
  color: var(--wa-color-danger-30);
}

.master-box .box-role {
  color: var(--wa-color-success-30);
}

.box-ticket-id {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--wa-color-neutral-10);
}

.box-ticket-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--wa-color-neutral-20);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.box-ticket-meta {
  font-size: 0.75rem;
  color: var(--wa-color-neutral-40);
}

.swap-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.relation-arrow {
  font-size: 1.25rem;
  color: var(--wa-color-neutral-40);
}

.options-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--wa-color-neutral-85);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-left {
  display: flex;
  align-items: center;
}

.footer-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
