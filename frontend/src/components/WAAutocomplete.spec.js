import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import WAAutocomplete from './WAAutocomplete.vue';

const stubs = {
    'wa-dropdown': {
        template: '<div class="wa-dropdown-stub"><slot name="trigger"></slot><slot></slot></div>',
        props: ['open']
    },
    'wa-input': {
        emits: ['input', 'blur'],
        template: '<div class="wa-input-wrapper"><input class="wa-input-stub" :value="value" @input="$emit(\'input\', $event)" @blur="$emit(\'blur\', $event)" /><slot></slot></div>',
        props: ['value', 'label', 'required', 'disabled', 'hint']
    },
    'wa-dropdown-item': {
        template: '<div class="wa-dropdown-item-stub" tabindex="-1"><slot></slot></div>',
        props: ['value']
    },
    'wa-icon': {
        template: '<span class="wa-icon-stub"></span>',
        props: ['name']
    }
};

describe('WAAutocomplete.vue', () => {
    const options = [
        { value: 'hengels', label: 'Holger Engels' },
        { value: 'mmuster', label: 'Max Mustermann' }
    ];

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not render wa-dropdown-item elements in DOM when closed (v-if)', () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: 'hengels',
                options
            },
            global: { stubs }
        });

        expect(wrapper.find('.wa-input-stub').element.value).toBe('Holger Engels');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);
    });

    it('renders matching wa-dropdown-item elements when opened via 3+ character input', async () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: '',
                options
            },
            global: { stubs }
        });

        const input = wrapper.find('.wa-input-stub');
        await input.setValue('Hol');

        const items = wrapper.findAll('.wa-dropdown-item-stub');
        expect(items.length).toBe(1);
        expect(items[0].text()).toBe('Holger Engels');
    });

    it('opens all options when clicking the input, even if an initial modelValue is selected', async () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: 'hengels',
                options
            },
            global: { stubs }
        });

        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);

        await wrapper.find('.wa-input-stub').trigger('click');

        const items = wrapper.findAll('.wa-dropdown-item-stub');
        expect(items.length).toBe(2);
        expect(items.map(i => i.text())).toEqual(['Holger Engels', 'Max Mustermann']);
    });

    it('toggles dropdown open/closed when clicking the chevron icon', async () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: '',
                options
            },
            global: { stubs }
        });

        const chevron = wrapper.find('.wa-icon-stub');
        await chevron.trigger('click');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(2);

        await chevron.trigger('click');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);
    });

    it('keeps search text and open state when blur moves focus to an element inside the dropdown', async () => {
        const wrapper = mount(WAAutocomplete, {
            props: {
                modelValue: '',
                options
            },
            global: { stubs }
        });

        const input = wrapper.find('.wa-input-stub');
        await input.setValue('Hol');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(1);

        const itemEl = wrapper.find('.wa-dropdown-item-stub').element;
        await input.trigger('blur', { relatedTarget: itemEl });

        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(1);
        expect(wrapper.find('.wa-input-stub').element.value).toBe('Hol');
    });

    it('normalizes exact label on blur, clears invalid text when allowFreetext is false, and keeps text when allowFreetext is true', async () => {
        vi.useFakeTimers();

        const strictWrapper = mount(WAAutocomplete, {
            props: { modelValue: '', options, allowFreetext: false },
            global: { stubs }
        });
        const strictInput = strictWrapper.find('.wa-input-stub');

        await strictInput.setValue('holger engels');
        await strictInput.trigger('blur', { relatedTarget: document.body });
        expect(strictWrapper.emitted('update:modelValue').pop()).toEqual(['hengels']);

        await strictInput.setValue('Unbekannt');
        await strictInput.trigger('blur', { relatedTarget: document.body });
        expect(strictWrapper.emitted('update:modelValue').pop()).toEqual(['']);
        vi.advanceTimersByTime(150);
        await strictWrapper.vm.$nextTick();
        expect(strictWrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);

        const freeWrapper = mount(WAAutocomplete, {
            props: { modelValue: '', options, allowFreetext: true },
            global: { stubs }
        });
        const freeInput = freeWrapper.find('.wa-input-stub');
        await freeInput.setValue('Eigener Wert');
        await freeInput.trigger('blur', { relatedTarget: document.body });
        expect(freeWrapper.emitted('update:modelValue').pop()).toEqual(['Eigener Wert']);
    });

    it('supports ArrowDown focusMenu and wa-select keyboard selection, and handles wa-after-hide', async () => {
        const wrapper = mount(WAAutocomplete, {
            props: { modelValue: '', options },
            global: { stubs }
        });

        const input = wrapper.find('.wa-input-stub');
        // First ArrowDown opens dropdown
        await input.trigger('keydown.down');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(2);

        // Second ArrowDown focuses first item
        const firstItem = wrapper.findAll('.wa-dropdown-item-stub')[0].element;
        const focusSpy = vi.spyOn(firstItem, 'focus');
        await input.trigger('keydown.down');
        expect(focusSpy).toHaveBeenCalledTimes(1);

        // wa-select selects matching option and closes
        await wrapper.find('.wa-dropdown-stub').trigger('wa-select', {
            detail: { item: { value: 'mmuster' } }
        });
        expect(wrapper.emitted('update:modelValue')).toEqual([['mmuster']]);
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);

        // External wa-after-hide closes dropdown, but keeps isOpen if closed transiently on 0 matches
        await input.setValue('zzz');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);
        await wrapper.find('.wa-dropdown-stub').trigger('wa-after-hide');
        await input.setValue('Max');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(1);

        await wrapper.find('.wa-dropdown-stub').trigger('wa-after-hide');
        expect(wrapper.findAll('.wa-dropdown-item-stub').length).toBe(0);
    });
});
