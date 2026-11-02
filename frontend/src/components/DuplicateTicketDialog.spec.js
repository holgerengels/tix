import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DuplicateTicketDialog from './DuplicateTicketDialog.vue';
import { useTicketsStore } from '../stores/tickets';

vi.mock('../stores/users', () => ({
  useUsersStore: () => ({
    getDisplayName: (u) => u || 'Unbekannt'
  })
}));

const stubs = {
  'wa-dialog': {
    props: ['open', 'label'],
    template: '<div class="wa-dialog-stub" v-if="open"><slot /><slot name="footer" /></div>'
  },
  'wa-input': {
    props: ['modelValue', 'placeholder'],
    template: '<input class="wa-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'input\')" />'
  },
  'wa-textarea': {
    props: ['modelValue', 'placeholder', 'label'],
    template: '<textarea class="wa-textarea-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  'wa-checkbox': {
    props: ['checked'],
    template: '<label class="wa-checkbox-stub"><slot /></label>'
  },
  'wa-button': {
    props: ['disabled', 'loading'],
    template: '<button :disabled="disabled"><slot /><slot name="start" /></button>'
  },
  'wa-tag': {
    props: ['variant', 'size'],
    template: '<span class="wa-tag-stub"><slot /></span>'
  },
  'wa-icon': {
    props: ['name'],
    template: '<i class="wa-icon-stub" />'
  },
  'wa-spinner': {
    template: '<span class="wa-spinner-stub" />'
  }
};

describe('DuplicateTicketDialog.vue', () => {
  let pinia;
  let ticketsStore;

  const currentTicket = {
    _id: 'ticket-1',
    id: 'ITT-10',
    type: 'IT-Ticket',
    title: 'Drucker offline',
    creator: 'lehrer1',
    state: 'offen.neu'
  };

  const otherTicket = {
    _id: 'ticket-2',
    id: 'ITT-4',
    type: 'IT-Ticket',
    title: 'Drucker druckt nicht',
    creator: 'lehrer2',
    state: 'offen.inArbeit'
  };

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    ticketsStore = useTicketsStore();
    ticketsStore.fetchTickets = vi.fn().mockResolvedValue([currentTicket, otherTicket]);
    ticketsStore.executeAction = vi.fn().mockResolvedValue({ success: true });
  });

  it('renders candidates and allows selecting target ticket', async () => {
    const wrapper = mount(DuplicateTicketDialog, {
      props: {
        open: true,
        ticket: currentTicket,
        action: { name: 'als Duplikat schließen', duplicate: true }
      },
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(ticketsStore.fetchTickets).toHaveBeenCalledWith({ type: 'IT-Ticket' });
    expect(wrapper.findAll('.candidate-item')).toHaveLength(1); // Excludes current ticket

    // Select target ticket
    await wrapper.find('.candidate-item').trigger('click');

    // Shows comparison boxes
    expect(wrapper.find('.duplicate-box').text()).toContain('ITT-10');
    expect(wrapper.find('.duplicate-box').text()).toContain('Wird geschlossen');
    expect(wrapper.find('.master-box').text()).toContain('ITT-4');
    expect(wrapper.find('.master-box').text()).toContain('Bleibt offen');
  });

  it('toggles swap so the other ticket is closed as duplicate', async () => {
    const wrapper = mount(DuplicateTicketDialog, {
      props: {
        open: true,
        ticket: currentTicket,
        action: { name: 'als Duplikat schließen', duplicate: true }
      },
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    // Select candidate
    await wrapper.find('.candidate-item').trigger('click');
    await wrapper.vm.$nextTick();

    // Click swap button
    const swapBtn = wrapper.find('.swap-btn');
    await swapBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Now ITT-4 is in duplicate box, and ITT-10 is master
    expect(wrapper.find('.duplicate-box').text()).toContain('ITT-4');
    expect(wrapper.find('.master-box').text()).toContain('ITT-10');

    // Submit
    const submitBtn = wrapper.find('.submit-btn');
    await submitBtn.trigger('click');

    expect(ticketsStore.executeAction).toHaveBeenCalledWith('ticket-2', {
      actionName: 'als Duplikat schließen',
      targetTicketId: 'ITT-10',
      comment: '',
      starTarget: true
    });
    expect(wrapper.emitted('done')).toBeTruthy();
  });

  it('allows navigating back to candidate selection with Zurück button', async () => {
    const wrapper = mount(DuplicateTicketDialog, {
      props: {
        open: true,
        ticket: currentTicket,
        action: { name: 'als Duplikat schließen', duplicate: true }
      },
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    // Select candidate
    await wrapper.find('.candidate-item').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.duplicate-box').exists()).toBe(true);

    // Click back button
    const backBtn = wrapper.find('.back-btn');
    expect(backBtn.exists()).toBe(true);
    await backBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Comparison is gone, candidates container is back
    expect(wrapper.find('.duplicate-box').exists()).toBe(false);
    expect(wrapper.findAll('.candidate-item')).toHaveLength(1);
  });
});
