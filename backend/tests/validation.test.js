const { evaluateTemplate, evaluateFields, validateTicket } = require('../src/validation');

describe('evaluateTemplate', () => {

    it('should return boolean true for a matching boolean expression', () => {
        const result = evaluateTemplate('{{ ticket.type === "IT-Ticket" }}', { type: 'IT-Ticket' });
        expect(result).toBe(true);
    });

    it('should return boolean false for a non-matching boolean expression', () => {
        const result = evaluateTemplate('{{ ticket.type === "IT-Ticket" }}', { type: 'Krankmeldung' });
        expect(result).toBe(false);
    });

    it('should interpolate string values in templates', () => {
        const result = evaluateTemplate('Raum {{ ticket.location }}', { location: '101' });
        expect(result).toBe('Raum 101');
    });

    it('should interpolate multiple expressions', () => {
        const result = evaluateTemplate('{{ ticket.a }} und {{ ticket.b }}', { a: 'Hallo', b: 'Welt' });
        expect(result).toBe('Hallo und Welt');
    });

    it('should return empty string for undefined properties in interpolation', () => {
        const result = evaluateTemplate('Wert: {{ ticket.nichtExistent }}', {});
        expect(result).toBe('Wert: ');
    });

    it('should return non-string input unchanged', () => {
        expect(evaluateTemplate(42, {})).toBe(42);
        expect(evaluateTemplate(true, {})).toBe(true);
        expect(evaluateTemplate(null, {})).toBe(null);
        expect(evaluateTemplate(undefined, {})).toBe(undefined);
    });

    it('should keep original expression on syntax error', () => {
        const result = evaluateTemplate('{{ invalid && syntax!! }}', {});
        expect(result).toBe('{{ invalid && syntax!! }}');
    });

    it('should handle empty ticket data gracefully', () => {
        const result = evaluateTemplate('{{ ticket.x === "y" }}', {});
        expect(result).toBe(false);
    });

    it('should handle null ticket data gracefully', () => {
        const result = evaluateTemplate('{{ ticket.x === "y" }}', null);
        expect(result).toBe(false);
    });

    it('should evaluate ternary expressions returning strings', () => {
        const result = evaluateTemplate('{{ ticket.count > 1 ? "viele" : "eins" }}', { count: 5 });
        expect(result).toBe('viele');
    });

    it('should use helper functions like format', () => {
        const result = evaluateTemplate('{{ format(ticket.date, "yyyy") }}', { date: '2026-06-15' });
        expect(result).toBe('2026');
    });

    it('should use helper function subDays', () => {
        const result = evaluateTemplate('{{ new Date(ticket.date) >= subDays(now, 3) }}', { date: '2099-01-01' });
        expect(result).toBe(true);
    });
});

describe('evaluateFields', () => {

    it('should return empty array for null/undefined fields', () => {
        expect(evaluateFields(null, {})).toEqual([]);
        expect(evaluateFields(undefined, {})).toEqual([]);
    });

    it('should evaluate template expressions in all string properties', () => {
        const fields = [
            { name: 'f1', visible: '{{ ticket.show === true }}', label: 'Label {{ ticket.nr }}' }
        ];
        const result = evaluateFields(fields, { show: true, nr: 42 });

        expect(result[0].visible).toBe(true);
        expect(result[0].label).toBe('Label 42');
    });

    it('should leave non-template strings unchanged', () => {
        const fields = [{ name: 'f1', label: 'Einfacher Text' }];
        const result = evaluateFields(fields, {});

        expect(result[0].label).toBe('Einfacher Text');
    });

    it('should not mutate the original field objects', () => {
        const original = { name: 'f1', visible: '{{ ticket.a === true }}' };
        const fields = [original];
        evaluateFields(fields, { a: true });

        expect(original.visible).toBe('{{ ticket.a === true }}'); // unchanged
    });

    it('should evaluate multiple fields independently', () => {
        const fields = [
            { name: 'a', required: '{{ ticket.x > 0 }}' },
            { name: 'b', required: '{{ ticket.x < 0 }}' }
        ];
        const result = evaluateFields(fields, { x: 5 });

        expect(result[0].required).toBe(true);
        expect(result[1].required).toBe(false);
    });
});

