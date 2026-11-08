import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicForm from './DynamicForm.vue';

// Mock UI state
vi.mock('../stores/ui', () => ({
    useUiStore: () => ({
        isNarrow: false
    })
}));

// Mock Users state
vi.mock('../stores/users', () => ({
    useUsersStore: () => ({
        getUsersForGroups: vi.fn().mockImplementation((groups) => {
            const list = Array.isArray(groups) ? groups : (groups ? [groups] : []);
            if (list.includes('all') || list.includes('<alle>')) {
                return [
                    { username: 'hengels', employeeId: 'hengels', displayName: 'Holger Engels', groups: ['Lehrkräfte'] },
                    { username: 'mmuster', employeeId: 'mmuster', displayName: 'Max Mustermann', groups: ['Lehrkräfte'] },
                    { username: 'chef', employeeId: 'chef', displayName: 'Schulleiter', groups: ['Schulleitung'] }
                ];
            }
            if (list.includes('Lehrkräfte')) {
                return [
                    { username: 'hengels', employeeId: 'hengels', displayName: 'Holger Engels', groups: ['Lehrkräfte'] },
                    { username: 'mmuster', employeeId: 'mmuster', displayName: 'Max Mustermann', groups: ['Lehrkräfte'] }
                ];
            }
            if (list.includes('Schulleitung')) {
                return [
                    { username: 'chef', employeeId: 'chef', displayName: 'Schulleiter', groups: ['Schulleitung'] }
                ];
            }
            return [];
        }),
        getUserData: (u) => ({ employeeId: u }),
        getDisplayName: (u) => u
    })
}));

// JSDOM does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = function () { };

// We need to provide a stub for the inner components if we don't want to load them deeply
const FormFieldStub = {
    template: '<div class="stub-form-field"><slot></slot></div>',
    props: ['field', 'modelValue']
};

