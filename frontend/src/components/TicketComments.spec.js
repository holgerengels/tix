import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TicketComments from './TicketComments.vue';
import axios from 'axios';

vi.mock('axios');

const globalStubs = {
  'wa-textarea': {
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" class="wa-textarea-stub" />',
    props: ['modelValue', 'placeholder', 'disabled']
  },
  'wa-button': {
    template: '<button class="wa-button-stub" @click="$emit(\'click\')" :disabled="disabled"><slot /></button>',
    props: ['disabled', 'loading']
  }
};

describe('TicketComments.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetches and displays comments using ticketsStore', async () => {
    const mockComments = [
      {
        _id: 'c1',
        creator: 'lehrer1',
        text: 'Erster Kommentar',
        created: '2026-09-22T12:00:00.000Z'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockComments });

    const wrapper = mount(TicketComments, {
      props: {
        ticket: { _id: 'tkt123' }
      },
      global: { stubs: globalStubs }
    });

    expect(axios.get).toHaveBeenCalledWith('/api/tickets/tkt123/comments');

    await vi.waitFor(() => {
      expect(wrapper.find('.comment-item').exists()).toBe(true);
    });

    expect(wrapper.find('.comment-body').text()).toBe('Erster Kommentar');
  });

  it('sends new comment via ticketsStore.addComment', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    const createdComment = {
      _id: 'c2',
      creator: 'currentUser',
      text: 'Neuer Test-Kommentar',
      created: '2026-09-22T13:00:00.000Z'
    };
    axios.post.mockResolvedValueOnce({ data: createdComment });

    const wrapper = mount(TicketComments, {
      props: {
        ticket: { _id: 'tkt123' }
      },
      global: { stubs: globalStubs }
    });

    await vi.waitFor(() => {
      expect(wrapper.find('.empty').exists()).toBe(true);
    });

    // Enter comment text
    const textarea = wrapper.find('textarea');
    await textarea.setValue('Neuer Test-Kommentar');

    // Click submit button
    const btn = wrapper.find('.comment-input button');
    await btn.trigger('click');

    expect(axios.post).toHaveBeenCalledWith(
      '/api/tickets/tkt123/comments',
      { text: 'Neuer Test-Kommentar', silent: false }
    );

    await vi.waitFor(() => {
      expect(wrapper.findAll('.comment-item').length).toBe(1);
    });

    expect(wrapper.find('.comment-body').text()).toBe('Neuer Test-Kommentar');
  });
});
