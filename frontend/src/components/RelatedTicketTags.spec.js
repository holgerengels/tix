import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import RelatedTicketTags from './RelatedTicketTags.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({
    useRouter: () => ({ push })
}));

const stubs = {
    'wa-tag': {
        template: '<span class="wa-tag-stub" @click="$emit(\'click\')"><slot /></span>'
    }
};

describe('RelatedTicketTags.vue', () => {
    beforeEach(() => push.mockClear());

    it('renders labels per link type and direction', () => {
        const wrapper = mount(RelatedTicketTags, {
            props: {
                tickets: [
                    { id: 'ITT-7', linkType: 'follows', direction: 'out', title: 'Beamer' },
                    { id: 'ITT-12', linkType: 'follows', direction: 'in' },
                    { id: 'ITT-3', linkType: 'duplicates', direction: 'out' },
                    { id: 'HM-1', linkType: 'relates', direction: 'in' }
                ]
            },
            global: { stubs }
        });

        const labels = wrapper.findAll('.wa-tag-stub').map(t => t.text());
        expect(labels).toEqual([
            '↶ Fortsetzung von ITT-7',
            '↷ Wiedereröffnet als ITT-12',
            '⧉ Duplikat von ITT-3',
            '↔ Verwandt mit HM-1'
        ]);
    });

    it('navigates to the linked ticket on click', async () => {
        const wrapper = mount(RelatedTicketTags, {
            props: { tickets: [{ id: 'ITT-7', linkType: 'follows', direction: 'out' }] },
            global: { stubs }
        });

        await wrapper.find('.wa-tag-stub').trigger('click');
        expect(push).toHaveBeenCalledWith('/tickets/ITT-7/view');
    });

    it('renders nothing without related tickets', () => {
        const wrapper = mount(RelatedTicketTags, { props: { tickets: undefined }, global: { stubs } });
        expect(wrapper.findAll('.wa-tag-stub')).toHaveLength(0);
    });
});
