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

  it('shows comments but no input for closed tickets in readonly mode', async () => {
    axios.get.mockResolvedValueOnce({
      data: [{ _id: 'c1', creator: 'lehrer1', text: 'Alter Kommentar', created: '2026-09-22T12:00:00.000Z' }]
    });

    const wrapper = mount(TicketComments, {
      props: {
        ticket: { _id: 'tkt123', state: 'geschlossen.erledigt' },
        readonly: true
      },
      global: { stubs: globalStubs }
    });

    await vi.waitFor(() => {
      expect(wrapper.find('.comment-item').exists()).toBe(true);
    });

    expect(wrapper.find('.comment-input').exists()).toBe(false);
    expect(wrapper.find('.comment-closed-hint').exists()).toBe(true);
    expect(wrapper.vm.hasPendingComment()).toBe(false);

    await wrapper.vm.sendComment();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('hides the input without closed hint when readonly on an open ticket', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });

    const wrapper = mount(TicketComments, {
      props: {
        ticket: { _id: 'tkt123', state: 'offen.neu' },
        readonly: true
      },
      global: { stubs: globalStubs }
    });

    await vi.waitFor(() => {
      expect(wrapper.find('.empty').exists()).toBe(true);
    });

    expect(wrapper.find('.comment-input').exists()).toBe(false);
    expect(wrapper.find('.comment-closed-hint').exists()).toBe(false);
  });

  it('renders mentions with mention-tag in comments', async () => {
    const mockComments = [
      {
        _id: 'c3',
        creator: 'lehrer1',
        text: 'Hallo @col1 bitte prüfen',
        created: '2026-09-22T14:00:00.000Z'
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockComments });

    const wrapper = mount(TicketComments, {
      props: {
        ticket: { _id: 'tkt123' }
      },
      global: { stubs: globalStubs }
    });

    await vi.waitFor(() => {
      expect(wrapper.find('.comment-item').exists()).toBe(true);
    });

    const mentionTag = wrapper.find('.mention-tag');
    expect(mentionTag.exists()).toBe(true);
    expect(mentionTag.text()).toBe('@col1');
  });

  it('shows mention suggestions when typing @ and allows selecting a user', async () => {
    // 1st call: fetchComments
    axios.get.mockResolvedValueOnce({ data: [] });
    // 2nd call: fetchUsersByGroup
    axios.get.mockResolvedValueOnce({
      data: [
        { username: 'col1', displayName: 'Colleague One' },
        { username: 'admin', displayName: 'Administrator' }
      ]
    });

    const wrapper = mount(TicketComments, {
      props: {
        ticket: { _id: 'tkt123' }
      },
      global: { stubs: globalStubs }
    });

    await vi.waitFor(() => {
      expect(wrapper.find('.empty').exists()).toBe(true);
    });

    const textarea = wrapper.find('textarea');
    // Simulate typing "@col"
    await textarea.setValue('Hallo @col');
    await textarea.trigger('input');

    await vi.waitFor(() => {
      expect(wrapper.find('.mention-suggestions').exists()).toBe(true);
    });

    const items = wrapper.findAll('.mention-item');
    expect(items.length).toBe(1);
    expect(items[0].text()).toContain('Colleague One');

    // Click suggestion
    await items[0].trigger('mousedown');

    // Textarea value should be updated with mention
    expect(textarea.element.value).toBe('Hallo @col1 ');
  });
});
