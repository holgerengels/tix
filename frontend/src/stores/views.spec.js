import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useViewsStore } from './views';
import axios from 'axios';

vi.mock('axios');

describe('useViewsStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        localStorage.setItem('token', 'fake-token');
    });

    it('should load saved filters from backend', async () => {
        const store = useViewsStore();
        const mockData = {
            my: [{ name: 'TestView', pinned: true, type: ['IT-Ticket'] }]
        };
        axios.get.mockResolvedValueOnce({ data: mockData });

        const res = await store.loadSavedFilters();
        expect(res).toEqual(mockData);
        expect(store.allSavedFilters).toEqual(mockData);
        expect(store.getPinned('my')).toHaveLength(1);
        expect(store.getPinned('my')[0].name).toBe('TestView');
    });

    it('should save a filter and persist to backend', async () => {
        const store = useViewsStore();
        axios.post.mockResolvedValueOnce({ data: { message: 'ok' } });

        await store.saveFilter('my', { name: 'NewFilter', status: 'offen' });

        expect(store.allSavedFilters.my).toHaveLength(1);
        expect(store.allSavedFilters.my[0].name).toBe('NewFilter');
        expect(axios.post).toHaveBeenCalledWith('/api/settings/filters', store.allSavedFilters, expect.any(Object));
    });

    it('should toggle pin and persist', async () => {
        const store = useViewsStore();
        store.allSavedFilters = {
            assigned: [{ name: 'AssignedOpen', pinned: false }]
        };
        axios.post.mockResolvedValueOnce({ data: { message: 'ok' } });

        await store.togglePin('assigned', 'AssignedOpen');
        expect(store.allSavedFilters.assigned[0].pinned).toBe(true);
        expect(store.getPinned('assigned')).toHaveLength(1);

        await store.togglePin('assigned', 'AssignedOpen');
        expect(store.allSavedFilters.assigned[0].pinned).toBe(false);
        expect(store.getPinned('assigned')).toHaveLength(0);
    });

    it('should delete a filter and persist', async () => {
        const store = useViewsStore();
        store.allSavedFilters = {
            all: [{ name: 'F1' }, { name: 'F2' }]
        };
        axios.post.mockResolvedValueOnce({ data: { message: 'ok' } });

        await store.deleteFilter('all', 0);
        expect(store.allSavedFilters.all).toHaveLength(1);
        expect(store.allSavedFilters.all[0].name).toBe('F2');
    });

    it('should correctly build query parameters with filterToQuery', () => {
        const store = useViewsStore();
        const query = store.filterToQuery({
            type: ['IT-Ticket'],
            status: 'offen',
            creator: 'lehrer1',
            sort: '-created'
        }, 'my');

        expect(query).toEqual({
            filter: 'my',
            type: ['IT-Ticket'],
            status: 'offen',
            creator: 'lehrer1',
            sort: '-created'
        });
    });

    it('should accurately detect active filter and active pinned filter in route', () => {
        const store = useViewsStore();
        const filter = {
            name: 'P1',
            pinned: true,
            status: 'in_progress',
            type: ['Hardware']
        };
        store.allSavedFilters = {
            my: [filter]
        };

        const matchingRoute = {
            path: '/',
            query: {
                filter: 'my',
                status: 'in_progress',
                type: ['Hardware']
            }
        };

        const nonMatchingRoute = {
            path: '/',
            query: {
                filter: 'my',
                status: 'done'
            }
        };

        expect(store.isFilterActive(filter, 'my', matchingRoute)).toBe(true);
        expect(store.isFilterActive(filter, 'my', nonMatchingRoute)).toBe(false);

        expect(store.hasActivePinnedFilter('my', matchingRoute)).toBe(true);
        expect(store.hasActivePinnedFilter('my', nonMatchingRoute)).toBe(false);
    });

    it('should support array status in filterToQuery and isFilterActive (multiselect)', () => {
        const store = useViewsStore();
        const filter = {
            name: 'MultiStatusView',
            status: ['offen.*', 'in_bearbeitung']
        };

        const query = store.filterToQuery(filter, 'assigned');
        expect(query).toEqual({
            filter: 'assigned',
            status: ['offen.*', 'in_bearbeitung']
        });

        // Test isFilterActive with matching query in different order
        const routeMatching = {
            path: '/',
            query: {
                filter: 'assigned',
                status: ['in_bearbeitung', 'offen.*']
            }
        };
        expect(store.isFilterActive(filter, 'assigned', routeMatching)).toBe(true);

        // Empty status should not be added to query
        const emptyQuery = store.filterToQuery({ status: [] }, 'my');
        expect(emptyQuery).toEqual({ filter: 'my' });
    });
});
