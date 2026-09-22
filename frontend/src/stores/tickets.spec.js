import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTicketsStore } from './tickets';
import axios from 'axios';

vi.mock('axios');

describe('useTicketsStore', () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useTicketsStore();
    vi.clearAllMocks();
  });

  describe('fetchTicket', () => {
    it('successfully fetches a single ticket by id', async () => {
      const mockTicket = { _id: 't1', id: 'TKT-1', title: 'Test Ticket' };
      axios.get.mockResolvedValueOnce({ data: [mockTicket] });

      const result = await store.fetchTicket('TKT-1');

      expect(axios.get).toHaveBeenCalledWith('/api/tickets', { params: { id: 'TKT-1' } });
      expect(result).toEqual(mockTicket);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('returns null if response is empty', async () => {
      axios.get.mockResolvedValueOnce({ data: [] });

      const result = await store.fetchTicket('NOT-EXIST');

      expect(result).toBeNull();
    });

    it('handles error when fetchTicket fails', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(store.fetchTicket('ERR-1')).rejects.toThrow('Network error');
      expect(store.error).toBe('Network error');
      expect(store.loading).toBe(false);
    });
  });

  describe('fetchTickets', () => {
    it('fetches ticket list with parameters', async () => {
      const mockList = [{ id: 'T1' }, { id: 'T2' }];
      axios.get.mockResolvedValueOnce({ data: mockList });

      const result = await store.fetchTickets({ filter: 'all', search: 'printer' });

      expect(axios.get).toHaveBeenCalledWith('/api/tickets', { params: { filter: 'all', search: 'printer' } });
      expect(result).toEqual(mockList);
    });
  });

  describe('createTicket', () => {
    it('creates a new ticket via POST', async () => {
      const payload = { type: 'IT-Ticket', title: 'New one' };
      const created = { _id: '123', ...payload };
      axios.post.mockResolvedValueOnce({ data: created });

      const res = await store.createTicket(payload);

      expect(axios.post).toHaveBeenCalledWith('/api/tickets', payload);
      expect(res).toEqual(created);
    });
  });

  describe('executeAction', () => {
    it('executes action and returns response data', async () => {
      const updatedTicket = { _id: 't1', state: 'closed' };
      axios.post.mockResolvedValueOnce({ data: { message: 'ok', ticket: updatedTicket } });

      const res = await store.executeAction('t1', { actionName: 'close' });

      expect(axios.post).toHaveBeenCalledWith('/api/tickets/t1/action', { actionName: 'close' });
      expect(res.ticket).toEqual(updatedTicket);
    });
  });

  describe('deleteTicket', () => {
    it('deletes ticket via DELETE', async () => {
      axios.delete.mockResolvedValueOnce({ data: { message: 'deleted' } });

      const res = await store.deleteTicket('t1');

      expect(axios.delete).toHaveBeenCalledWith('/api/tickets/t1');
      expect(res).toEqual({ message: 'deleted' });
    });
  });

  describe('toggleStar', () => {
    it('posts star when not currently starred', async () => {
      axios.post.mockResolvedValueOnce({ data: { message: 'starred' } });

      const newStarred = await store.toggleStar('t1', false);

      expect(axios.post).toHaveBeenCalledWith('/api/tickets/t1/star', {});
      expect(newStarred).toBe(true);
    });

    it('deletes star when currently starred', async () => {
      axios.delete.mockResolvedValueOnce({ data: { message: 'unstarred' } });

      const newStarred = await store.toggleStar('t1', true);

      expect(axios.delete).toHaveBeenCalledWith('/api/tickets/t1/star');
      expect(newStarred).toBe(false);
    });
  });

  describe('fetchTicketLogs', () => {
    it('fetches and returns logs', async () => {
      const mockLogs = [{ _id: 'l1', action: 'created' }];
      axios.get.mockResolvedValueOnce({ data: mockLogs });

      const result = await store.fetchTicketLogs('t1');

      expect(axios.get).toHaveBeenCalledWith('/api/tickets/t1/logs');
      expect(result).toEqual(mockLogs);
    });
  });

  describe('checkUndoable & executeUndo', () => {
    it('fetches undo info', async () => {
      const undoInfo = { action: 'genehmigen' };
      axios.get.mockResolvedValueOnce({ data: undoInfo });

      const res = await store.checkUndoable('t1');

      expect(axios.get).toHaveBeenCalledWith('/api/tickets/t1/undoable');
      expect(res).toEqual(undoInfo);
    });

    it('returns null on undo check failure', async () => {
      axios.get.mockRejectedValueOnce(new Error('fail'));

      const res = await store.checkUndoable('t1');

      expect(res).toBeNull();
    });

    it('executes undo and returns response', async () => {
      const restored = { _id: 't1', state: 'new' };
      axios.post.mockResolvedValueOnce({ data: { message: 'undone', ticket: restored } });

      const res = await store.executeUndo('t1');

      expect(axios.post).toHaveBeenCalledWith('/api/tickets/t1/undo', {});
      expect(res.ticket).toEqual(restored);
    });
  });

  describe('comments', () => {
    it('fetches and returns comments', async () => {
      const mockComments = [{ text: 'Comment 1' }];
      axios.get.mockResolvedValueOnce({ data: mockComments });

      const res = await store.fetchComments('t1');

      expect(axios.get).toHaveBeenCalledWith('/api/tickets/t1/comments');
      expect(res).toEqual(mockComments);
    });

    it('adds comment and returns it', async () => {
      const newComment = { text: 'Second' };
      axios.post.mockResolvedValueOnce({ data: newComment });

      const res = await store.addComment('t1', { text: 'Second', silent: false });

      expect(axios.post).toHaveBeenCalledWith('/api/tickets/t1/comments', { text: 'Second', silent: false });
      expect(res).toEqual(newComment);
    });
  });
});
