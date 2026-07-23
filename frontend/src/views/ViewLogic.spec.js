import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ViewView from './ViewView.vue';
import ActionView from './ActionView.vue';
import axios from 'axios';

// Mock UI State
vi.mock('../stores/ui', () => ({
    useUiStore: () => ({
        isNarrow: false,
        isMobile: false,
        toggleSidebar: vi.fn()
    })
}));

// Mock Users Store
vi.mock('../stores/users', () => ({
    useUsersStore: () => ({
        getDisplayName: (username) => username,
        fetchUsersByGroup: async () => [],
        cache: {}
    })
}));

// Mock Router and Route
const mockRoute = { params: { id: 'TKT-1', action: 'bearbeiten' } };
const mockRouter = { push: vi.fn(), back: vi.fn() };
vi.mock('vue-router', () => ({
    useRoute: () => mockRoute,
    useRouter: () => mockRouter,
    onBeforeRouteLeave: vi.fn()
}));

const mockConfig = {
    'TestTicket': {
        fields: [{ name: 'title', label: 'Titel' }],
        access: [{ name: 'comment', groups: ['TestGroup'] }],
        workflow: []
    }
};

// Mock Workflow State — mutable so individual tests can override
let _mockWorkflowConfig = mockConfig;

vi.mock('../stores/workflow', () => {
    return {
        useWorkflowStore: () => ({
            get config() { return _mockWorkflowConfig; },
            fetchConfig: async () => _mockWorkflowConfig
        })
    };
});

// Mock Axios
vi.mock('axios');

// Mock localStorage
const mockUser = { username: 'testuser', groups: ['TestGroup'] };
Object.defineProperty(window, 'localStorage', {
    value: {
        getItem: vi.fn((key) => {
            if (key === 'user') return JSON.stringify(mockUser);
            if (key === 'token') return 'fake-token';
            return null;
        })
    },
    writable: true
});

const mockTicket = {
    _id: 'db123',
    id: 'TKT-1',
    type: 'TestTicket',
    title: 'Test',
    creator: 'otheruser',
    assignee: 'otheruser',
    state: 'neu',
    created: new Date().toISOString()
};

const FormStub = {
    template: '<div class="stub-dynamic-form"></div>',
    props: ['fields']
};

const CommentsStub = {
    template: '<div class="stub-ticket-comments"></div>',
    props: ['ticket']
};

const CardStub = {
    template: '<div class="stub-wa-card"><slot name="header"></slot><slot></slot><slot name="footer-actions"></slot></div>'
};

describe('View Logic & Constraints', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        _mockWorkflowConfig = mockConfig;
        // Default axios responses
        axios.get.mockImplementation(async (url) => {
            if (url === '/api/config') return { data: mockConfig };
            if (url === '/api/tickets') return { data: [mockTicket] };
            if (url === '/api/tickets/db123/comments') return { data: [] };
            if (url === '/api/tickets/db123/logs') return { data: [] };
            return { data: [] };
        });
    });

    describe('ViewView.vue', () => {
        it('should force all fields to be readonly', async () => {
            const wrapper = mount(ViewView, {
                global: {
                    stubs: { 'DynamicForm': FormStub, 'TicketComments': CommentsStub, 'wa-card': CardStub, 'wa-button': true, 'wa-icon': true, 'wa-tag': true, 'wa-spinner': true, 'wa-tab-group': true, 'wa-tab-panel': true, 'wa-tab': true }
                }
            });

            // Give it plenty of ticks to resolve nested async/awaits
            await flushPromises();
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();
            await wrapper.vm.$nextTick();

            const dynForm = wrapper.findComponent(FormStub);
            expect(dynForm.exists()).toBe(true);
            const fieldsPassed = dynForm.props('fields');

            // Should add readonly=true to the title field
            expect(fieldsPassed.length).toBeGreaterThan(0);
            expect(fieldsPassed[0].readonly).toBe(true);
        });

        it('should allow comments if user is in authorized group', async () => {
            const wrapper = mount(ViewView, {
                global: {
                    stubs: { 'DynamicForm': FormStub, 'TicketComments': CommentsStub, 'wa-card': CardStub, 'wa-button': true, 'wa-icon': true, 'wa-tag': true, 'wa-spinner': true, 'wa-tab-group': true, 'wa-tab-panel': true, 'wa-tab': true }
                }
            });

            await new Promise(r => setTimeout(r, 0));
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.canComment).toBe(true);
            const commentsComp = wrapper.findComponent(CommentsStub);
            expect(commentsComp.exists()).toBe(true);
        });

        it('should normally NOT allow comments if user is unauthorized', async () => {
            // Mock user not in 'TestGroup' and not creator/assignee
            localStorage.getItem.mockImplementation((key) => {
                if (key === 'user') return JSON.stringify({ username: 'baduser', groups: [] });
                return null;
            });

            const wrapper = mount(ViewView, {
                global: {
                    stubs: { 'DynamicForm': FormStub, 'TicketComments': CommentsStub, 'wa-card': true, 'wa-button': true, 'wa-icon': true, 'wa-tag': true, 'wa-spinner': true, 'wa-tab-group': true, 'wa-tab-panel': true, 'wa-tab': true }
                }
            });

            await new Promise(r => setTimeout(r, 0));
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.canComment).toBe(false);
            const commentsComp = wrapper.findComponent(CommentsStub);
            expect(commentsComp.exists()).toBe(false);

            // Restore mock
            localStorage.getItem.mockImplementation((key) => {
                if (key === 'user') return JSON.stringify(mockUser);
                return null;
            });
        });
    });

    describe('ActionView.vue', () => {
        // Mock a workflow with an action and forms
        const actionConfig = {
            'TestTicket': {
                fields: [{ name: 'title', label: 'Titel' }],
                workflow: [
                    {
                        states: ['neu'],
                        actions: [{ name: 'bearbeiten', form: 'edit.form' }]
                    }
                ],
                forms: [
                    { name: 'edit.form', fields: [{ name: 'title', readonly: false }, { name: 'comment', label: 'Kommentar' }] }
                ],
                access: [{ name: 'comment', groups: ['TestGroup'] }]
            }
        };

        it('should combine fields from workflow and form without forcing readonly', async () => {
            _mockWorkflowConfig = actionConfig;

            axios.get.mockImplementation(async (url) => {
                if (url === '/api/config') return { data: actionConfig };
                if (url === '/api/tickets') return { data: [mockTicket] };
                return { data: [] };
            });

            const wrapper = mount(ActionView, {
                global: {
                    stubs: { 'DynamicForm': FormStub, 'TicketComments': CommentsStub, 'wa-card': CardStub, 'wa-button': true, 'wa-icon': true, 'wa-tag': true, 'wa-spinner': true }
                }
            });
            await new Promise(r => setTimeout(r, 0));
            await wrapper.vm.$nextTick();

            expect(wrapper.vm.currentFormDef).toBeTruthy();

            const dynForm = wrapper.findComponent(FormStub);
            expect(dynForm.exists()).toBe(true);
            const fieldsPassed = dynForm.props('fields');

            // Form defines 'title' as readonly: false, which overrides the base or leaves it as is
            const titleField = fieldsPassed.find(f => f.name === 'title');
            expect(titleField.readonly).toBe(false);

            const commentField = fieldsPassed.find(f => f.name === 'comment');
            expect(commentField).toBeTruthy();
        });
    });
});
