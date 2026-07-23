const { format, formatDistance, addDays, subDays } = require('date-fns');
const { de } = require('date-fns/locale');

const createSafeEvaluator = (expr, ticketData, user = null) => {
    const keys = Object.keys(ticketData || {});
    const values = Object.values(ticketData || {});
    const validKeys = keys.filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k));
    const validValues = validKeys.map(k => values[keys.indexOf(k)]);

    validKeys.push('ticket');
    validValues.push(ticketData || {});

    // Inject helpers
    const helpers = {
        format: (date, fmt) => date ? format(new Date(date), fmt, { locale: de }) : '',
        formatDistance: (d1, d2) => d1 && d2 ? formatDistance(new Date(d1), new Date(d2), { locale: de }) : '',
        addDays: (date, amount) => date ? addDays(new Date(date), amount) : null,
        subDays: (date, amount) => date ? subDays(new Date(date), amount) : null,
        now: new Date(),
        context: { user: user ? user.username : null },
        currentUser: () => user || {}
    };

    for (const [key, val] of Object.entries(helpers)) {
        validKeys.push(key);
        validValues.push(val);
    }

    const func = new Function(...validKeys, `return ${expr}`);
    return () => func(...validValues);
};

function evaluateTemplate(templateStr, ticketData, user = null) {
    if (typeof templateStr !== 'string') return templateStr;

    const singleMatch = templateStr.match(/^\{\{((?:[^}]|\}(?!\}))+)\}\}$/);
    if (singleMatch) {
        const expr = singleMatch[1];
        try {
            const evaluate = createSafeEvaluator(expr, ticketData, user);
            return evaluate();
        } catch (e) {
            console.warn(`Failed to evaluate expression: ${expr}`, e);
            return templateStr;
        }
    }

    return templateStr.replace(/\{\{(.+?)\}\}/g, (match, expr) => {
        try {
            const evaluate = createSafeEvaluator(expr, ticketData, user);
            const result = evaluate();
            return result === undefined || result === null ? '' : result;
        } catch (e) {
            console.warn(`Failed to evaluate expression: ${expr}`, e);
            return match;
        }
    });
}

function evaluateFields(fields, ticketData, user = null) {
    if (!fields) return [];

    return fields.map(field => {
        const evaluatedField = { ...field };

        for (const [key, value] of Object.entries(evaluatedField)) {
            if (typeof value === 'string' && value.includes('{{')) {
                let val = evaluateTemplate(value, ticketData, user);
                if (['visible', 'readonly', 'required', 'optional', 'fixedLength', 'fixedOrder'].includes(key)) {
                    val = !!val;
                }
                evaluatedField[key] = val;
            }
        }

        return evaluatedField;
    });
}

function validateTicket(ticketData, workflow, formFields = null, user = null) {
    const errors = [];

    const fieldsToValidate = formFields || workflow.fields || [];
    const evaluatedFields = evaluateFields(fieldsToValidate, ticketData, user);

    evaluatedFields.forEach(field => {
        if (field.required && field.visible !== false) {
            const val = ticketData[field.name];
            if (val === undefined || val === null || val === '') {
                errors.push(`Das Feld '${field.label || field.name}' ist ein Pflichtfeld.`);
            }
        }

        if (field.validation && field.visible !== false) {
            try {
                const evaluate = createSafeEvaluator(field.validation.expression, ticketData, user);
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

    if (workflow.validations && Array.isArray(workflow.validations)) {
        workflow.validations.forEach(validation => {
            try {
                const evaluate = createSafeEvaluator(validation.expression, ticketData, user);
                const passed = evaluate();
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

/**
 * Compute summary string from workflow template for search/display purposes.
 * Should be called before every ticket.save() to keep summary in sync.
 */
function computeSummary(ticketData, wf) {
    if (!wf || !wf.template) return undefined;
    try {
        const data = typeof ticketData.toObject === 'function' ? ticketData.toObject() : ticketData;
        const result = evaluateTemplate(wf.template, data);
        return typeof result === 'string' ? result.trim() : String(result || '').trim();
    } catch (e) {
        console.warn('[computeSummary] Error:', e.message);
        return undefined;
    }
}

module.exports = {
    evaluateTemplate,
    evaluateFields,
    validateTicket,
    computeSummary
};
