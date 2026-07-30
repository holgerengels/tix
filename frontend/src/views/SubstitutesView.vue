<template>
  <div class="substitutes-view" :class="{ 'is-mobile': ui.isMobile }">
    <div class="header">
        <wa-button variant="text" size="small" appearance="outlined" @click="ui.toggleSidebar()">
            <wa-icon name="list" style="font-size: 1.5rem;"></wa-icon>
        </wa-button>
        <h2>Vertretungen</h2>
    </div>

    <wa-card class="substitutes-card">
      <div class="substitutes-form">
        <h3 class="section-header">Neue Vertretung einrichten</h3>
        <div class="form-row">
            <div class="form-field">
                <WAAutocomplete
                    v-model="newAbsentUser"
                    label="Abwesende Person"
                    :options="userOptions"
                    hint="Person, die vertreten wird"
                />
            </div>
            <div class="form-field">
                <WAAutocomplete
                    v-model="newSubstituteUser"
                    label="Vertretung"
                    :options="userOptions"
                    hint="Person, die vertritt"
                />
            </div>
            <wa-button variant="brand" @click="addSubstitute" :disabled="!newAbsentUser || !newSubstituteUser || newAbsentUser === newSubstituteUser">
                <wa-icon slot="start" name="plus-lg"></wa-icon> Hinzufügen
            </wa-button>
        </div>
      </div>

      <h3 class="section-header" style="margin-top: 2rem;">Aktive Vertretungen</h3>

      <wa-spinner v-if="loading"></wa-spinner>

      <div v-else-if="substituteEntries.length === 0" class="empty-state">
          Keine aktiven Vertretungen.
      </div>

      <table v-else class="substitutes-table">
        <thead>
            <tr>
                <th>Abwesende Person</th>
                <th>Wird vertreten von</th>
                <th></th>
            </tr>
        </thead>
        <tbody>
            <tr v-for="entry in substituteEntries" :key="entry.username + '-' + entry.substitute">
                <td>{{ usersStore.getDisplayName(entry.username) }}</td>
                <td>{{ usersStore.getDisplayName(entry.substitute) }}</td>
                <td class="actions-cell">
                    <wa-button size="small" variant="danger" appearance="plain" @click="removeSubstitute(entry.username, entry.substitute)">
                        <wa-icon name="x-lg"></wa-icon>
                    </wa-button>
                </td>
            </tr>
        </tbody>
      </table>

      <div class="info-note">
        <wa-icon name="info-circle"></wa-icon>
        Änderungen greifen beim nächsten Login der vertretenden Person (oder nach Token-Refresh, max. 1h).
      </div>
    </wa-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useUiStore } from '../stores/ui';
import { useUsersStore } from '../stores/users';
import { toast } from '../composables/useToast';
import WAAutocomplete from '../components/WAAutocomplete.vue';

const ui = useUiStore();
const usersStore = useUsersStore();

const loading = ref(false);
const rawSubstitutes = ref([]); // Array of { username, displayName, substitutedBy, groups }
const allUsers = ref([]);
const newAbsentUser = ref('');
const newSubstituteUser = ref('');

const userOptions = computed(() => {
    return allUsers.value.map(u => ({
        value: u.username,
        label: u.displayName || u.username
    }));
});

// Flatten: each user with substitutedBy produces one row per substitute
const substituteEntries = computed(() => {
    const entries = [];
    rawSubstitutes.value.forEach(user => {
        (user.substitutedBy || []).forEach(substitute => {
            entries.push({
                username: user.username,
                substitute: substitute
            });
        });
    });
    return entries.sort((a, b) => a.username.localeCompare(b.username));
});

const fetchSubstitutes = async () => {
    loading.value = true;
    try {
        const res = await axios.get('/api/substitutes', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        rawSubstitutes.value = res.data;
    } catch (err) {
        console.error('Failed to fetch substitutes:', err);
        toast.error('Fehler beim Laden der Vertretungen');
    } finally {
        loading.value = false;
    }
};

const fetchUsers = async () => {
    try {
        const users = await usersStore.fetchUsersByGroup([], true);
        allUsers.value = users;
    } catch (err) {
        console.error('Failed to fetch users:', err);
    }
};

const addSubstitute = async () => {
    if (!newAbsentUser.value || !newSubstituteUser.value) return;

    try {
        // Find existing substitutedBy for the absent user, or start empty
        const existing = rawSubstitutes.value.find(u => u.username === newAbsentUser.value);
        const currentSubstitutes = existing ? [...(existing.substitutedBy || [])] : [];
        
        if (currentSubstitutes.includes(newSubstituteUser.value)) {
            toast.warning('Diese Vertretung existiert bereits');
            return;
        }

        currentSubstitutes.push(newSubstituteUser.value);

        await axios.put(`/api/users/${encodeURIComponent(newAbsentUser.value)}/substitutes`, {
            substitutedBy: currentSubstitutes
        }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        toast.success('Vertretung eingerichtet');
        newAbsentUser.value = '';
        newSubstituteUser.value = '';
        await fetchSubstitutes();
    } catch (err) {
        console.error('Failed to add substitute:', err);
        toast.error('Fehler beim Einrichten der Vertretung');
    }
};

const removeSubstitute = async (username, substitute) => {
    try {
        const existing = rawSubstitutes.value.find(u => u.username === username);
        if (!existing) return;

        const updatedSubstitutes = (existing.substitutedBy || []).filter(d => d !== substitute);

        await axios.put(`/api/users/${encodeURIComponent(username)}/substitutes`, {
            substitutedBy: updatedSubstitutes
        }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        toast.success('Vertretung entfernt');
        await fetchSubstitutes();
    } catch (err) {
        console.error('Failed to remove substitute:', err);
        toast.error('Fehler beim Entfernen der Vertretung');
    }
};

onMounted(() => {
    fetchSubstitutes();
    fetchUsers();
});
</script>

<style scoped>
.substitutes-view {
    max-width: 1000px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}
.header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 1rem;
    flex-shrink: 0;
}
.header h2 {
    margin: 0;
}
.substitutes-card {
    width: auto;
    margin: 0 1rem 1rem 1rem;
}
.section-header {
    margin: 0 0 1rem 0;
}
.form-row {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    flex-wrap: wrap;
}
.form-field {
    flex: 1;
    min-width: 200px;
}
.substitutes-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid var(--wa-color-neutral-90);
    border-radius: var(--wa-border-radius-medium);
    margin-top: 1rem;
}
.substitutes-table th,
.substitutes-table td {
    padding: 0.6rem 1rem;
    text-align: left;
    border-bottom: 1px solid var(--wa-color-neutral-90);
}
.substitutes-table th {
    background-color: var(--wa-color-neutral-95);
    font-weight: 600;
    color: var(--wa-color-neutral-30);
    font-size: 0.85rem;
    text-transform: uppercase;
}
.substitutes-table tr:last-child td {
    border-bottom: none;
}
.substitutes-table tr:hover {
    background-color: var(--wa-color-brand-95);
}
.actions-cell {
    width: 50px;
    text-align: center;
}
.empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--wa-color-neutral-40);
    border: 1px dashed var(--wa-color-neutral-60);
    border-radius: var(--wa-border-radius-medium);
    margin-top: 1rem;
}
.info-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    background: var(--wa-color-brand-95);
    border-radius: var(--wa-border-radius-medium);
    color: var(--wa-color-neutral-30);
    font-size: 0.85rem;
}

/* Mobile */
.is-mobile .substitutes-card {
    margin: 0;
}
.is-mobile .header {
    margin: 1rem;
}
.is-mobile .form-row {
    flex-direction: column;
}
</style>
