const {
    getWorkflows,
    getWorkflowForType,
    getVisibleTicketTypes,
    canComment,
    canEdit,
    canDelete
} = require('../src/workflow');

describe('getWorkflowForType', () => {

    it('should return a workflow for a known type', () => {
        const wf = getWorkflowForType('IT-Ticket');
        expect(wf).toBeDefined();
        expect(wf.type).toBe('IT-Ticket');
        expect(wf.abbreviation).toBe('ITT');
    });

    it('should return undefined for an unknown type', () => {
        const wf = getWorkflowForType('Nichtexistent');
        expect(wf).toBeUndefined();
    });
});

describe('getWorkflows', () => {

    it('should return an object with all loaded workflow types', () => {
        const workflows = getWorkflows();
        expect(typeof workflows).toBe('object');

        // Check some known types
        expect(workflows['IT-Ticket']).toBeDefined();
        expect(workflows['Abwesenheitsantrag']).toBeDefined();
        expect(workflows['Raumreservierung']).toBeDefined();
    });

    it('should have merged default.json fields into each workflow', () => {
        const wf = getWorkflowForType('IT-Ticket');
        // default.json defines standard fields like 'title', 'badges', 'description'
        const titleField = wf.fields.find(f => f.name === 'title');
        expect(titleField).toBeDefined();
        const badgesField = wf.fields.find(f => f.name === 'badges');
        expect(badgesField).toBeDefined();
    });

    it('should allow workflow-specific fields to override default fields', () => {
        const wf = getWorkflowForType('IT-Ticket');
        // IT-Ticket overrides 'description' to make it required
        const descField = wf.fields.find(f => f.name === 'description');
        expect(descField).toBeDefined();
        expect(descField.required).toBe(true);
    });
});

describe('canComment', () => {

    it('should allow groups listed in comment access rule', () => {
        // IT-Ticket comment groups: Schulleitung, Netzwerkteam
        expect(canComment('IT-Ticket', ['Schulleitung'])).toBe(true);
        expect(canComment('IT-Ticket', ['Netzwerkteam'])).toBe(true);
    });

    it('should deny groups not listed in comment access rule', () => {
        expect(canComment('IT-Ticket', ['Lehrkräfte'])).toBe(false);
        expect(canComment('IT-Ticket', ['Hausmeister'])).toBe(false);
    });

    it('should return false for unknown workflow type', () => {
        expect(canComment('Nichtexistent', ['Schulleitung'])).toBe(false);
    });

    it('should return false for empty groups', () => {
        expect(canComment('IT-Ticket', [])).toBe(false);
    });
});

describe('canEdit', () => {

    it('should allow groups listed in edit access rule', () => {
        // IT-Ticket edit groups: Netzwerkteam
        expect(canEdit('IT-Ticket', ['Netzwerkteam'])).toBe(true);
    });

    it('should deny groups not listed in edit access rule', () => {
        expect(canEdit('IT-Ticket', ['Lehrkräfte'])).toBe(false);
    });

    it('should always allow Administration group (admin override)', () => {
        expect(canEdit('IT-Ticket', ['Administration'])).toBe(true);
        expect(canEdit('Abwesenheitsantrag', ['Administration'])).toBe(true);
    });

    it('should return false for unknown workflow type (non-admin)', () => {
        expect(canEdit('Nichtexistent', ['Lehrkräfte'])).toBe(false);
    });

    it('should return true for unknown workflow type if Administration', () => {
        expect(canEdit('Nichtexistent', ['Administration'])).toBe(true);
    });
});

describe('canDelete', () => {

    it('should allow groups listed in delete access rule', () => {
        // IT-Ticket delete groups: Schulleitung, Netzwerkteam
        expect(canDelete('IT-Ticket', ['Schulleitung'])).toBe(true);
        expect(canDelete('IT-Ticket', ['Netzwerkteam'])).toBe(true);
    });

    it('should deny groups not listed in delete access rule', () => {
        expect(canDelete('IT-Ticket', ['Lehrkräfte'])).toBe(false);
    });

    it('should always allow Administration group (admin override)', () => {
        expect(canDelete('IT-Ticket', ['Administration'])).toBe(true);
    });

    it('should return false for unknown workflow type (non-admin)', () => {
        expect(canDelete('Nichtexistent', ['Lehrkräfte'])).toBe(false);
    });
});

describe('getVisibleTicketTypes', () => {

    it('should return types the user group can create', () => {
        // Lehrkräfte can create IT-Ticket and others
        const types = getVisibleTicketTypes(['Lehrkräfte']);
        expect(types).toContain('IT-Ticket');
        expect(types).toContain('Abwesenheitsantrag');
    });

    it('should exclude types the user group cannot create', () => {
        // Hausmeister group should not be able to create Stundenplan-Ticket
        const types = getVisibleTicketTypes(['Hausmeister']);
        expect(types).not.toContain('Stundenplan-Ticket');
        expect(types).not.toContain('Abwesenheitsantrag');
    });

    it('should return empty array for groups with no create permissions', () => {
        const types = getVisibleTicketTypes(['UnbekannteGruppe']);
        expect(types).toEqual([]);
    });

    it('should return multiple types for broad groups', () => {
        const types = getVisibleTicketTypes(['Lehrkräfte']);
        expect(types.length).toBeGreaterThan(1);
    });
});
