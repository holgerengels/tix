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
            {{ comment.text }}
        </div>
      </div>
    </div>

    <div class="comment-input">
      <wa-textarea 
        v-model="newComment" 
        placeholder="Kommentar schreiben..." 
        rows="2"
        resize="auto"
        @keydown.enter.prevent="sendComment"
        :disabled="sending"
      ></wa-textarea>
      <wa-button size="small" variant="primary" @click="sendComment" :loading="sending" :disabled="!newComment.trim()">
        Senden
      </wa-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, defineProps } from 'vue';
import axios from 'axios';
import { format } from 'date-fns';
import { useUsersStore } from '../stores/users';
import { toast } from '../composables/useToast';

const usersStore = useUsersStore();

const props = defineProps({
  ticket: { type: Object, required: true }
});

const comments = ref([]);
const newComment = ref('');
const loading = ref(false);
const sending = ref(false);
const listRef = ref(null);

const formatDate = (dateStr) => format(new Date(dateStr), 'dd.MM.yyyy HH:mm');

const fetchComments = async () => {
    if (!props.ticket || !props.ticket._id) return;
    
    loading.value = true;
    try {
        const res = await axios.get(`/api/tickets/${props.ticket._id}/comments`, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        comments.value = res.data;
        await scrollToBottom();
    } catch (err) {
        console.error('Failed to load comments', err);
    } finally {
        loading.value = false;
    }
};

const sendComment = async (silent = false) => {
    if (!newComment.value.trim()) return;
    
    sending.value = true;
    try {
        const res = await axios.post(`/api/tickets/${props.ticket._id}/comments`, {
            text: newComment.value, silent
        }, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        comments.value.push(res.data);
        newComment.value = '';
        await scrollToBottom();
    } catch (err) {
        toast.error('Fehler beim Senden: ' + (err.response?.data?.message || err.message));
    } finally {
        sending.value = false;
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

onMounted(() => {
    fetchComments();
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
    padding-top: 1rem;
    background: white;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.loading, .empty {
    text-align: center;
    color: var(--wa-color-neutral-40);
    margin-top: 3rem;
    font-style: italic;
    font-size: 0.9rem;
}
</style>
