function evaluateTemplate(templateStr, ticketData) {
    if (typeof templateStr !== 'string') return templateStr;

    // Check if the string perfectly matches a boolean expression
    const boolMatch = templateStr.match(/^\{\{(.+)\}\}$/);
    if (boolMatch) {
        const expr = boolMatch[1];
        try {
            const func = new Function('ticket', `return ${expr}`);
            const result = func(ticketData || {});
            if (typeof result === 'boolean') {
                return result;
            }
        } catch (e) {
            // Fall through
        }
    }

    return templateStr.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
        try {
            const func = new Function('ticket', `return ${expr}`);
            const result = func(ticketData || {});
            return result === undefined || result === null ? '' : result;
        } catch (e) {
            console.warn(`Failed to evaluate expression: ${expr}`, e);
            return match;
        }
    });
}

function evaluateFields(fields, ticketData) {
    if (!fields) return [];

    return fields.map(field => {
        const evaluatedField = { ...field };

        for (const [key, value] of Object.entries(evaluatedField)) {
            if (typeof value === 'string' && value.includes('{{')) {
                evaluatedField[key] = evaluateTemplate(value, ticketData);
            }
        }

        return evaluatedField;
    });
}

function validateTicket(ticketData, workflow, formFields = null) {
    const errors = [];

    const fieldsToValidate = formFields || workflow.fields || [];
    const evaluatedFields = evaluateFields(fieldsToValidate, ticketData);

    evaluatedFields.forEach(field => {
        if (field.required && field.visible !== false) {
            const val = ticketData[field.name];
            if (val === undefined || val === null || val === '') {
                errors.push(`Das Feld '${field.label || field.name}' ist ein Pflichtfeld.`);
            }
        }
    });

    if (workflow.validations && Array.isArray(workflow.validations)) {
        workflow.validations.forEach(validation => {
            try {
                const func = new Function('ticket', `return ${validation.expression}`);
                const passed = func(ticketData || {});
                if (!passed) {
                    errors.push(validation.message || `Validierung fehlgeschlagen: ${validation.name}`);
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

module.exports = {
    evaluateTemplate,
    evaluateFields,
    validateTicket
};
