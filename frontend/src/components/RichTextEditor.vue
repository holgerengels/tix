<template>
  <div class="rich-text-editor">
    <label v-if="label" class="editor-label">{{ label }}</label>
    <div class="quill-wrapper">
      <QuillEditor 
        theme="snow" 
        :content="modelValue" 
        contentType="html"
        @update:content="$emit('update:modelValue', $event)" 
        toolbar="essential"
      />
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);
</script>

<style scoped>
.rich-text-editor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.editor-label {
    font-size: var(--sl-input-label-font-size-medium);
    color: var(--sl-input-label-color);
}
.quill-wrapper {
    background: white;
    border-radius: var(--sl-input-border-radius-medium);
}
:deep(.ql-editor) {
    min-height: 150px;
}
:deep(.ql-toolbar) {
    border-top-left-radius: var(--sl-input-border-radius-medium);
    border-top-right-radius: var(--sl-input-border-radius-medium);
    border-color: var(--sl-input-border-color);
}
:deep(.ql-container) {
    border-bottom-left-radius: var(--sl-input-border-radius-medium);
    border-bottom-right-radius: var(--sl-input-border-radius-medium);
    border-color: var(--sl-input-border-color);
}
</style>