describe('DynamicForm.vue', () => {

    it('should show error messages when validation fails', async () => {
        const fields = [
            { name: 'missingField', required: true, visible: true, label: 'Missing' }
        ];
        const workflow = { fields };
        const modelValue = {};

        const wrapper = mount(DynamicForm, {
            props: { fields, modelValue, workflow, grid: [] },
            global: {
                stubs: { 'FormField': FormFieldStub }
            }
        });

        // Trigger validation explicitly
        const isValid = wrapper.vm.validate();
        expect(isValid).toBe(false);

        // Wait for DOM update
        await wrapper.vm.$nextTick();

        // Check if error message is displayed
        const errorBox = wrapper.find('.error-messages');
        expect(errorBox.exists()).toBe(true);
        expect(errorBox.text()).toContain('Pflichtfeld');
    });

    it('should NOT render fields that are evaluated as visible: false', () => {
        const fields = [
            { name: 'visibleField', visible: true },
            { name: 'hiddenField', visible: false },
            { name: 'dynamicHiddenField', visible: '{{ ticket.hideMe === true }}' }
        ];
        const modelValue = { hideMe: false }; // This makes dynamicHiddenField visible: false
        const workflow = { fields };

        const wrapper = mount(DynamicForm, {
            props: { fields, modelValue, workflow, grid: [] },
            global: {
                stubs: { 'FormField': FormFieldStub }
            }
        });

        const renderedFields = wrapper.findAll('.form-field');
        // Only visibleField should be rendered
        expect(renderedFields.length).toBe(1);
    });

    it('should evaluate and pass readonly states correctly to FormField', () => {
        const fields = [
            { name: 'readOnlyField', readonly: true },
            { name: 'dynReadOnlyField', readonly: '{{ ticket.lockMe === true }}' },
            { name: 'editableField', readonly: false }
        ];
        const modelValue = { lockMe: true };
        const workflow = { fields };

        const wrapper = mount(DynamicForm, {
            props: { fields, modelValue, workflow, grid: [] },
            global: {
                stubs: { 'FormField': FormFieldStub }
            }
        });

        const stubs = wrapper.findAllComponents(FormFieldStub);
        expect(stubs.length).toBe(3);

        expect(stubs[0].props('field').readonly).toBe(true);
        expect(stubs[1].props('field').readonly).toBe(true);
        expect(stubs[2].props('field').readonly).toBe(false);
    });

    it('should clear error messages when clearErrors is called or workflow changes', async () => {
        const fields = [
            { name: 'missingField', required: true, visible: true, label: 'Missing' }
        ];
        const workflow = { fields };
        const modelValue = {};

        const wrapper = mount(DynamicForm, {
            props: { fields, modelValue, workflow, grid: [] },
            global: {
                stubs: { 'FormField': FormFieldStub }
            }
        });

        // Trigger validation failure
        wrapper.vm.validate();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.error-messages').exists()).toBe(true);

        // Call clearErrors
        wrapper.vm.clearErrors();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.error-messages').exists()).toBe(false);

        // Trigger validation failure again
        wrapper.vm.validate();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.error-messages').exists()).toBe(true);

        // Update workflow prop
        await wrapper.setProps({
            workflow: { fields: [{ name: 'otherField', visible: true }] },
            fields: [{ name: 'otherField', visible: true }]
        });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.error-messages').exists()).toBe(false);
    });

    it('should replace computed ObjectArray rows when groups changes, without overwriting on unrelated field changes', async () => {
        const fields = [
            {
                name: 'title',
                label: 'Titel',
                type: 'Text'
            },
            {
                name: 'groups',
                label: 'Gruppen',
                type: 'Group',
                multiple: true
            },
            {
                name: 'participants',
                label: 'Teilnehmer',
                type: 'ObjectArray',
                computed: '{{ lookupGroupUsers(ticket.groups) }}',
                items: {
                    fields: [
                        { name: 'name', type: 'User' },
                        { name: 'email', type: 'Email', default: '{{ lookupUserEmail(name) }}' },
                        { name: 'status', type: 'Select', default: 'eingeladen' }
                    ]
                }
            }
        ];
        const modelValue = {
            title: '',
            groups: [],
            participants: [{ name: 'alt', email: 'alt@test.de', status: 'eingeladen' }]
        };

        const wrapper = mount(DynamicForm, {
            props: { fields, modelValue, grid: [] },
            global: {
                stubs: { 'FormField': FormFieldStub }
            }
        });

        // 1. Update groups to ['Lehrkräfte'] -> participants replaced
        await wrapper.vm.updateField('groups', ['Lehrkräfte']);

        expect(modelValue.participants.length).toBe(2);
        expect(modelValue.participants[0].name).toBe('hengels');
        expect(modelValue.participants[0].email).toBe('hengels@valckenburgschule.de');
        expect(modelValue.participants[0].status).toBe('eingeladen');
        expect(modelValue.participants[1].name).toBe('mmuster');

        // 2. Manual edit to participants (e.g., adding an external guest)
        const withGuest = [
            ...modelValue.participants,
            { name: '', email: 'gast@extern.de', status: 'eingeladen' }
        ];
        await wrapper.vm.updateField('participants', withGuest);
        expect(modelValue.participants.length).toBe(3);

        // 3. Updating an unrelated field ('title') must NOT overwrite the manual edit in participants!
        await wrapper.vm.updateField('title', 'Lehrerkonferenz');
        expect(modelValue.participants.length).toBe(3);
        expect(modelValue.participants[2].email).toBe('gast@extern.de');

        // 4. Now change groups to ['Schulleitung'] -> existing participants should be REPLACED
        await wrapper.vm.updateField('groups', ['Schulleitung']);

        expect(modelValue.participants.length).toBe(1);
        expect(modelValue.participants[0].name).toBe('chef');

        // 5. Emptying groups clears participants
        await wrapper.vm.updateField('groups', []);
        expect(modelValue.participants.length).toBe(0);
    });
});
