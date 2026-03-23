import { describe, it, expect } from 'vitest';
import { evaluateTemplate } from './evaluation';

describe('evaluateTemplate', () => {

    describe('boolean expressions', () => {
        it('should return true for matching equality', () => {
            expect(evaluateTemplate('{{ ticket.type === "IT" }}', { type: 'IT' })).toBe(true);
        });

        it('should return false for non-matching equality', () => {
            expect(evaluateTemplate('{{ ticket.type === "IT" }}', { type: 'HM' })).toBe(false);
        });

        it('should return undefined for missing properties', () => {
            expect(evaluateTemplate('{{ ticket.missing }}', {})).toBe(undefined);
        });

        it('should return null for null properties', () => {
            expect(evaluateTemplate('{{ ticket.val }}', { val: null })).toBe(null);
        });

        it('should evaluate complex boolean with && and ||', () => {
            expect(evaluateTemplate('{{ ticket.a && ticket.b }}', { a: true, b: true })).toBe(true);
            expect(evaluateTemplate('{{ ticket.a && ticket.b }}', { a: true, b: false })).toBe(false);
            expect(evaluateTemplate('{{ ticket.a || ticket.b }}', { a: false, b: true })).toBe(true);
        });

        it('should evaluate startsWith method', () => {
            expect(evaluateTemplate('{{ ticket.state && ticket.state.startsWith("offen.") }}', { state: 'offen.neu' })).toBe(true);
            expect(evaluateTemplate('{{ ticket.state && ticket.state.startsWith("offen.") }}', { state: 'geschlossen.ok' })).toBe(false);
        });
    });

    describe('string interpolation', () => {
        it('should interpolate a simple property', () => {
            expect(evaluateTemplate('Raum {{ ticket.room }}', { room: '101' })).toBe('Raum 101');
        });

        it('should interpolate multiple properties', () => {
            expect(evaluateTemplate('{{ ticket.a }} - {{ ticket.b }}', { a: 'X', b: 'Y' })).toBe('X - Y');
        });

        it('should replace missing properties with empty string', () => {
            expect(evaluateTemplate('Wert: {{ ticket.x }}', {})).toBe('Wert: ');
        });

        it('should evaluate ternary expressions as string interpolation', () => {
            expect(evaluateTemplate('{{ ticket.n > 1 ? "viele" : "eins" }}', { n: 5 })).toBe('viele');
            expect(evaluateTemplate('Ergebnis: {{ ticket.n > 1 ? "viele" : "eins" }}', { n: 5 })).toBe('Ergebnis: viele');
            expect(evaluateTemplate('Ergebnis: {{ ticket.n > 1 ? "viele" : "eins" }}', { n: 0 })).toBe('Ergebnis: eins');
        });
    });

    describe('non-string input', () => {
        it('should return numbers unchanged', () => {
            expect(evaluateTemplate(42, {})).toBe(42);
        });

        it('should return booleans unchanged', () => {
            expect(evaluateTemplate(true, {})).toBe(true);
            expect(evaluateTemplate(false, {})).toBe(false);
        });

        it('should return null/undefined unchanged', () => {
            expect(evaluateTemplate(null, {})).toBe(null);
            expect(evaluateTemplate(undefined, {})).toBe(undefined);
        });
    });

    describe('error handling', () => {
        it('should return original string on syntax error', () => {
            const expr = '{{ invalid && syntax!! }}';
            expect(evaluateTemplate(expr, {})).toBe(expr);
        });

        it('should not crash with empty ticket data', () => {
            expect(evaluateTemplate('{{ ticket.x === "y" }}', {})).toBe(false);
        });
    });

    describe('helper functions', () => {
        it('should use format helper', () => {
            // Single {{ format() }} returns the string
            expect(evaluateTemplate('{{ format(ticket.d, "yyyy") }}', { d: '2026-06-15' })).toBe('2026');
            // Use surrounding text for actual string interpolation
            expect(evaluateTemplate('Jahr: {{ format(ticket.d, "yyyy") }}', { d: '2026-06-15' })).toBe('Jahr: 2026');
        });

        it('should use subDays helper for boolean comparison', () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);
            expect(evaluateTemplate('{{ new Date(ticket.d) >= subDays(now, 3) }}', { d: pastDate.toISOString() })).toBe(true);
        });

        it('should handle format with null date gracefully', () => {
            // format(null, ...) returns ''
            expect(evaluateTemplate('{{ format(ticket.d, "yyyy-MM-dd") }}', { d: null })).toBe('');
            // With surrounding text, it interpolates as empty string
            expect(evaluateTemplate('Datum: {{ format(ticket.d, "yyyy-MM-dd") }}', { d: null })).toBe('Datum: ');
        });
    });

    describe('with-based variable access (Vue reactivity)', () => {
        it('should access ticket properties directly without ticket. prefix', () => {
            // The frontend evaluator uses `with(ticket)` so direct property access works
            expect(evaluateTemplate('{{ type === "IT" }}', { type: 'IT' })).toBe(true);
        });

        it('should access nested via ticket. prefix as well', () => {
            expect(evaluateTemplate('{{ ticket.type === "IT" }}', { type: 'IT' })).toBe(true);
        });
    });
});
