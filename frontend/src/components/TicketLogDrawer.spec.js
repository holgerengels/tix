import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TicketLogDrawer from './TicketLogDrawer.vue';
import axios from 'axios';

vi.mock('axios');

const globalStubs = {
  'wa-drawer': {
    template: '<div class="wa-drawer-stub" :label="label" :open="open"><slot name="header-actions" /><slot /></div>',
    props: ['label', 'open', 'placement']
  },
  'wa-button': {
    template: '<button class="wa-button-stub" @click="$emit(\'click\')"><slot /></button>'
  },
  'wa-icon': true,
  'wa-spinner': true,
  'wa-callout': true
};

describe('TicketLogDrawer.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders drawer with computed title', () => {
    const wrapper = mount(TicketLogDrawer, {
      props: {
        ticketId: '123',
        ticketDisplayId: 'TEST-1',
        open: false
      },
      global: { stubs: globalStubs }
    });

    const drawer = wrapper.find('.wa-drawer-stub');
    expect(drawer.exists()).toBe(true);
    expect(drawer.attributes('label')).toBe('Protokoll: TEST-1');
  });

  it('fetches logs when open is true', async () => {
    const mockLogs = [
      {
        _id: 'l1',
        editor: 'admin',
        timestamp: '2026-09-22T10:00:00.000Z',
        action: 'Ticket erstellt'
      },
      {
        _id: 'l2',
        editor: 'lehrer1',
        timestamp: '2026-09-22T11:00:00.000Z',
        action: 'Status geändert'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockLogs });

    const wrapper = mount(TicketLogDrawer, {
      props: {
        ticketId: 'ticket123',
        ticketDisplayId: 'TEST-1',
        open: true
      },
      global: { stubs: globalStubs }
    });

    await vi.waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith('/api/tickets/ticket123/logs');
      expect(wrapper.findAll('.timeline-item').length).toBe(2);
    });

    expect(wrapper.text()).toContain('Ticket erstellt');
    expect(wrapper.text()).toContain('Status geändert');
  });

  it('emits close event when handleClose is called', async () => {
    axios.get.mockResolvedValue({ data: [] });
    const wrapper = mount(TicketLogDrawer, {
      props: {
        ticketId: '123',
        open: true
      },
      global: { stubs: globalStubs }
    });

    // trigger wa-after-hide on drawer stub
    await wrapper.find('.wa-drawer-stub').trigger('wa-after-hide');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
