import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import axios from 'axios';
import UserSelect from './UserSelect.vue';

vi.mock('axios');

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
        template: '<div class="wa-dropdown-item-stub"><slot></slot></div>',
        props: ['value']
    },
    'wa-icon': true
};

describe('UserSelect.vue', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        localStorage.setItem('token', 'test-token');
    });

    it('fetches users for the configured groups and shows them on click', async () => {
        axios.get.mockResolvedValueOnce({
            data: [
                { username: 'netz1', displayName: 'Jens Schreiber', groups: ['Netzwerkteam'] },
                { username: 'it1', displayName: 'Anna Admin', groups: ['IT-Support'] }
            ]
        });

        const wrapper = mount(UserSelect, {
            props: {
                modelValue: '',
                label: 'Zugewiesen an',
                groups: ['Netzwerkteam', 'IT-Support']
            },
            global: { stubs }
        });

        await flushPromises();

        expect(axios.get).toHaveBeenCalledWith('/api/users', expect.objectContaining({
            params: { groups: 'Netzwerkteam,IT-Support', forceFetch: 'false' }
        }));

        await wrapper.find('.wa-input-stub').trigger('click');

        const items = wrapper.findAll('.wa-dropdown-item-stub');
        expect(items.length).toBe(2);
        expect(items.map(i => i.text())).toEqual(['Jens Schreiber', 'Anna Admin']);

        await items[0].trigger('click');
        expect(wrapper.emitted('update:modelValue')).toEqual([['netz1']]);
    });

    it('preserves a pre-selected modelValue not in the group list and reloads when groups prop changes', async () => {
        axios.get
            .mockResolvedValueOnce({
                data: [{ username: 'netz1', displayName: 'Jens Schreiber', groups: ['Netzwerkteam'] }]
            })
            .mockResolvedValueOnce({
                data: [{ username: 'haus1', displayName: 'Max Grau', groups: ['Hausmeister'] }]
            });

        const wrapper = mount(UserSelect, {
            props: {
                modelValue: 'extern1',
                label: 'Zugewiesen an',
                groups: ['Netzwerkteam']
            },
            global: { stubs }
        });

        await flushPromises();
        await wrapper.find('.wa-input-stub').trigger('click');

        let items = wrapper.findAll('.wa-dropdown-item-stub');
        expect(items.map(i => i.text())).toEqual(['Jens Schreiber', 'extern1']);

        await wrapper.setProps({ groups: ['Hausmeister'] });
        await flushPromises();

        expect(axios.get).toHaveBeenLastCalledWith('/api/users', expect.objectContaining({
            params: { groups: 'Hausmeister', forceFetch: 'false' }
        }));
        items = wrapper.findAll('.wa-dropdown-item-stub');
        expect(items.map(i => i.text())).toEqual(['Max Grau', 'extern1']);
    });
});
