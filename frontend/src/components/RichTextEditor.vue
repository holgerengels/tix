<template>
  <div class="rich-text-editor">
    <label v-if="label" class="editor-label" :class="{ 'label-required': required }">
        {{ label }}
    </label>
    <div class="quill-wrapper">
      <QuillEditor 
        ref="quillEditor"
        theme="snow" 
        :content="editorContent" 
        contentType="html"
        :readOnly="disabled"
        @update:content="onEditorUpdate"
        @blur="handleBlur"
        toolbar="essential"
      />
    </div>
    <div v-if="hint" class="editor-hint">{{ hint }}</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  hint: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const quillEditor = ref(null);
const editorContent = ref(props.modelValue || '');
const latestHtml = ref(props.modelValue || '');

const normalizeHtml = (html) => {
  if (!html || html === '<p><br></p>' || html === '<p></p>') {
    return '';
  }
  return html;
};

const onEditorUpdate = (content) => {
  latestHtml.value = content || '';
};

const handleBlur = () => {
  let html = latestHtml.value;
  if (quillEditor.value && typeof quillEditor.value.getHTML === 'function') {
    html = quillEditor.value.getHTML();
  }
  const normalized = normalizeHtml(html);
  if (normalized !== normalizeHtml(props.modelValue)) {
    emit('update:modelValue', normalized);
  }
};

watch(() => props.modelValue, (newVal) => {
  const incoming = newVal || '';
  if (normalizeHtml(incoming) !== normalizeHtml(latestHtml.value)) {
    latestHtml.value = incoming;
    editorContent.value = incoming;
    if (quillEditor.value && typeof quillEditor.value.setHTML === 'function') {
      quillEditor.value.setHTML(incoming);
    }
  }
});
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
.label-required::after {
    content: "*";
    margin-left: 0.2rem; 
}
.quill-wrapper {
    background: white;
    border-radius: var(--wa-border-radius-medium);
    border-color: var(--wa-form-control-border-color);
}
:deep(.ql-editor) {
    min-height: 150px;
    -webkit-user-select: text;
    user-select: text;
}
:deep(.ql-clipboard) {
    -webkit-user-select: text;
    user-select: text;
}
:deep(.ql-toolbar) {
    background: var(--wa-color-neutral-95);
    border-top-left-radius: var(--wa-border-radius-medium);
    border-top-right-radius: var(--wa-border-radius-medium);
}
:deep(.ql-container) {
    font-size: var(--wa-label-font-size-medium);
    border-bottom-left-radius: var(--wa-border-radius-medium);
    border-bottom-right-radius: var(--wa-border-radius-medium);
}
:deep(.ql-editor[contenteditable=false]) {
    background-color: white;
    border-bottom-left-radius: var(--wa-border-radius-medium);
    border-bottom-right-radius: var(--wa-border-radius-medium);
    color: var(--wa-color-neutral-30);
}
.editor-hint {
    font-size: var(--wa-font-size-small);
    color: var(--wa-color-neutral-30);
}
</style>
