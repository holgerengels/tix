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
            // It should keep the original string or fail gracefully depending on implementation
            expect(typeof result[0].visible).toBe('string');
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
});
