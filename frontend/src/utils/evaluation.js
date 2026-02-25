const createSafeEvaluator = (expr, ticketData) => {
    const keys = Object.keys(ticketData || {});
    const values = Object.values(ticketData || {});
    const validKeys = keys.filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
    const validValues = validKeys.map(k => values[keys.indexOf(k)]);

    // Always include 'ticket' for backward compatibility
    validKeys.push('ticket');
    validValues.push(ticketData || {});

    const func = new Function(...validKeys, `return ${expr}`);
    return () => func(...validValues);
};

export function evaluateTemplate(templateStr, ticketData) {
    if (typeof templateStr !== 'string') return templateStr;

    // Check if the string perfectly matches a boolean expression
    const boolMatch = templateStr.match(/^\{\{(.+)\}\}$/);
    if (boolMatch) {
        const expr = boolMatch[1];
        try {
            const evaluate = createSafeEvaluator(expr, ticketData);
            const result = evaluate();
            if (typeof result === 'boolean') {
                return result;
            }
        } catch (e) {
            // Fall through to string replacement
        }
    }

    return templateStr.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
        try {
            const evaluate = createSafeEvaluator(expr, ticketData);
            const result = evaluate();
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
                const evaluate = createSafeEvaluator(field.validation.expression, ticketData);
                const passed = evaluate();
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
                const evaluate = createSafeEvaluator(validation.expression, ticketData);
                const passed = evaluate();
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
