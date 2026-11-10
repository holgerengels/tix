import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useUsersStore = defineStore('users', () => {
    // Cache: username -> displayName
    const cache = ref({})

    // Cache: username -> full user object { username, displayName, employeeId, groups, ... }
    const userDataCache = ref({})

    // Cache: groupKey -> users array
    const usersByGroupCache = ref({})

    // Cache: all fetched users array and groups array
    const allUsersLoaded = ref(false)
    const groupsCache = ref(null)

    // Pending requests to avoid duplicate fetches
    const pending = {}
    const pendingByGroup = {}
    let pendingAllUsers = null
    let pendingGroups = null

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
     * Caches all returned users and deduplicates concurrent requests for the same group key.
     */
    async function fetchUsersByGroup(groups = [], forceFetch = false) {
        const groupList = Array.isArray(groups) ? groups : (groups ? [groups] : [])
        const groupsParam = groupList.join(',')
        if (!forceFetch) {
            if (usersByGroupCache.value[groupsParam]?.length > 0) {
                return usersByGroupCache.value[groupsParam]
            }
            if (pendingByGroup[groupsParam]) {
                return pendingByGroup[groupsParam]
            }
        }

        const requestPromise = (async () => {
            try {
                const res = await axios.get('/api/users', {
                    params: { groups: groupsParam, forceFetch: forceFetch ? 'true' : 'false' },
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                })
                const users = Array.isArray(res.data) ? res.data : []

                // Batch-update caches to avoid triggering 2*N reactive notifications
                const nextCache = { ...cache.value }
                const nextUserDataCache = { ...userDataCache.value }

                for (const u of users) {
                    if (u.displayName && nextCache[u.username] !== u.displayName) {
                        nextCache[u.username] = u.displayName
                    }
                    nextUserDataCache[u.username] = u
                    if (u.username) {
                        nextUserDataCache[u.username.toLowerCase()] = u
                    }
                }

                cache.value = nextCache
                userDataCache.value = nextUserDataCache
                if (forceFetch) {
                    usersByGroupCache.value = {}
                }
                if (users.length > 0) {
                    usersByGroupCache.value[groupsParam] = users
                    if (groupList.length === 0) {
                        allUsersLoaded.value = true
                    }
                }
                return users
            } catch (err) {
                console.error('Failed to fetch users by group:', err)
                return []
            } finally {
                delete pendingByGroup[groupsParam]
            }
        })()

        pendingByGroup[groupsParam] = requestPromise
        return requestPromise
    }

    /**
     * Fetch all available user groups from the backend (cached).
     */
    async function fetchGroups() {
        if (groupsCache.value?.length > 0) return groupsCache.value
        if (pendingGroups) return pendingGroups

        pendingGroups = axios.get('/api/groups', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(res => {
            const groups = Array.isArray(res.data) ? res.data : []
            if (groups.length > 0) {
                groupsCache.value = groups
            }
            return groups
        }).catch(err => {
            console.error('Failed to fetch groups:', err)
            return []
        }).finally(() => {
            pendingGroups = null
        })

        return pendingGroups
    }

    /**
     * Get cached full user data object for a username.
     * Returns the cached user object or null if not found.
     */
    function getUserData(username) {
        if (!username) return null
        return userDataCache.value[username.toLowerCase()] || userDataCache.value[username] || null
    }

    /**
     * Synchronously return cached users matching the given groups.
     * If groups contains 'all' or '<alle>', returns all cached users.
     * Triggers a background fetch of all users if not yet loaded.
     */
    function getUsersForGroups(groups = []) {
        if (!allUsersLoaded.value && !pendingAllUsers) {
            pendingAllUsers = fetchUsersByGroup([], false).finally(() => {
                pendingAllUsers = null
            })
        }

        const list = Array.isArray(groups) ? groups : (groups ? [groups] : [])
        if (list.length === 0) return []

        // Deduplicate user objects from userDataCache
        const uniqueUsers = new Map()
        for (const u of Object.values(userDataCache.value)) {
            if (u && u.username) {
                uniqueUsers.set(u.username.toLowerCase(), u)
            }
        }
        const allUsers = Array.from(uniqueUsers.values())

        if (list.includes('all') || list.includes('<alle>')) {
            return allUsers
        }

        return allUsers.filter(u => Array.isArray(u.groups) && u.groups.some(g => list.includes(g)))
    }

    return {
        cache,
        userDataCache,
        getDisplayName,
        fetchUser,
        fetchUsersByGroup,
        fetchGroups,
        getUserData,
        getUsersForGroups
    }
})