describe('validateTicket', () => {

    it('should report missing required fields', () => {
        const workflow = {
            fields: [{ name: 'title', label: 'Titel', required: true }]
        };
        const result = validateTicket({}, workflow);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Pflichtfeld');
        expect(result.errors[0]).toContain('Titel');
    });

    it('should accept a filled required field', () => {
        const workflow = {
            fields: [{ name: 'title', label: 'Titel', required: true }]
        };
        const result = validateTicket({ title: 'Mein Ticket' }, workflow);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('should treat empty string as missing for required fields', () => {
        const workflow = {
            fields: [{ name: 'title', required: true }]
        };
        const result = validateTicket({ title: '' }, workflow);
        expect(result.isValid).toBe(false);
    });

    it('should treat null as missing for required fields', () => {
        const workflow = {
            fields: [{ name: 'title', required: true }]
        };
        const result = validateTicket({ title: null }, workflow);
        expect(result.isValid).toBe(false);
    });

    it('should skip required check for hidden fields (visible: false)', () => {
        const workflow = {
            fields: [{ name: 'secret', required: true, visible: false }]
        };
        const result = validateTicket({}, workflow);
        expect(result.isValid).toBe(true);
    });

    it('should evaluate dynamic required expressions', () => {
        const workflow = {
            fields: [
                { name: 'reason', label: 'Begründung', required: '{{ ticket.needsReason === true }}' }
            ]
        };

        // required evaluates to true, but field is empty
        const result = validateTicket({ needsReason: true }, workflow);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Begründung');

        // required evaluates to false
        const result2 = validateTicket({ needsReason: false }, workflow);
        expect(result2.isValid).toBe(true);
    });

    it('should validate field-level validation expressions', () => {
        const workflow = {
            fields: [{
                name: 'age',
                validation: { expression: 'ticket.age >= 18', message: 'Zu jung' }
            }]
        };

        const fail = validateTicket({ age: 10 }, workflow);
        expect(fail.isValid).toBe(false);
        expect(fail.errors).toContain('Zu jung');

        const pass = validateTicket({ age: 25 }, workflow);
        expect(pass.isValid).toBe(true);
    });

    it('should skip field validation for hidden fields', () => {
        const workflow = {
            fields: [{
                name: 'age',
                visible: false,
                validation: { expression: 'ticket.age >= 18', message: 'Zu jung' }
            }]
        };

        const result = validateTicket({ age: 10 }, workflow);
        expect(result.isValid).toBe(true);
    });

    it('should execute cross-field (workflow-level) validations', () => {
        const workflow = {
            fields: [{ name: 'dateFrom' }, { name: 'dateUntil' }],
            validations: [{
                name: 'dateRange',
                expression: '!ticket.dateFrom || !ticket.dateUntil || ticket.dateFrom <= ticket.dateUntil',
                message: 'Datum von darf nicht nach Datum bis liegen'
            }]
        };

        const fail = validateTicket({ dateFrom: '2026-03-10', dateUntil: '2026-03-05' }, workflow);
        expect(fail.isValid).toBe(false);
        expect(fail.errors[0]).toContain('Datum von');

        const pass = validateTicket({ dateFrom: '2026-03-01', dateUntil: '2026-03-10' }, workflow);
        expect(pass.isValid).toBe(true);
    });

    it('should use formFields parameter when provided', () => {
        const workflow = {
            fields: [{ name: 'title', required: true }]
        };
        const formFields = [{ name: 'comment', label: 'Kommentar', required: true }];

        // workflow.fields has 'title' required, but formFields overrides to only check 'comment'
        const result = validateTicket({}, workflow, formFields);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Kommentar');
        // 'title' should not be checked
        expect(result.errors.some(e => e.includes('title'))).toBe(false);
    });

    it('should collect errors from both field and workflow validations', () => {
        const workflow = {
            fields: [
                { name: 'title', label: 'Titel', required: true },
                { name: 'age', validation: { expression: 'ticket.age >= 0', message: 'Alter negativ' } }
            ],
            validations: [
                { name: 'custom', expression: 'ticket.x === true', message: 'X muss wahr sein' }
            ]
        };

        const result = validateTicket({ age: -1, x: false }, workflow);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(3); // required + field validation + workflow validation
    });

    it('should handle validation expression errors gracefully', () => {
        const workflow = {
            fields: [{
                name: 'f1',
                label: 'Feld1',
                validation: { expression: 'invalid && syntax!!', message: 'Fehler' }
            }]
        };

        const result = validateTicket({}, workflow);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Interner Fehler');
    });

    it('should handle workflow validation expression errors gracefully', () => {
        const workflow = {
            fields: [],
            validations: [{ name: 'broken', expression: '!!!broken', message: 'Fehler' }]
        };

        const result = validateTicket({}, workflow);
        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Interner Fehler');
    });

    it('should validate with date helper functions', () => {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 7);

        const workflow = {
            fields: [{
                name: 'dateFrom',
                validation: {
                    expression: 'new Date(ticket.dateFrom) >= subDays(now, 3)',
                    message: 'Datum liegt zu weit in der Vergangenheit'
                }
            }]
        };

        const fail = validateTicket({ dateFrom: pastDate.toISOString() }, workflow);
        expect(fail.isValid).toBe(false);

        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);
        const pass = validateTicket({ dateFrom: futureDate.toISOString() }, workflow);
        expect(pass.isValid).toBe(true);
    });
});
