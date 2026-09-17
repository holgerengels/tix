import { defineStore } from 'pinia'
import axios from 'axios'

let _loadPromise = null;

export const useViewsStore = defineStore('views', {
    state: () => ({
        allSavedFilters: {}, // Keyed by category: { my: [], assigned: [], starred: [], all: [] }
        loading: false,
        error: null
    }),

    getters: {
        getPinned: (state) => (category) => {
            const list = state.allSavedFilters[category] || [];
            return list.filter(f => !!f.pinned);
        },
        getFilters: (state) => (category) => {
            return state.allSavedFilters[category] || [];
        }
    },

    actions: {
        async loadSavedFilters(force = false) {
            const token = localStorage.getItem('token');
            if (!token) return {};
            if (Object.keys(this.allSavedFilters).length > 0 && !force) return this.allSavedFilters;
            if (_loadPromise && !force) return _loadPromise;

            this.loading = true;
            this.error = null;

            _loadPromise = axios.get('/api/settings/filters', {
                headers: { Authorization: `Bearer ${token}` }
            }).then(res => {
                this.allSavedFilters = res.data || {};
                return this.allSavedFilters;
            }).catch(err => {
                console.error('Error fetching saved filters:', err);
                this.error = err;
                _loadPromise = null;
                throw err;
            }).finally(() => {
                this.loading = false;
            });

            return _loadPromise;
        },

        async saveFilter(category, newFilter) {
            if (!this.allSavedFilters[category]) {
                this.allSavedFilters[category] = [];
            }
            const currentFilters = this.allSavedFilters[category];
            const existingIndex = currentFilters.findIndex(f => f.name === newFilter.name);
            if (existingIndex >= 0) {
                if (newFilter.pinned === undefined) {
                    newFilter.pinned = currentFilters[existingIndex].pinned;
                }
                currentFilters[existingIndex] = newFilter;
            } else {
                currentFilters.push(newFilter);
            }

            await this._persist();
        },

        async deleteFilter(category, index) {
            const currentFilters = this.allSavedFilters[category] || [];
            currentFilters.splice(index, 1);
            await this._persist();
        },

        async togglePin(category, filterName) {
            const currentFilters = this.allSavedFilters[category] || [];
            const target = currentFilters.find(f => f.name === filterName);
            if (target) {
                target.pinned = !target.pinned;
                await this._persist();
            }
        },

        async _persist() {
            const token = localStorage.getItem('token');
            if (!token) return;
            try {
                await axios.post('/api/settings/filters', this.allSavedFilters, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } catch (e) {
                console.error('Error saving filters to backend:', e);
                throw e;
            }
        },

        filterToQuery(filter, category) {
            const query = { filter: category };
            if (filter.type && filter.type.length) query.type = filter.type;
            if (filter.badges && filter.badges.length) query.badge = filter.badges;
            if (filter.status) {
                if (Array.isArray(filter.status)) {
                    if (filter.status.length) query.status = filter.status;
                } else {
                    query.status = filter.status;
                }
            }
            if (filter.action) query.action = filter.action;
            if (filter.creator) query.creator = filter.creator;
            if (filter.assignee) query.assignee = filter.assignee;
            if (filter.assignmentType) query.assignmentType = filter.assignmentType;
            if (filter.dateRange) query.dateRange = filter.dateRange;
            if (filter.dateFrom) query.dateFrom = filter.dateFrom;
            if (filter.dateTo) query.dateTo = filter.dateTo;
            if (filter.sort) query.sort = filter.sort;
            if (filter.cols) query.cols = filter.cols;
            return query;
        },

        isFilterActive(filter, category, route) {
            if (route.path !== '/') return false;
            const q = this.filterToQuery(filter, category);
            const qKeys = Object.keys(q);
            const routeKeys = Object.keys(route.query);
            if (qKeys.length !== routeKeys.length) return false;
            return qKeys.every(k => {
                const v1 = q[k];
                const v2 = route.query[k];
                if (Array.isArray(v1) || Array.isArray(v2)) {
                    const a1 = (Array.isArray(v1) ? v1 : [v1]).map(String).sort();
                    const a2 = (Array.isArray(v2) ? v2 : [v2]).map(String).sort();
                    return a1.length === a2.length && a1.every((x, i) => x === a2[i]);
                }
                return String(v1) === String(v2);
            });
        },

        hasActivePinnedFilter(category, route) {
            const pinned = this.getPinned(category);
            return pinned.some(f => this.isFilterActive(f, category, route));
        },

        reset() {
            this.allSavedFilters = {};
            this.loading = false;
            this.error = null;
            _loadPromise = null;
        }
    }
})
