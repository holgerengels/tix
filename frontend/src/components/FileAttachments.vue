<template>
  <div class="file-attachments">
    <label v-if="label" class="attachments-label">{{ label }}</label>

    <!-- Upload area (if not readonly and ticketId exists) -->
    <div
      v-if="!readonly && ticketId"
      class="drop-zone"
      :class="{ 'drag-over': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <wa-icon name="cloud-arrow-up" style="font-size: 1.5rem;"></wa-icon>
      <span>Dateien hierher ziehen oder <a href="#" @click.prevent="openFileDialog">auswählen</a></span>
      <input ref="fileInput" type="file" multiple hidden @change="handleFileSelect" />
    </div>

    <!-- Upload progress -->
    <div v-for="upload in activeUploads" :key="upload.id" class="upload-progress">
      <span class="upload-name">{{ upload.filename }}</span>
      <wa-progress-bar :value="upload.progress"></wa-progress-bar>
    </div>

    <!-- Attachment list -->
    <div v-if="files.length > 0" class="attachment-list">
      <div v-for="file in files" :key="file.fileId" class="attachment-item">
        <wa-icon name="paperclip"></wa-icon>
        <a :href="`/api/attachments/${file.fileId}`" target="_blank" class="attachment-name">
          {{ file.filename }}
        </a>
        <span class="attachment-size">{{ formatSize(file.size) }}</span>
        <wa-icon-button
          v-if="!readonly"
          name="trash"
          size="small"
          class="delete-btn"
          @click="deleteAttachment(file)"
        ></wa-icon-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  ticketId: { type: String, default: null },
  modelValue: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  label: { type: String, default: 'Anhänge' }
});

const emit = defineEmits(['update:modelValue']);

const fileInput = ref(null);
const isDragOver = ref(false);
const activeUploads = ref([]);

const files = computed(() => props.modelValue || []);

const openFileDialog = () => {
  fileInput.value?.click();
};

const handleDrop = (e) => {
  isDragOver.value = false;
  const droppedFiles = Array.from(e.dataTransfer.files);
  droppedFiles.forEach(uploadFile);
};

const handleFileSelect = (e) => {
  const selectedFiles = Array.from(e.target.files);
  selectedFiles.forEach(uploadFile);
  e.target.value = '';
};

const uploadFile = async (file) => {
  const uploadId = Date.now() + '-' + Math.random();
  const uploadEntry = { id: uploadId, filename: file.name, progress: 0 };
  activeUploads.value.push(uploadEntry);

  try {
    const token = localStorage.getItem('token');

    // Use XMLHttpRequest for progress tracking
    const meta = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/tickets/${props.ticketId}/attachments`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
      xhr.setRequestHeader('X-Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          uploadEntry.progress = Math.round((e.loaded / e.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(xhr.responseText || 'Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(file);
    });

    emit('update:modelValue', [...files.value, meta]);
  } catch (err) {
    console.error('Upload error:', err);
    alert('Upload fehlgeschlagen: ' + err.message);
  } finally {
    activeUploads.value = activeUploads.value.filter(u => u.id !== uploadId);
  }
};

const deleteAttachment = async (file) => {
  if (!confirm(`"${file.filename}" wirklich löschen?`)) return;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/attachments/${file.fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(await res.text());

    emit('update:modelValue', files.value.filter(f => f.fileId !== file.fileId));
  } catch (err) {
    console.error('Delete error:', err);
    alert('Löschen fehlgeschlagen: ' + err.message);
  }
};

const formatSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};
</script>

<style scoped>
.file-attachments {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.attachments-label {
  font-size: 1rem;
  font-weight: 500;
  color: var(--wa-color-neutral-700);
}
.drop-zone {
  border: 2px dashed var(--wa-color-neutral-300);
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--wa-color-neutral-500);
  transition: all 0.2s ease;
  cursor: pointer;
}
.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--wa-color-brand-600);
  background: var(--wa-color-brand-50);
  color: var(--wa-color-brand-700);
}
.drop-zone a {
  color: var(--wa-color-brand-600);
  text-decoration: underline;
}
.upload-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.upload-name {
  font-size: 0.875rem;
  color: var(--wa-color-neutral-600);
  min-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.attachment-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  border-radius: 4px;
  background: var(--wa-color-neutral-50);
}
.attachment-item:hover {
  background: var(--wa-color-neutral-100);
}
.attachment-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wa-color-brand-600);
  text-decoration: none;
}
.attachment-name:hover {
  text-decoration: underline;
}
.attachment-size {
  font-size: 0.8rem;
  color: var(--wa-color-neutral-500);
  white-space: nowrap;
}
.delete-btn {
  color: var(--wa-color-danger-600);
  flex-shrink: 0;
}
</style>
