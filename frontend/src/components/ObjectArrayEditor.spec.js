import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ObjectArrayEditor from './ObjectArrayEditor.vue';

// Mock Pinia store for users
vi.mock('../stores/users', () => ({
    useUsersStore: () => ({
        getUserData: (username) => {
            if (username === 'hengels') {
                return { employeeId: 'engels' };
            }
            return null;
        },
        getDisplayName: (username) => username
    })
}));

describe('ObjectArrayEditor.vue', () => {
    const field = {
        name: 'participants',
        label: 'Teilnehmer',
        items: {
            fields: [
                { name: 'name', type: 'User' },
                { name: 'email', type: 'Email', default: '{{ lookupUserEmail(name) }}' },
                { name: 'status', type: 'Select', default: 'eingeladen' }
            ]
        }
    };

    it('should not populate skeleton row with unevaluated template expressions', () => {
        const wrapper = mount(ObjectArrayEditor, {
            props: {
                field,
                modelValue: []
            },
            global: {
                stubs: {
                    draggable: {
                        template: '<div class="draggable-stub"><slot name="item" v-for="(element, index) in list" :element="element" :index="index"></slot></div>',
                        props: ['modelValue'],
                        computed: {
                            list() { return this.modelValue; }
                        }
                    },
                    FormField: {
                        template: '<div class="form-field-stub">{{ modelValue }}</div>',
                        props: ['field', 'modelValue']
                    },
                    'wa-icon': true,
                    'wa-button': true
                }
            }
        });

        // Skeleton row should have static default ('eingeladen') but NOT the template string
        const skeletonRow = wrapper.vm.internalList.find(r => r.isSkeleton);
        expect(skeletonRow).toBeDefined();
        expect(skeletonRow.value.status).toBe('eingeladen');
        expect(skeletonRow.value.email).toBeUndefined();
    });

    it('should compute default when subfield changes', async () => {
        const wrapper = mount(ObjectArrayEditor, {
            props: {
                field,
                modelValue: []
            },
            global: {
                stubs: {
                    draggable: {
                        template: '<div class="draggable-stub"><slot name="item" v-for="(element, index) in list" :element="element" :index="index"></slot></div>',
                        props: ['modelValue'],
                        computed: {
                            list() { return this.modelValue; }
                        }
                    },
                    FormField: {
                        template: '<div class="form-field-stub">{{ modelValue }}</div>',
                        props: ['field', 'modelValue']
                    },
                    'wa-icon': true,
                    'wa-button': true
                }
            }
        });

        // Update name in the skeleton row (index 0)
        wrapper.vm.updateSubField(0, 'name', 'hengels');

        // Emitted update should include resolved email
        const emitted = wrapper.emitted('update:modelValue');
        expect(emitted).toBeTruthy();
        const lastEmitted = emitted[emitted.length - 1][0];
        expect(lastEmitted.length).toBe(1);
        expect(lastEmitted[0].name).toBe('hengels');
        expect(lastEmitted[0].email).toBe('engels@valckenburgschule.de');
        expect(lastEmitted[0].status).toBe('eingeladen');
    });
});
