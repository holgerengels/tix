<template>
  <div class="rich-text-editor">
    <label v-if="label" class="editor-label">{{ label }}</label>
    <div class="quill-wrapper">
      <QuillEditor 
        theme="snow" 
        :content="modelValue" 
        contentType="html"
        :readOnly="disabled"
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
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
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
    font-size: var(--wa-label-font-size-medium);
    color: var(--wa-label-color);
}
.quill-wrapper {
    background: white;
    border-radius: var(--wa-border-radius-medium);
    border-color: var(--wa-form-control-border-color);
}
:deep(.ql-editor) {
    min-height: 150px;
}
:deep(.ql-toolbar) {
    border-top-left-radius: var(--wa-border-radius-medium);
    border-top-right-radius: var(--wa-border-radius-medium);
}
:deep(.ql-container) {
    border-bottom-left-radius: var(--wa-border-radius-medium);
    border-bottom-right-radius: var(--wa-border-radius-medium);
}
:deep(.ql-editor[contenteditable=false]) {
    background-color: var(--wa-color-neutral-50);
    border-bottom-left-radius: var(--wa-border-radius-medium);
    border-bottom-right-radius: var(--wa-border-radius-medium);
    color: var(--wa-color-neutral-600);
}
</style>
