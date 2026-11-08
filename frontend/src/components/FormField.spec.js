import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import FormField from './FormField.vue';
import axios from 'axios';

// Use standard pinia for tests
import { createPinia, setActivePinia } from 'pinia';

// We must carefully stub Web Components because JSDOM forces HTML behaviors (like <select> not holding Arrays in .value).
const globalStubs = {
    'wa-input': { 
        template: '<div class="wa-input-stub" @change="emitChange"></div>', 
        methods: { emitChange(val) { this.$emit('change', { target: { value: val }, stopPropagation: () => {} }); } }
    },
    'wa-select': { 
        template: '<div class="wa-select-stub" @change="emitChange"><slot></slot></div>',
        props: ['multiple'],
        methods: { emitChange(val) { this.$emit('change', { target: { value: val }, stopPropagation: () => {} }); } }
    },
    'wa-checkbox': { 
        template: '<div class="wa-checkbox-stub" @change="emitChange"></div>',
        props: ['checked', 'defaultChecked'],
        methods: { emitChange(val) { this.$emit('change', { target: { checked: val }, stopPropagation: () => {} }); } }
    },
    'wa-option': {
        template: '<div class="wa-option-stub" :data-value="value"><slot></slot></div>',
        props: ['value']
    },
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
        // Vue bindings for wa-checkbox use explicit attributes instead of .prop modifier to force update 
        expect(checkbox.props('checked')).toBe(true) || expect(checkbox.attributes('checked')).toBe("true");

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

    it('Select field normalizes { value, label } options and renders labels', async () => {
        const wrapper = mount(FormField, {
            props: {
                field: {
                    type: 'Select',
                    name: 'calendarMode',
                    label: 'Kalender',
                    options: [
                        { value: 'none', label: 'nicht eintragen' },
                        { value: 'entry', label: 'nur eintragen' },
                        { value: 'invite', label: 'Einladung versenden' }
                    ]
                },
                modelValue: 'invite'
            },
            global: {
                stubs: globalStubs
            }
        });

        const options = wrapper.findAllComponents('.wa-option-stub');
        expect(options.length).toBe(3);
        expect(options[0].props('value')).toBe('none');
        expect(options[0].text()).toBe('nicht eintragen');
        expect(options[1].props('value')).toBe('entry');
        expect(options[1].text()).toBe('nur eintragen');
        expect(options[2].props('value')).toBe('invite');
        expect(options[2].text()).toBe('Einladung versenden');

        const select = wrapper.findComponent('.wa-select-stub');
        await select.vm.emitChange('entry');

        const emitArgs = wrapper.emitted('update:modelValue');
        expect(emitArgs).toBeTruthy();
        expect(emitArgs[0][0]).toBe('entry');
    });

    it('Group field fetches dynamic groups from usersStore and merges with static options', async () => {
        vi.spyOn(axios, 'get').mockImplementation(async (url) => {
            if (url === '/api/groups') {
                return { data: ['Lehrkräfte', 'Schulleitung'] };
            }
            if (url === '/api/users') {
                return { data: [] };
            }
            return { data: [] };
        });

        const wrapper = mount(FormField, {
            props: {
                field: {
                    type: 'Group',
                    name: 'groups',
                    label: 'Gruppen',
                    multiple: true,
                    options: [{ value: 'all', label: '<alle>' }]
                },
                modelValue: []
            },
            global: {
                stubs: globalStubs
            }
        });

        await new Promise(resolve => setTimeout(resolve, 20));
        await wrapper.vm.$nextTick();

        const options = wrapper.findAllComponents('.wa-option-stub');
        expect(options.length).toBe(3);
        expect(options[0].props('value')).toBe('all');
        expect(options[0].text()).toBe('<alle>');
        expect(options[1].props('value')).toBe('Lehrkräfte');
        expect(options[1].text()).toBe('Lehrkräfte');
        expect(options[2].props('value')).toBe('Schulleitung');
        expect(options[2].text()).toBe('Schulleitung');
    });

});
