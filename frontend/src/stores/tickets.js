import { defineStore } from 'pinia';
import axios from 'axios';

export const useTicketsStore = defineStore('tickets', {
  state: () => ({
    loading: false,
    error: null
  }),

  actions: {
    async fetchTicket(id) {
      this.loading = true;
      this.error = null;
      try {
        const res = await axios.get('/api/tickets', {
          params: { id }
        });
        return res.data && res.data.length > 0 ? res.data[0] : null;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async fetchTickets(params = {}) {
      this.loading = true;
      this.error = null;
      try {
        const res = await axios.get('/api/tickets', { params });
        return res.data;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async createTicket(payload) {
      this.loading = true;
      this.error = null;
      try {
        const res = await axios.post('/api/tickets', payload);
        return res.data;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async executeAction(ticketId, payload) {
      this.error = null;
      try {
        const res = await axios.post(`/api/tickets/${ticketId}/action`, payload);
        return res.data;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    },

    async deleteTicket(ticketId) {
      this.error = null;
      try {
        const res = await axios.delete(`/api/tickets/${ticketId}`);
        return res.data;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    },

    async toggleStar(ticketId, currentIsStarred) {
      this.error = null;
      try {
        if (currentIsStarred) {
          await axios.delete(`/api/tickets/${ticketId}/star`);
        } else {
          await axios.post(`/api/tickets/${ticketId}/star`, {});
        }
        return !currentIsStarred;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    },

    async fetchTicketLogs(ticketId) {
      this.error = null;
      try {
        const res = await axios.get(`/api/tickets/${ticketId}/logs`);
        return res.data || [];
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    },

    async checkUndoable(ticketId) {
      try {
        const res = await axios.get(`/api/tickets/${ticketId}/undoable`);
        return res.data || null;
      } catch (err) {
        return null;
      }
    },

    async executeUndo(ticketId) {
      this.error = null;
      try {
        const res = await axios.post(`/api/tickets/${ticketId}/undo`, {});
        return res.data;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    },

    async fetchComments(ticketId) {
      try {
        const res = await axios.get(`/api/tickets/${ticketId}/comments`);
        return res.data || [];
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    },

    async addComment(ticketId, { text, silent = false }) {
      try {
        const res = await axios.post(`/api/tickets/${ticketId}/comments`, { text, silent });
        return res.data;
      } catch (err) {
        this.error = err.response?.data?.message || err.message;
        throw err;
      }
    }
  }
});
