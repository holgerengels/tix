import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TicketListConfig from './TicketListConfig.vue';
import { setActivePinia, createPinia } from 'pinia';
import { useViewsStore } from '../stores/views';

// Mock Router and Route
const mockRoute = { query: { filter: 'my' } };
const mockRouter = { replace: vi.fn(), push: vi.fn() };
vi.mock('vue-router', () => ({
    useRoute: () => mockRoute,
    useRouter: () => mockRouter
}));

// Mock Workflow Store
vi.mock('../stores/workflow', () => ({
    useWorkflowStore: () => ({
        config: {
            'IT-Ticket': {
                fields: [{ name: 'title', label: 'Titel' }],
                states: [{ name: 'offen', label: 'Offen' }]
            }
        },
        fetchConfig: async () => ({})
    })
}));

describe('TicketListConfig.vue', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        localStorage.setItem('token', 'fake-token');
    });

    it('should mount properly and render summary with saved filters and pin icons', async () => {
        const viewsStore = useViewsStore();
        viewsStore.allSavedFilters = {
            my: [
                { name: 'Offene IT-Tickets', pinned: true, type: ['IT-Ticket'] },
                { name: 'Alle Hardware', pinned: false, type: [] }
            ]
        };

        const wrapper = mount(TicketListConfig, {
            global: {
                mocks: {
                    $route: mockRoute,
                    $router: mockRouter
                },
                stubs: {
                    'wa-button': true,
                    'wa-tag': {
                        template: '<div class="wa-tag-stub"><slot /></div>'
                    },
                    'wa-icon': true,
                    'wa-select': true,
                    'wa-option': true,
                    'wa-input': true,
                    'wa-badge': true,
                    'draggable': true
                }
            }
        });

        expect(wrapper.exists()).toBe(true);
        expect(wrapper.find('.filter-details').exists()).toBe(true);
        expect(wrapper.text()).toContain('Offene IT-Tickets');
        expect(wrapper.text()).toContain('Alle Hardware');
    });
});
