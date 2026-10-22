<template>
    <wa-tag
        v-for="rel in related"
        :key="`${rel.direction}-${rel.linkType}-${rel.id}`"
        class="related-ticket-tag"
        variant="neutral"
        size="small"
        :title="rel.title ? `${rel.id}: ${rel.title}` : rel.id"
        @click="router.push(`/tickets/${rel.id}/view`)"
    >
        {{ labelFor(rel) }}
    </wa-tag>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

/**
 * Renders non-hierarchical ticket links (`relatedTickets` from the API).
 * Parent/subticket relations are rendered separately (⮤ / ⮡).
 */
const props = defineProps({
    tickets: { type: Array, default: () => [] }
});

const router = useRouter();

// Label per link type and direction ('out' = stored on this ticket, 'in' = derived)
const LABELS = {
    follows: { out: '↶ Fortsetzung von', in: '↷ Wiedereröffnet als' },
    duplicates: { out: '⧉ Duplikat von', in: '⧉ Duplikat:' },
    relates: { out: '↔ Verwandt mit', in: '↔ Verwandt mit' }
};

const related = computed(() => Array.isArray(props.tickets) ? props.tickets : []);

const labelFor = (rel) => {
    const prefix = LABELS[rel.linkType]?.[rel.direction] || '↔';
    return `${prefix} ${rel.id}`;
};

defineExpose({ labelFor });
</script>

<style scoped>
.related-ticket-tag {
    cursor: pointer;
}
</style>
