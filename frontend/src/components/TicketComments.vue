<template>
  <div class="comments-container">
    <div class="comments-header">
        Kommentare
    </div>
    
    <div class="comments-list" ref="listRef">
      <div v-if="loading" class="loading">Laden...</div>
      <div v-else-if="comments.length === 0" class="empty">Keine Kommentare</div>
      
      <div v-for="comment in comments" :key="comment._id" class="comment-item">
        <div class="comment-header">
            <span class="author">{{ usersStore.getDisplayName(comment.creator) }}</span>
            <span class="date">{{ formatDate(comment.created) }}</span>
        </div>
        <div class="comment-body">
            <template v-for="(part, idx) in parseCommentParts(comment.text)" :key="idx">
                <span v-if="part.isMention" class="mention-tag" :title="usersStore.getDisplayName(part.username)">@{{ usersStore.getDisplayName(part.username) || part.username }}</span>
                <span v-else>{{ part.text }}</span>
            </template>
        </div>
      </div>
    </div>

    <div class="comment-input">
      <!-- Mentions suggestion dropdown -->
      <div 
        v-if="showSuggestions && filteredUsers.length > 0" 
        class="mention-suggestions"
        ref="suggestionsRef"
      >
        <div 
          v-for="(u, index) in filteredUsers" 
          :key="u.username"
          class="mention-item"
          :class="{ active: index === selectedIndex }"
          @mousedown.prevent="insertMention(u)"
          @mouseenter="selectedIndex = index"
        >
          <div class="mention-avatar">
            <wa-icon name="person"></wa-icon>
          </div>
          <div class="mention-info">
            <span class="mention-name">{{ u.displayName || u.username }}</span>
            <span class="mention-username">@{{ u.username }}</span>
          </div>
        </div>
      </div>

      <wa-textarea 
        ref="textareaRef"
        v-model="newComment"
        @input="handleInput"
        @keydown="handleKeyDown"
        @blur="onBlur"
        placeholder="Kommentar schreiben... (@ für Erwähnung)" 
        rows="2"
        resize="auto"
        :disabled="sending"
      ></wa-textarea>
      
      <div class="comment-actions">
        <wa-button size="small" variant="primary" @click="() => sendComment()" :loading="sending" :disabled="!newComment.trim()">
          Senden
        </wa-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick, defineProps } from 'vue';
import { format } from 'date-fns';
import { useUsersStore } from '../stores/users';
import { useTicketsStore } from '../stores/tickets';
import { useAuthStore } from '../stores/auth';
import { toast } from '../composables/useToast';

const usersStore = useUsersStore();
const ticketsStore = useTicketsStore();
const authStore = useAuthStore();

const props = defineProps({
  ticket: { type: Object, required: true }
});

const comments = ref([]);
const newComment = ref('');
const loading = ref(false);
const sending = ref(false);
const listRef = ref(null);
const textareaRef = ref(null);

const allUsers = ref([]);
const showSuggestions = ref(false);
const mentionQuery = ref('');
const mentionStartIndex = ref(-1);
const selectedIndex = ref(0);

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

const filteredUsers = computed(() => {
  if (!showSuggestions.value) return [];
  const q = (mentionQuery.value || '').trim().toLowerCase();
  const currentUsername = (authStore.user?.username || '').toLowerCase();

  return allUsers.value
    .filter(u => {
      if (!u || !u.username) return false;
      if (currentUsername && u.username.toLowerCase() === currentUsername) return false;
      if (!q) return true;
      const uName = u.username.toLowerCase();
      const dName = (u.displayName || '').toLowerCase();
      return uName.includes(q) || dName.includes(q);
    })
    .slice(0, 8);
});

const getTextarea = () => {
  const el = textareaRef.value?.$el || textareaRef.value;
  if (!el) return null;
  if (el.tagName === 'TEXTAREA') return el;
  return el.shadowRoot?.querySelector('textarea') || el.querySelector?.('textarea') || el;
};

const checkMentionTrigger = () => {
  const el = getTextarea();
  const cursorPos = el && typeof el.selectionStart === 'number' ? el.selectionStart : newComment.value.length;
  const textBeforeCursor = newComment.value.slice(0, cursorPos);

  const match = textBeforeCursor.match(/(?:^|[\s(])@([a-zA-Z0-9_.-]*)$/);
  if (match) {
    mentionQuery.value = match[1].toLowerCase();
    const atOffset = match[0].indexOf('@');
    mentionStartIndex.value = (cursorPos - match[0].length) + atOffset;
    selectedIndex.value = 0;
    showSuggestions.value = true;
  } else {
    showSuggestions.value = false;
  }
};

const handleInput = (event) => {
  if (event && event.target) {
    newComment.value = event.target.value;
  }
  checkMentionTrigger();
};

const handleKeyDown = (e) => {
  if (showSuggestions.value && filteredUsers.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % filteredUsers.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value - 1 + filteredUsers.value.length) % filteredUsers.value.length;
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(filteredUsers.value[selectedIndex.value]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      showSuggestions.value = false;
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendComment();
  }
};

const onBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
};

