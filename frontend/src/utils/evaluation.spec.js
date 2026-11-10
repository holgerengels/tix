import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reactive } from 'vue';
import {
    evaluateFields,
    validateTicket,
    evaluateTemplate,
    getCachedFunction,
    getEvaluatorCacheSize,
    clearEvaluatorCache
} from './evaluation';

describe('evaluation.js', () => {

    describe('evaluateFields', () => {
        it('should evaluate boolean expressions in template strings', () => {
            const fields = [
                { name: 'field1', visible: '{{ ticket.type === "IT-Ticket" }}' }
            ];
            const ticketData = { type: 'IT-Ticket' };
            const result = evaluateFields(fields, ticketData);
            expect(result[0].visible).toBe(true);
        });

        it('should return false for boolean expressions if not matching', () => {
            const fields = [
                { name: 'field1', visible: '{{ ticket.type === "IT-Ticket" }}' }
            ];
            const ticketData = { type: 'Krankmeldung' };
            const result = evaluateFields(fields, ticketData);
            expect(result[0].visible).toBe(false);
        });

        it('should evaluate string replacements in template strings', () => {
            const fields = [
                { name: 'info', description: 'Das Ticket ist {{ ticket.state }}' }
            ];
            const ticketData = { state: 'offen' };
            const result = evaluateFields(fields, ticketData);
            expect(result[0].description).toBe('Das Ticket ist offen');
        });

        it('should safely fall back if expression is invalid', () => {
            const fields = [
                { name: 'field1', visible: '{{ invalid && syntax!! }}' }
            ];
            const ticketData = {};
            const result = evaluateFields(fields, ticketData);
            // It should keep the original string and coerce to boolean because it's the visible property!
            expect(typeof result[0].visible).toBe('boolean');
        });

        it('should NOT evaluate default or computed properties inside evaluateFields', () => {
            const fields = [
                {
                    name: 'participants',
                    default: '{{ ticket.groups }}',
                    computed: '{{ lookupGroupUsers(ticket.groups) }}'
                }
            ];
            const ticketData = { groups: ['Lehrkräfte'] };
            const result = evaluateFields(fields, ticketData);
            expect(result[0].default).toBe('{{ ticket.groups }}');
            expect(result[0].computed).toBe('{{ lookupGroupUsers(ticket.groups) }}');
        });
    });

    describe('validateTicket', () => {
        it('should validate required fields that are visible', () => {
            const ticketData = { name: '' };
            const workflow = {
                fields: [{ name: 'name', required: true, visible: true }]
            };
            const result = validateTicket(ticketData, workflow);
            expect(result.isValid).toBe(false);
            expect(result.errors[0]).toContain('Pflichtfeld');
        });

        it('should NOT validate required fields that are explicitly hidden', () => {
            const ticketData = { name: '' };
            const workflow = {
                fields: [{ name: 'name', required: true, visible: false }]
            };
            const result = validateTicket(ticketData, workflow);
            expect(result.isValid).toBe(true);
        });

        it('should execute custom field validations', () => {
            const ticketData = { age: 10 };
            const workflow = {
                fields: [{
                    name: 'age',
                    validation: { expression: 'ticket.age >= 18', message: 'Too young' }
                }]
            };
            const result = validateTicket(ticketData, workflow);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Too young');
        });

        it('should evaluate custom field validations with helpers (e.g. date comparison)', () => {
            // Create date a week ago
            const d = new Date();
            d.setDate(d.getDate() - 7);

            const ticketData = { dateFrom: d.toISOString() };
            const workflow = {
                fields: [{
                    name: 'dateFrom',
                    validation: { expression: 'new Date(ticket.dateFrom) >= subDays(now, 3)', message: 'Too old' }
                }]
            };
            const result = validateTicket(ticketData, workflow);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Too old');
        });

        it('should execute cross-field validations on the workflow level', () => {
            const ticketData = { dateFrom: '2026-01-10', dateUntil: '2026-01-05' };
            const workflow = {
                fields: [
                    { name: 'dateFrom' }, { name: 'dateUntil' }
                ],
                validations: [
                    { expression: 'ticket.dateFrom <= ticket.dateUntil', message: 'End date before start date' }
                ]
            };
            const result = validateTicket(ticketData, workflow);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('End date before start date');
        });

        it('should filter validations by actions (e.g. create vs bearbeiten/editieren)', () => {
            const d = new Date();
            d.setDate(d.getDate() - 7);

            const ticketData = { dateFrom: d.toISOString() };
            const workflow = {
                fields: [{
                    name: 'dateFrom',
                    validation: {
                        actions: ['create'],
                        expression: 'new Date(ticket.dateFrom) >= now',
                        message: 'Datum liegt in der Vergangenheit'
                    }
                }]
            };

            // Fails on create
            const failCreate = validateTicket(ticketData, workflow, null, 'create');
            expect(failCreate.isValid).toBe(false);
            expect(failCreate.errors).toContain('Datum liegt in der Vergangenheit');

            // Passes on bearbeiten / editieren
            const passBearbeiten = validateTicket(ticketData, workflow, null, 'bearbeiten');
            expect(passBearbeiten.isValid).toBe(true);

            const passEditieren = validateTicket(ticketData, workflow, null, 'editieren');
            expect(passEditieren.isValid).toBe(true);
        });

        it('should filter validations by multiple actions (e.g. create and verschieben)', () => {
            const d = new Date();
            d.setDate(d.getDate() - 7);

            const ticketData = { date: d.toISOString() };
            const workflow = {
                fields: [{
                    name: 'date',
                    validation: {
                        actions: ['create', 'verschieben'],
                        expression: 'new Date(ticket.date) >= now',
                        message: 'Datum liegt in der Vergangenheit'
                    }
                }]
            };

            expect(validateTicket(ticketData, workflow, null, 'create').isValid).toBe(false);
            expect(validateTicket(ticketData, workflow, null, 'verschieben').isValid).toBe(false);
            expect(validateTicket(ticketData, workflow, null, 'abschliessen').isValid).toBe(true);
        });

        it('should respect exceptActions in frontend', () => {
            const workflow = {
                fields: [{
                    name: 'note',
                    validation: {
                        exceptActions: ['erledigt'],
                        expression: 'ticket.note && ticket.note.length > 5',
                        message: 'Notiz zu kurz'
                    }
                }]
            };

            expect(validateTicket({ note: '12' }, workflow, null, 'bearbeiten').isValid).toBe(false);
            expect(validateTicket({ note: '12' }, workflow, null, 'erledigt').isValid).toBe(true);
        });
    });

    describe('computeFills', () => {
        // Need to import computeFills
        let computeFills;
        beforeAll(async () => {
            const mod = await import('./evaluation');
            computeFills = mod.computeFills;
        });

        it('should return empty objects for undefined fields', () => {
            const { defaults, computeds } = computeFills(undefined, {});
            expect(defaults).toEqual({});
            expect(computeds).toEqual({});
        });

        it('should return empty objects for empty fields array', () => {
            const { defaults, computeds } = computeFills([], {});
            expect(defaults).toEqual({});
            expect(computeds).toEqual({});
        });

        it('should evaluate a static default value', () => {
            const fields = [
                { name: 'priority', default: 'normal' }
            ];
            const { defaults, computeds } = computeFills(fields, {});
            expect(defaults.priority).toBe('normal');
            expect(computeds).toEqual({});
        });

        it('should evaluate a numeric default value', () => {
            const fields = [
                { name: 'lessonFrom', default: 1 }
            ];
            const { defaults, computeds } = computeFills(fields, {});
            expect(defaults.lessonFrom).toBe(1);
        });

        it('should evaluate an object default value', () => {
            const fields = [
                { name: 'lessons', default: { min: 1, max: 11 } }
            ];
            const { defaults, computeds } = computeFills(fields, {});
            expect(defaults.lessons).toEqual({ min: 1, max: 11 });
        });

        it('should evaluate a template default from other fields', () => {
            const fields = [
                { name: 'title', default: '{{ticket.firstName + " " + ticket.lastName}}' }
            ];
            const context = { firstName: 'Max', lastName: 'Mustermann' };
            const { defaults } = computeFills(fields, context);
            expect(defaults.title).toBe('Max Mustermann');
        });

        it('should not return a default if the template evaluates to empty', () => {
            const fields = [
                { name: 'title', default: '{{ticket.firstName}}' }
            ];
            const context = { firstName: '' };
            const { defaults } = computeFills(fields, context);
            expect(defaults.title).toBeUndefined();
        });

        it('should evaluate a computed field', () => {
            const fields = [
                { name: 'title', computed: '{{ticket.level + ": " + ticket.name}}' }
            ];
            const context = { level: '1. Mahnung', name: 'Max' };
            const { defaults, computeds } = computeFills(fields, context);
            expect(computeds.title).toBe('1. Mahnung: Max');
            expect(defaults).toEqual({});
        });

        it('should handle both default and computed fields together', () => {
            const fields = [
                { name: 'priority', default: 'normal' },
                { name: 'title', computed: '{{ticket.level + ": " + ticket.name}}' }
            ];
            const context = { level: '2. Mahnung', name: 'Anna' };
            const { defaults, computeds } = computeFills(fields, context);
            expect(defaults.priority).toBe('normal');
            expect(computeds.title).toBe('2. Mahnung: Anna');
        });

        it('should prefer computed over default if both are present on same field', () => {
            const fields = [
                { name: 'title', default: 'fallback', computed: '{{ticket.name}}' }
            ];
            const context = { name: 'Max' };
            const { defaults, computeds } = computeFills(fields, context);
            expect(computeds.title).toBe('Max');
            expect(defaults.title).toBeUndefined();
        });

        it('should skip fields without default or computed', () => {
            const fields = [
                { name: 'firstName', type: 'Text', required: true },
                { name: 'priority', default: 'high' }
            ];
            const { defaults } = computeFills(fields, {});
            expect(Object.keys(defaults)).toEqual(['priority']);
        });

        it('should only evaluate computed fields that reference changedField when changedField is provided', () => {
            const fields = [
                { name: 'title', computed: '{{ticket.level + ": " + ticket.name}}' },
                { name: 'participants', computed: '{{ticket.groups}}' }
            ];
            const context = { level: '1. Mahnung', name: 'Max', groups: ['Lehrkräfte'] };

            // When 'level' changes, 'title' is computed, 'participants' is skipped
            const res1 = computeFills(fields, context, 'level');
            expect(res1.computeds).toEqual({ title: '1. Mahnung: Max' });

            // When 'groups' changes, 'participants' is computed, 'title' is skipped
            const res2 = computeFills(fields, context, 'groups');
            expect(res2.computeds).toEqual({ participants: ['Lehrkräfte'] });

            // When 'participants' itself changes, 'participants' is NOT overwritten
            const res3 = computeFills(fields, context, 'participants');
            expect(res3.computeds).toEqual({});
        });
    });

    describe('evaluator compilation cache', () => {
        beforeEach(() => {
            clearEvaluatorCache();
        });

        it('reuses compiled expressions across different ticketData objects, actions, and reactive proxies', () => {
            expect(getEvaluatorCacheSize()).toBe(0);

            const ticket1 = reactive({ status: 'open', count: 2 });
            const ticket2 = reactive({ status: 'closed', count: 5 });
            const wf = {
                fields: [{
                    name: 'count',
                    visible: '{{ ticket.status === "open" }}',
                    validation: {
                        expression: 'ticket.count > 0 && action !== "reject"',
                        message: 'Invalid'
                    }
                }]
            };

            expect(validateTicket(ticket1, wf, null, 'create').isValid).toBe(true);
            expect(getEvaluatorCacheSize()).toBe(2);

            // Re-evaluating with different ticket data and action reuses cached functions
            expect(validateTicket(ticket2, wf, null, 'reject').isValid).toBe(true); // hidden -> validation skipped
            expect(getEvaluatorCacheSize()).toBe(2);

            ticket2.status = 'open';
            expect(validateTicket(ticket2, wf, null, 'reject').isValid).toBe(false);
            expect(getEvaluatorCacheSize()).toBe(2);

            expect(evaluateTemplate('Wert: {{ ticket.count * 2 }}', ticket1)).toBe('Wert: 4');
            expect(evaluateTemplate('Wert: {{ ticket.count * 2 }}', ticket2)).toBe('Wert: 10');
            expect(getEvaluatorCacheSize()).toBe(3);
        });

        it('does not cache syntax errors and supports separate prefixes via getCachedFunction', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(evaluateTemplate('{{ broken && syntax!! }}', {})).toBe('{{ broken && syntax!! }}');
            expect(getEvaluatorCacheSize()).toBe(0);
            warnSpy.mockRestore();

            const fnA = getCachedFunction('prefixA\0expr', () => () => 'A');
            const fnB = getCachedFunction('prefixB\0expr', () => () => 'B');
            const fnA2 = getCachedFunction('prefixA\0expr', () => () => 'NEW_A');

            expect(fnA).toBe(fnA2);
            expect(fnA()).toBe('A');
            expect(fnB()).toBe('B');
            expect(getEvaluatorCacheSize()).toBe(2);
        });
    });
});
