import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RichTextEditor from './RichTextEditor.vue';

describe('RichTextEditor.vue', () => {
    it('does NOT emit on typing (safari iOS protection), but emits change and update:modelValue on blur', async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                modelValue: '',
                label: 'Beschreibung',
                required: true
            },
            global: {
                stubs: {
                    QuillEditor: {
                        name: 'QuillEditor',
                        template: '<div class="quill-editor-stub"></div>',
                        props: ['content', 'contentType', 'readOnly', 'theme', 'toolbar'],
                        emits: ['update:content', 'blur']
                    }
                }
            }
        });

        const quill = wrapper.findComponent('.quill-editor-stub');
        expect(quill.exists()).toBe(true);

        // Simulate typing into QuillEditor (fires update:content)
        await quill.vm.$emit('update:content', '<p>Neuer Text</p>');

        // While typing, update:modelValue and change must NOT be emitted yet
        expect(wrapper.emitted('update:modelValue')).toBeFalsy();
        expect(wrapper.emitted('change')).toBeFalsy();

        // On blur, commitChange is triggered
        await quill.vm.$emit('blur');
        const updateEmits = wrapper.emitted('update:modelValue');
        const changeEmits = wrapper.emitted('change');
        expect(updateEmits).toBeTruthy();
        expect(updateEmits[0][0]).toBe('<p>Neuer Text</p>');
        expect(changeEmits).toBeTruthy();
        expect(changeEmits[0][0]).toBe('<p>Neuer Text</p>');
    });

    it('emits change and update:modelValue on DOM focusout', async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                modelValue: '',
                label: 'Beschreibung'
            },
            global: {
                stubs: {
                    QuillEditor: {
                        name: 'QuillEditor',
                        template: '<div class="quill-editor-stub"></div>',
                        emits: ['update:content', 'blur']
                    }
                }
            }
        });

        const quill = wrapper.findComponent('.quill-editor-stub');
        await quill.vm.$emit('update:content', '<p>Fokus verloren</p>');

        // Trigger DOM focusout on wrapper
        await wrapper.find('.rich-text-editor').trigger('focusout', {
            relatedTarget: null
        });

        expect(wrapper.emitted('update:modelValue')).toBeTruthy();
        expect(wrapper.emitted('update:modelValue')[0][0]).toBe('<p>Fokus verloren</p>');
        expect(wrapper.emitted('change')).toBeTruthy();
        expect(wrapper.emitted('change')[0][0]).toBe('<p>Fokus verloren</p>');
    });

    it('normalizes empty HTML tags like <p><br></p> to empty string on blur', async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                modelValue: '<p>Vorhandener Text</p>',
                label: 'Beschreibung'
            },
            global: {
                stubs: {
                    QuillEditor: {
                        name: 'QuillEditor',
                        template: '<div class="quill-editor-stub"></div>',
                        emits: ['update:content', 'blur']
                    }
                }
            }
        });

        const quill = wrapper.findComponent('.quill-editor-stub');
        await quill.vm.$emit('update:content', '<p><br></p>');
        await quill.vm.$emit('blur');

        const emits = wrapper.emitted('update:modelValue');
        expect(emits).toBeTruthy();
        expect(emits[0][0]).toBe('');
    });
});
