<template>
  <div class="file-attachments">
    <label v-if="label" class="attachments-label">{{ label }}</label>

    <!-- Upload area (if not readonly) -->
    <div
      v-if="!readonly"
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
        <!-- Thumbnail for images -->
        <img
          v-if="isImage(file) && thumbnails[file.fileId]"
          :src="thumbnails[file.fileId]"
          class="thumbnail"
          @click="openPreview(file)"
        />
        <wa-icon v-else name="paperclip"></wa-icon>
        <a href="#" @click.prevent="isImage(file) ? openPreview(file) : downloadAttachment(file)" class="attachment-name">
          {{ file.filename }}
        </a>
        <span class="attachment-size">{{ formatSize(file.size) }}</span>
        <wa-button
          appearance="plain"
          size="small"
          class="delete-btn"
          @click="deleteAttachment(file)"
        ><wa-icon name="trash"></wa-icon></wa-button>
      </div>
    </div>

    <!-- Image Preview Dialog -->
    <wa-dialog :label="previewFile?.filename || ''" class="preview-dialog" ref="previewDialog">
      <img v-if="previewUrl" :src="previewUrl" class="preview-image" />
      <div slot="footer" style="display: flex; gap: 0.5rem; justify-content: flex-end;">
        <wa-button appearance="plain" @click="downloadAttachment(previewFile)">
          <wa-icon name="download" slot="prefix"></wa-icon> Download
        </wa-button>
        <wa-button appearance="filled" @click="(e) => e.target.closest('wa-dialog').open = false">Schließen</wa-button>
      </div>
    </wa-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { toast, confirm } from '../composables/useToast';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  label: { type: String, default: 'Anhänge' }
});

const emit = defineEmits(['update:modelValue']);

const fileInput = ref(null);
const isDragOver = ref(false);
const activeUploads = ref([]);
const thumbnails = ref({});
const previewFile = ref(null);
const previewUrl = ref(null);
const previewDialog = ref(null);

const files = computed(() => props.modelValue || []);

const isImage = (file) => file.contentType?.startsWith('image/');

const getAuthHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Load thumbnails for image files
const loadThumbnails = async () => {
  for (const file of files.value) {
    if (isImage(file) && !thumbnails.value[file.fileId]) {
      try {
        const res = await fetch(`/api/attachments/${file.fileId}`, {
          headers: getAuthHeaders()
        });
        if (res.ok) {
          const blob = await res.blob();
          thumbnails.value[file.fileId] = URL.createObjectURL(blob);
        }
      } catch (err) {
        console.error('Thumbnail load error:', err);
      }
    }
  }
};

watch(files, loadThumbnails, { immediate: true });

onBeforeUnmount(() => {
  // Clean up blob URLs
  Object.values(thumbnails.value).forEach(url => URL.revokeObjectURL(url));
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
});

const openPreview = async (file) => {
  previewFile.value = file;
  // Reuse thumbnail URL if available
  if (thumbnails.value[file.fileId]) {
    previewUrl.value = thumbnails.value[file.fileId];
  } else {
    try {
      const res = await fetch(`/api/attachments/${file.fileId}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const blob = await res.blob();
        previewUrl.value = URL.createObjectURL(blob);
      }
    } catch (err) {
      console.error('Preview load error:', err);
    }
  }
  previewDialog.value?.show();
};

const closePreview = () => {
  previewDialog.value?.hide();
};

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

    const meta = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/attachments');
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
    toast.error('Upload fehlgeschlagen: ' + err.message);
  } finally {
    activeUploads.value = activeUploads.value.filter(u => u.id !== uploadId);
  }
};

const downloadAttachment = async (file) => {
  try {
    const res = await fetch(`/api/attachments/${file.fileId}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Download fehlgeschlagen');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Download error:', err);
    toast.error('Download fehlgeschlagen: ' + err.message);
  }
};

const deleteAttachment = async (file) => {
  if (!await confirm(`"${file.filename}" wirklich löschen?`)) return;

  try {
    const res = await fetch(`/api/attachments/${file.fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) throw new Error(await res.text());

    // Clean up thumbnail
    if (thumbnails.value[file.fileId]) {
      URL.revokeObjectURL(thumbnails.value[file.fileId]);
      delete thumbnails.value[file.fileId];
    }

    emit('update:modelValue', files.value.filter(f => f.fileId !== file.fileId));
  } catch (err) {
    console.error('Delete error:', err);
    toast.error('Löschen fehlgeschlagen: ' + err.message);
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
  color: var(--wa-color-neutral-20);
}
.drop-zone {
  border: 2px dashed var(--wa-color-neutral-60);
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--wa-color-neutral-40);
  transition: all 0.2s ease;
  cursor: pointer;
}
.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--wa-color-brand-30);
  background: var(--wa-color-brand-90);
  color: var(--wa-color-brand-20);
}
.drop-zone a {
  color: var(--wa-color-brand-30);
  text-decoration: underline;
}
.upload-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.upload-name {
  font-size: 0.875rem;
  color: var(--wa-color-neutral-30);
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
  background: var(--wa-color-neutral-90);
}
.attachment-item:hover {
  background: var(--wa-color-neutral-80);
}
.thumbnail {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--wa-color-neutral-80);
  transition: opacity 0.2s;
}
.thumbnail:hover {
  opacity: 0.8;
}
.attachment-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wa-color-brand-30);
  text-decoration: none;
}
.attachment-name:hover {
  text-decoration: underline;
}
.attachment-size {
  font-size: 0.8rem;
  color: var(--wa-color-neutral-40);
  white-space: nowrap;
}
.delete-btn {
  color: var(--wa-color-danger-30);
  flex-shrink: 0;
}
.preview-dialog {
  --width: auto;
  --body-spacing: 0;
}
.preview-image {
  max-width: 80vw;
  max-height: 70vh;
  display: block;
  border-radius: 4px;
}
</style>
