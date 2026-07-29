import { describe, it, expect } from 'vitest';
import { evaluateFields, validateTicket } from './evaluation';

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
    });
});
