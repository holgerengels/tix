import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import WAAutocomplete from './WAAutocomplete.vue';

const stubs = {
    'wa-dropdown': {
        template: '<div class="wa-dropdown-stub"><slot name="trigger"></slot><slot></slot></div>',
        props: ['open']
    },
    'wa-input': {
        template: '<input class="wa-input-stub" :value="value" @input="$emit(\'input\', $event)" />',
        props: ['value', 'label', 'required', 'disabled', 'hint']
    },
    'wa-dropdown-item': {
        template: '<div class="wa-dropdown-item-stub" @click="$emit(\'click\')"><slot></slot></div>',
        props: ['value']
    },
    'wa-icon': true
};

describe('WAAutocomplete.vue', () => {
    const options = [
        { value: 'hengels', label: 'Holger Engels' },
        { value: 'mmuster', label: 'Max Mustermann' }
    ];

    it('does not render wa-dropdown-item elements in DOM when closed (v-if)', () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: 'hengels',
                options
            },
            global: { stubs }
        });

        expect(wrapper.find('.wa-input-stub').element.value).toBe('Holger Engels');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);
    });

    it('renders matching wa-dropdown-item elements when opened via 3+ character input', async () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: '',
                options
            },
            global: { stubs }
        });

        const input = wrapper.find('.wa-input-stub');
        await input.setValue('Hol');

        const items = wrapper.findAll('.wa-dropdown-item-stub');
        expect(items.length).toBe(1);
        expect(items[0].text()).toBe('Holger Engels');
    });
});
