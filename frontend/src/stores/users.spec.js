import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUsersStore } from './users';
import axios from 'axios';

vi.mock('axios');

describe('users store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        localStorage.setItem('token', 'test-token');
    });

    it('fetches and caches groups via fetchGroups() with request deduplication', async () => {
        axios.get.mockResolvedValueOnce({ data: ['Lehrkräfte', 'Netzwerkteam', 'Schulleitung'] });

        const store = useUsersStore();
        const [res1, res2] = await Promise.all([
            store.fetchGroups(),
            store.fetchGroups()
        ]);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(axios.get).toHaveBeenCalledWith('/api/groups', expect.any(Object));
        expect(res1).toEqual(['Lehrkräfte', 'Netzwerkteam', 'Schulleitung']);
        expect(res2).toEqual(['Lehrkräfte', 'Netzwerkteam', 'Schulleitung']);

        // Subsequent call uses cache
        const res3 = await store.fetchGroups();
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(res3).toEqual(['Lehrkräfte', 'Netzwerkteam', 'Schulleitung']);
    });

    it('deduplicates concurrent fetchUsersByGroup() calls for the same group key and caches results', async () => {
        const mockUsers = [
            { username: 'hengels', displayName: 'Holger Engels', employeeId: 'h.engels', groups: ['Administration', 'Lehrkräfte'] },
            { username: 'mmuster', displayName: 'Max Mustermann', employeeId: 'm.mustermann', groups: ['Lehrkräfte'] }
        ];
        axios.get.mockResolvedValueOnce({ data: mockUsers });

        const store = useUsersStore();
        const [u1, u2] = await Promise.all([
            store.fetchUsersByGroup(['Lehrkräfte'], false),
            store.fetchUsersByGroup(['Lehrkräfte'], false)
        ]);

        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(u1).toEqual(mockUsers);
        expect(u2).toEqual(mockUsers);

        // Display names and user data are populated in store cache
        expect(store.getDisplayName('hengels')).toBe('Holger Engels');
        expect(store.getUserData('hengels')?.employeeId).toBe('h.engels');

        // Subsequent non-forced call returns cached array without HTTP request
        const u3 = await store.fetchUsersByGroup(['Lehrkräfte'], false);
        expect(axios.get).toHaveBeenCalledTimes(1);
        expect(u3).toEqual(mockUsers);
    });

    it('filters users by selected groups in getUsersForGroups()', async () => {
        const mockUsers = [
            { username: 'hengels', displayName: 'Holger Engels', employeeId: 'h.engels', groups: ['Administration'] },
            { username: 'lehrer1', displayName: 'Max Mustermann', employeeId: 'm.mustermann', groups: ['Lehrkräfte'] },
            { username: 'schulleiter', displayName: 'Thomas Braun', employeeId: 't.braun', groups: ['Schulleitung', 'Lehrkräfte'] }
        ];
        axios.get.mockResolvedValueOnce({ data: mockUsers });

        const store = useUsersStore();
        await store.fetchUsersByGroup([], false);

        const schulleitung = store.getUsersForGroups(['Schulleitung']);
        expect(schulleitung.map(u => u.username)).toEqual(['schulleiter']);

        const lehrkraefte = store.getUsersForGroups(['Lehrkräfte']);
        expect(lehrkraefte.map(u => u.username)).toEqual(['lehrer1', 'schulleiter']);

        const empty = store.getUsersForGroups([]);
        expect(empty).toEqual([]);
    });
});
