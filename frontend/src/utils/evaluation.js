export function evaluateTemplate(templateStr, ticketData) {
    if (typeof templateStr !== 'string') return templateStr;

    // Check if the string perfectly matches a boolean expression
    const boolMatch = templateStr.match(/^\{\{(.+)\}\}$/);
    if (boolMatch) {
        const expr = boolMatch[1];
        try {
            // Evaluates the boolean expression
            const func = new Function('ticket', `return ${expr}`);
            const result = func(ticketData || {});
            // If the expression evaluates to a pure boolean, return it
            if (typeof result === 'boolean') {
                return result;
            }
        } catch (e) {
            // Fall through to string replacement
        }
    }

    return templateStr.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
        try {
            const func = new Function('ticket', `return ${expr}`);
            const result = func(ticketData || {});
            return result === undefined || result === null ? '' : result;
        } catch (e) {
            console.warn(`Failed to evaluate expression: ${expr}`, e);
            return match; // Keep original on error
        }
    });
}

export function evaluateFields(fields, ticketData) {
    if (!fields) return [];

    return fields.map(field => {
        const evaluatedField = { ...field };

        // Evaluate all string properties of the field
        for (const [key, value] of Object.entries(evaluatedField)) {
            if (typeof value === 'string' && value.includes('{{')) {
                evaluatedField[key] = evaluateTemplate(value, ticketData);
            }
        }

        return evaluatedField;
    });
}

export function validateTicket(ticketData, workflow, formFields = null) {
    const errors = [];

    // 1. Validate required fields
    const fieldsToValidate = formFields || workflow.fields || [];
    const evaluatedFields = evaluateFields(fieldsToValidate, ticketData);

    evaluatedFields.forEach(field => {
        // Field is required AND it's not explicitly hidden
        if (field.required && field.visible !== false) {
            const val = ticketData[field.name];
            if (val === undefined || val === null || val === '') {
                errors.push(`Das Feld '${field.label || field.name}' ist ein Pflichtfeld.`);
            }
        }

        // Field-specific validation
        if (field.validation && field.visible !== false) {
            try {
                const func = new Function('ticket', `return ${field.validation.expression}`);
                const passed = func(ticketData || {});
                if (!passed) {
                    errors.push(field.validation.message || `Validierung fehlgeschlagen für '${field.label || field.name}'`);
                }
            } catch (e) {
                console.error(`Error evaluating field validation for ${field.name}:`, e);
                errors.push(`Interner Fehler bei Validierung von '${field.label || field.name}'`);
            }
        }
    });

    // 2. Cross-field validations
    if (workflow.validations && Array.isArray(workflow.validations)) {
        workflow.validations.forEach(validation => {
            try {
                const func = new Function('ticket', `return ${validation.expression}`);
                const passed = func(ticketData || {});
                if (!passed) {
                    errors.push(validation.message || `Validation failed: ${validation.name}`);
                }
            } catch (e) {
                console.error(`Error evaluating validation ${validation.name}:`, e);
                errors.push(`Interner Fehler bei Validierung: ${validation.name}`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}
