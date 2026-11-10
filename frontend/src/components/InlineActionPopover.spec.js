import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import axios from 'axios';
import InlineActionPopover from './InlineActionPopover.vue';
import { useWorkflowStore } from '../stores/workflow';
import { useTicketsStore } from '../stores/tickets';

vi.mock('axios');

const stubs = {
    'wa-button': { template: '<button class="wa-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot></slot></button>', props: ['disabled', 'loading', 'size', 'variant', 'appearance'] },
    'wa-popover': { template: '<div class="wa-popover-stub" @wa-show="$emit(\'wa-show\', $event)"><slot></slot></div>', props: ['open', 'for', 'placement', 'distance', 'skidding'] },
    'wa-select': {
        template: '<select class="wa-select-stub" :value="value" @change="$emit(\'change\', $event)"><slot></slot></select>',
        props: ['value', 'placeholder', 'hoist']
    },
    'wa-option': { template: '<option class="wa-option-stub" :value="value"><slot></slot></option>', props: ['value'] },
    'wa-textarea': true,
    'wa-spinner': true
};

describe('InlineActionPopover.vue', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        localStorage.setItem('token', 'test-token');
    });

    it('fetches assignee users filtered by workflow assignee field groups when popover opens and submits assignment', async () => {
        const workflowStore = useWorkflowStore();
        workflowStore.config = {
            'IT-Ticket': {
                fields: [
                    { name: 'assignee', type: 'User', groups: ['Netzwerkteam', 'IT-Support'] }
                ]
            }
        };

        const ticketsStore = useTicketsStore();
        const executeSpy = vi.spyOn(ticketsStore, 'executeAction').mockResolvedValue({});

        axios.get.mockResolvedValueOnce({
            data: [
                { username: 'netz1', displayName: 'Jens Schreiber', groups: ['Netzwerkteam'] },
                { username: 'it1', displayName: 'Anna Admin', groups: ['IT-Support'] }
            ]
        });

        const wrapper = mount(InlineActionPopover, {
            props: {
                ticket: { _id: 't1', type: 'IT-Ticket', title: 'Beamer defekt', description: 'Kein Bild', assignee: '' },
                action: { name: 'zuweisen', inline: 'assign' }
            },
            global: { stubs }
        });

        // Simulate wa-show event from WA-POPOVER
        const popoverEl = wrapper.find('.wa-popover-stub').element;
        Object.defineProperty(popoverEl, 'tagName', { value: 'WA-POPOVER' });
        await wrapper.find('.wa-popover-stub').trigger('wa-show');
        await flushPromises();

        expect(axios.get).toHaveBeenCalledWith('/api/users', expect.objectContaining({
            params: { groups: 'Netzwerkteam,IT-Support', forceFetch: 'false' }
        }));

        const options = wrapper.findAll('.wa-option-stub');
        expect(options.map(o => o.text())).toEqual(['Jens Schreiber', 'Anna Admin']);

        const select = wrapper.find('.wa-select-stub');
        await select.setValue('netz1');

        const assignBtn = wrapper.findAll('.wa-button-stub').find(b => b.text() === 'Zuweisen');
        await assignBtn.trigger('click');
        await flushPromises();

        expect(executeSpy).toHaveBeenCalledWith('t1', expect.objectContaining({
            actionName: 'zuweisen',
            formData: expect.objectContaining({ assignee: 'netz1' })
        }));
        expect(wrapper.emitted('done')).toBeTruthy();
    });
});
