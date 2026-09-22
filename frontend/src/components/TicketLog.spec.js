import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TicketLog from './TicketLog.vue';
import axios from 'axios';

vi.mock('axios');

describe('TicketLog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders loading and then logs using ticketsStore', async () => {
    const mockLogs = [
      {
        _id: 'l1',
        editor: 'admin',
        timestamp: '2026-09-22T10:00:00.000Z',
        action: 'Ticket erstellt'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockLogs });

    const wrapper = mount(TicketLog, {
      props: {
        ticketId: 'test-123'
      }
    });

    expect(axios.get).toHaveBeenCalledWith('/api/tickets/test-123/logs');

    // Wait for async fetchLogs to settle
    await vi.waitFor(() => {
      expect(wrapper.find('.log-entry').exists()).toBe(true);
    });

    expect(wrapper.find('.editor').text()).toBe('admin');
    expect(wrapper.find('.action').text()).toBe('Ticket erstellt');
  });

  it('displays empty message when no logs exist', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    const wrapper = mount(TicketLog, {
      props: {
        ticketId: 'test-456'
      }
    });

    await vi.waitFor(() => {
      expect(wrapper.find('.empty').text()).toBe('Kein Verlauf verfügbar.');
    });
  });
});
