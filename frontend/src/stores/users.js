import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useUsersStore = defineStore('users', () => {
    // Cache: username -> displayName
    const cache = ref({})

    // Pending requests to avoid duplicate fetches
    const pending = {}

    /**
     * Get display name for a username.
     * Returns cached displayName immediately if available, otherwise username as fallback
     * and triggers a background fetch.
     */
    function getDisplayName(username) {
        if (!username) return ''
        if (cache.value[username]) return cache.value[username]

        // Trigger background fetch if not already pending
        if (!pending[username]) {
            pending[username] = true
            fetchUser(username)
        }

        // Return username as fallback until resolved
        return username
    }

    /**
     * Fetch a single user's display name from the backend.
     */
    async function fetchUser(username) {
        try {
            const res = await axios.get(`/api/users/${encodeURIComponent(username)}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
            cache.value[username] = res.data.displayName || username
        } catch (err) {
            console.error(`Failed to fetch user ${username}:`, err)
            cache.value[username] = username
        } finally {
            delete pending[username]
        }
    }

    /**
     * Fetch users by groups (for User form fields).
     * Caches all returned users and returns the full array.
     */
    async function fetchUsersByGroup(groups = [], forceFetch = false) {
        try {
            const groupsParam = groups.join(',')
            const res = await axios.get('/api/users', {
                params: { groups: groupsParam, forceFetch: forceFetch ? 'true' : 'false' },
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            })
            const users = res.data
            // Cache all returned users
            users.forEach(u => {
                if (u.displayName) {
                    cache.value[u.username] = u.displayName
                }
            })
            return users
        } catch (err) {
            console.error('Failed to fetch users by group:', err)
            return []
        }
    }

    return { cache, getDisplayName, fetchUser, fetchUsersByGroup }
})
