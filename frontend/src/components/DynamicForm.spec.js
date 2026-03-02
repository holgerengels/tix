import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicForm from './DynamicForm.vue';
import { ui } from '../state/ui';

// Mock UI state
vi.mock('../state/ui', () => ({
    ui: {
        state: { isNarrow: false }
    }
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
});
