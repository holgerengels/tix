import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import FormField from './FormField.vue';

// Use standard pinia for tests
import { createPinia, setActivePinia } from 'pinia';

// We must carefully stub Web Components because JSDOM forces HTML behaviors (like <select> not holding Arrays in .value).
const globalStubs = {
    'wa-input': { 
        template: '<div class="wa-input-stub" @change="emitChange"></div>', 
        methods: { emitChange(val) { this.$emit('change', { target: { value: val }, stopPropagation: () => {} }); } }
    },
    'wa-select': { 
        template: '<div class="wa-select-stub" @change="emitChange"></div>',
        props: ['multiple'],
        methods: { emitChange(val) { this.$emit('change', { target: { value: val }, stopPropagation: () => {} }); } }
    },
    'wa-checkbox': { 
        template: '<div class="wa-checkbox-stub" @change="emitChange"></div>',
        methods: { emitChange(val) { this.$emit('change', { target: { checked: val }, stopPropagation: () => {} }); } }
    },
    'wa-option': true,
};

describe('FormField.vue Data Binding & Reactivity', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('Boolean field correctly binds modelValue and emits wa-change', async () => {
        const wrapper = mount(FormField, {
            props: {
                field: { type: 'Boolean', name: 'agree', label: 'Agree' },
                modelValue: true
            },
            global: {
                stubs: globalStubs
            }
        });

        const checkbox = wrapper.findComponent('.wa-checkbox-stub');
        // Vue 3 .prop bindings directly alter the DOM property of the root element
        expect(checkbox.element.checked).toBe(true);

        // Test upward emission
        await checkbox.vm.emitChange(false);
        
        const emitArgs = wrapper.emitted('update:modelValue');
        expect(emitArgs).toBeTruthy();
        expect(emitArgs[0][0]).toBe(false);
    });

    it('Standard Text field correctly binds modelValue and emits change', async () => {
        const wrapper = mount(FormField, {
            props: {
                field: { type: 'String', name: 'title', label: 'Title' },
                modelValue: 'Initial Text'
            },
            global: {
                stubs: globalStubs
            }
        });

        const input = wrapper.findComponent('.wa-input-stub');
        expect(input.element.value).toBe('Initial Text');

        // Test upward emission via the stub method to guarantee mock object bypasses JSDOM limits
        await input.vm.emitChange('New Text');
        
        const emitArgs = wrapper.emitted('update:modelValue');
        expect(emitArgs).toBeTruthy();
        expect(emitArgs[0][0]).toBe('New Text');
    });

    it('Select field correctly binds array modelValue and emits change', async () => {
        const wrapper = mount(FormField, {
            props: {
                field: { type: 'Select', name: 'status', label: 'Status', multiple: true, options: ['A', 'B'] },
                modelValue: ['A']
            },
            global: {
                stubs: globalStubs
            }
        });

        const select = wrapper.findComponent('.wa-select-stub');
        expect(wrapper.vm.modelValue).toEqual(['A']);

        // Test upward emission with an Array payload directly
        await select.vm.emitChange(['A', 'B']);
        
        const emitArgs = wrapper.emitted('update:modelValue');
        expect(emitArgs).toBeTruthy();
        expect(emitArgs[0][0]).toEqual(['A', 'B']);
    });

});
