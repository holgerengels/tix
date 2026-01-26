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
      <sl-textarea 
        v-model="newComment" 
        placeholder="Kommentar schreiben..." 
        rows="2"
        resize="auto"
        @keydown.enter.prevent="sendComment"
        :disabled="sending"
      ></sl-textarea>
      <sl-button size="small" variant="primary" @click="sendComment" :loading="sending" :disabled="!newComment.trim()">
        Senden
      </sl-button>
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
    background-color: var(--sl-color-neutral-50);
    margin-right: 1rem;
}

.comments-header {
    padding: .7rem;
    font-weight: 600;
    border-bottom: 1px solid var(--sl-color-neutral-200);
    background: white;
}

.comments-list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.comment-item {
    background: white;
    padding: 0.75rem;
    border-radius: var(--sl-border-radius-medium);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    border: 1px solid var(--sl-color-neutral-200);
}

.comment-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.25rem;
    font-size: 0.85em;
    color: var(--sl-color-neutral-500);
}

.author {
    font-weight: 600;
    color: var(--sl-color-primary-600);
}

.comment-body {
    white-space: pre-wrap;
    font-size: 0.95em;
    line-height: 1.4;
    color: var(--sl-color-neutral-900);
}

.comment-input {
    padding: 1rem 0rem;
    background: white;
    border-top: 1px solid var(--sl-color-neutral-200);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.loading, .empty {
    text-align: center;
    color: var(--sl-color-neutral-500);
    margin-top: 2rem;
    font-style: italic;
}
</style>
