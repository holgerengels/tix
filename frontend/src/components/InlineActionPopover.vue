<template>
    <div style="display: inline-block;">
        <wa-button 
            :id="triggerId"
            size="small" 
            appearance="plain" 
            class="action"
        >
            {{ action.name }}
        </wa-button>
        
        <wa-popover 
            :id="popoverId"
            :for="triggerId"
            :placement="placement" 
            distance="5" 
            skidding="0"
            @wa-show="onShow"
            @wa-hide="onHide"
        >
            <template v-if="action.inline === 'comment'">
                <wa-textarea 
                    :value="comment"
                    @input="comment = $event.target.value"
                    placeholder="Kommentar..."
                    resize="auto"
                    rows="2"
                    autofocus
                ></wa-textarea>
                <div class="popover-actions">
                    <wa-button appearance="plain" size="small" @click="close">Abbrechen</wa-button>
                    <wa-button 
                        size="small" 
                        variant="primary" 
                        :loading="loading"
                        @click="submitComment"
                    >
                        {{ action.name }}
                    </wa-button>
                </div>
            </template>

            <template v-else-if="action.inline === 'assign'">
                <div style="padding: 1rem; display: flex; justify-content: center;" v-if="loadingUsers">
                    <wa-spinner></wa-spinner>
                </div>
                <wa-select 
                    v-else
                    :value.prop="assignee"
                    @change="assignee = $event.target.value"
                    placeholder="Benutzer auswählen..."
                    hoist
                >
                    <wa-option v-for="u in availableAssignees" :key="u.username" :value="u.username">
                        {{ u.displayName || u.username }}
                    </wa-option>
                </wa-select>
                <div class="popover-actions">
                    <wa-button appearance="plain" size="small" @click="close">Abbrechen</wa-button>
                    <wa-button
                        size="small" 
                        variant="primary" 
                        :loading="loading"
                        :disabled="!assignee"
                        @click="submitAssign"
                    >
                        Zuweisen
                    </wa-button>
                </div>
            </template>
        </wa-popover>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';
import { useUsersStore } from '../stores/users';
import { useWorkflowStore } from '../stores/workflow';
import { toast } from '../composables/useToast';

const props = defineProps({
    ticket: { type: Object, required: true },
    action: { type: Object, required: true },
    placement: { type: String, default: 'left' }
});

const emit = defineEmits(['done']);

const usersStore = useUsersStore();
const workflow = useWorkflowStore();

// Generiere IDs anhand der Ticket-ID und Aktion, plus einen Random-Suffix falls ein Ticket mehrfach auftaucht
const UID = Math.random().toString(36).substring(2, 9);
const triggerId = computed(() => `trigger-${props.ticket._id}-${props.action.name}-${UID}`);
const popoverId = computed(() => `popover-${props.ticket._id}-${props.action.name}-${UID}`);

const loading = ref(false);
const loadingUsers = ref(false);
const comment = ref('');
const assignee = ref('');
const availableAssignees = ref([]);

const onShow = async (e) => {
    if (e.target.tagName !== 'WA-POPOVER') return;
    
    if (props.action.inline === 'comment') {
        comment.value = '';
    } else if (props.action.inline === 'assign') {
        assignee.value = props.ticket.assignee || '';
        await fetchAssignees();
    }
};

const onHide = (e) => {
    // nothing to do
};

const close = () => {
    const popoverEl = document.getElementById(popoverId.value);
    if (popoverEl) popoverEl.open = false;
};

const fetchAssignees = async () => {
    if (availableAssignees.value.length > 0) return;
    loadingUsers.value = true;
    try {
        let users = await usersStore.fetchUsersByGroup([]);
        const config = workflow.config;
        if (config && config[props.ticket.type] && config[props.ticket.type].fields) {
            const assigneeField = config[props.ticket.type].fields.find(f => f.name === 'assignee');
            if (assigneeField && assigneeField.groups && assigneeField.groups.length > 0) {
                users = users.filter(u => {
                    if (!u.groups) return false;
                    return u.groups.some(g => assigneeField.groups.includes(g));
                });
            }
        }
        availableAssignees.value = users;
    } catch (err) {
        console.error('Error fetching users:', err);
    } finally {
        loadingUsers.value = false;
    }
};

const executeActionDirect = async (ticketObj, actionDef) => {
    loading.value = true;
    try {
        const { _id, __v, type, state, creator, created, updated, log, badges, ...rest } = ticketObj;
        const payload = {
            actionName: actionDef.name,
            formData: { 
                title: ticketObj.title,
                description: ticketObj.description,
                assignee: ticketObj.assignee,
                ...rest 
            }
        };

        await axios.post(`/api/tickets/${ticketObj._id}/action`, payload, {
             headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        close();
        emit('done');
    } catch (err) {
        console.error(err);
    } finally {
        loading.value = false;
    }
};

const submitComment = async () => {
    if (comment.value && comment.value.trim()) {
        loading.value = true;
        try {
            await axios.post(`/api/tickets/${props.ticket._id}/comments`, {
                text: comment.value, 
                silent: true
            }, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
        } catch (err) {
            console.error(err);
            toast.error('Fehler beim Speichern des Kommentars: ' + (err.response?.data?.message || err.message));
            loading.value = false;
            return;
        }
    }
    await executeActionDirect(props.ticket, props.action);
};

const submitAssign = async () => {
    if (assignee.value) {
        // Optimistic target copy
        const updatedTicket = { ...props.ticket, assignee: assignee.value };
        await executeActionDirect(updatedTicket, props.action);
    }
};
</script>

<style scoped>
.popover-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
}
</style>
