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
            <span class="author">{{ comment.creator }}</span>
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

const sendComment = async () => {
    if (!newComment.value.trim()) return;
    
    sending.value = true;
    try {
        const res = await axios.post(`/api/tickets/${props.ticket._id}/comments`, {
            text: newComment.value
        }, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        comments.value.push(res.data);
        newComment.value = '';
        await scrollToBottom();
    } catch (err) {
        alert('Fehler beim Senden: ' + (err.response?.data?.message || err.message));
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
    color: var(--wa-color-neutral-600);
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
}

.comments-list {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    background-color: var(--wa-color-neutral-300);;
    border-radius: var(--wa-border-radius-medium);
    box-shadow: var(--wa-shadow-x-small);
    /* max-height removed, layout handles it */
}

.comment-item {
    background: white;
    padding: 1rem;
    border-radius: var(--wa-border-radius-medium);
    box-shadow: var(--wa-shadow-x-small);
    border: 1px solid var(--wa-color-neutral-100);
    position: relative;
}

.comment-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.85em;
    color: var(--wa-color-neutral-500);
}

.author {
    font-weight: 600;
    color: var(--wa-color-primary-700);
}

.comment-body {
    white-space: pre-wrap;
    font-size: 0.95em;
    line-height: 1.5;
    color: var(--wa-color-neutral-900);
}

.comment-input {
    padding-top: 1rem;
    background: white;
    border-top: 1px solid var(--wa-color-neutral-200);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.loading, .empty {
    text-align: center;
    color: var(--wa-color-neutral-500);
    margin-top: 3rem;
    font-style: italic;
    font-size: 0.9rem;
}
</style>