const insertMention = (user) => {
  if (!user) return;
  const el = getTextarea();
  const cursorPos = el && typeof el.selectionStart === 'number' ? el.selectionStart : newComment.value.length;
  const before = newComment.value.slice(0, mentionStartIndex.value);
  const after = newComment.value.slice(cursorPos);

  const mentionText = `@${user.username} `;
  newComment.value = before + mentionText + after;
  showSuggestions.value = false;

  nextTick(() => {
    const textarea = getTextarea();
    if (textarea) {
      const newCursor = before.length + mentionText.length;
      if (textarea.value !== newComment.value) {
        textarea.value = newComment.value;
      }
      if (typeof textarea.focus === 'function') {
        textarea.focus();
      }
      if (typeof textarea.setSelectionRange === 'function') {
        textarea.setSelectionRange(newCursor, newCursor);
      }
    }
  });
};


const parseCommentParts = (text) => {
  if (!text) return [];
  const parts = [];
  const regex = /(?:^|[\s(])@([a-zA-Z0-9_]+(?:[.-][a-zA-Z0-9_]+)*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const matchFull = match[0];
    const username = match[1];
    const atIndex = match.index + matchFull.indexOf('@');

    if (atIndex > lastIndex) {
      parts.push({ text: text.slice(lastIndex, atIndex), isMention: false });
    }
    parts.push({ username, isMention: true });
    lastIndex = atIndex + 1 + username.length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMention: false });
  }

  return parts;
};

const focusTextarea = async () => {
    await nextTick();
    const el = getTextarea();
    if (el && typeof el.focus === 'function') {
        el.focus();
    }
    setTimeout(() => {
        const el2 = getTextarea();
        if (el2 && typeof el2.focus === 'function') {
            el2.focus();
        }
    }, 50);
};

const fetchComments = async () => {
    if (!props.ticket || !props.ticket._id) return;
    
    loading.value = true;
    try {
        const data = await ticketsStore.fetchComments(props.ticket._id);
        comments.value = data || [];
        await scrollToBottom();
    } catch (err) {
        console.error('Failed to load comments', err);
    } finally {
        loading.value = false;
    }
};

const sendComment = async (silent = false) => {
    if (!newComment.value.trim()) return;
    
    const isSilent = silent === true;
    sending.value = true;
    try {
        const created = await ticketsStore.addComment(props.ticket._id, {
            text: newComment.value,
            silent: isSilent
        });
        
        comments.value.push(created);
        newComment.value = '';
        showSuggestions.value = false;
        await scrollToBottom();
    } catch (err) {
        toast.error('Fehler beim Senden: ' + (err.response?.data?.message || err.message));
    } finally {
        sending.value = false;
        await focusTextarea();
    }
};

const scrollToBottom = async () => {
    await nextTick();
    if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight;
    }
};

watch(() => props.ticket, (val) => {
    comments.value = [];
    fetchComments();
});

const hasPendingComment = () => !!newComment.value.trim();

defineExpose({
    sendComment,
    hasPendingComment
});

onMounted(async () => {
    fetchComments();
    try {
        const users = await usersStore.fetchUsersByGroup([], false);
        allUsers.value = users || [];
    } catch (err) {
        console.error('Failed to load users for mentions:', err);
    }
});
</script>

<style scoped>
.comments-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: transparent;
}

.comments-header {
    padding: 0.75rem 1rem;
    font-weight: 600;
    background: transparent;
    color: var(--wa-color-neutral-30);
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
}

.comments-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.comment-item {
    padding: 1rem;
    border-radius: var(--wa-border-radius-medium);
    box-shadow: var(--wa-shadow-small);
    position: relative;
    background-color: var(--wa-color-neutral-90);
}

.comment-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.85em;
    color: var(--wa-color-neutral-40);
}

.author {
    font-weight: 600;
    color: var(--wa-color-brand-20);
}

.comment-body {
    white-space: pre-wrap;
    font-size: 0.95em;
    line-height: 1.5;
    color: var(--wa-color-neutral-10);
}

.comment-input {
    position: relative;
    padding-top: 1rem;
    background: white;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.comment-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
}

.mention-suggestions {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 0.5rem;
    background: #ffffff;
    border: 1px solid var(--wa-color-neutral-80, #e2e8f0);
    border-radius: var(--wa-border-radius-medium, 8px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    max-height: 220px;
    overflow-y: auto;
    z-index: 1000;
    padding: 0.25rem 0;
}

.mention-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.15s ease;
}

.mention-item.active,
.mention-item:hover {
    background-color: var(--wa-color-brand-95, #eff6ff);
}

.mention-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: var(--wa-color-neutral-90, #f1f5f9);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--wa-color-brand-30, #2563eb);
    font-size: 0.85rem;
    flex-shrink: 0;
}

.mention-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.mention-name {
    font-weight: 500;
    color: var(--wa-color-neutral-10, #0f172a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mention-username {
    font-size: 0.75rem;
    color: var(--wa-color-neutral-40, #64748b);
}

.mention-tag {
    display: inline-block;
    background-color: var(--wa-color-brand-95, #eff6ff);
    color: var(--wa-color-brand-30, #1d4ed8);
    font-weight: 600;
    padding: 0.05rem 0.35rem;
    border-radius: var(--wa-border-radius-small, 4px);
    margin: 0 0.1rem;
    font-size: 0.9em;
}

.loading, .empty {
    text-align: center;
    color: var(--wa-color-neutral-40);
    margin-top: 3rem;
    font-style: italic;
    font-size: 0.9rem;
}
</style>
