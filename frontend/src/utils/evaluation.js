import { format, formatDistance, addDays, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { useUsersStore } from '../stores/users';

// Lazy-initialized users store instance for lookupUserEmail helper
let _usersStore = null;
const getUsersStore = () => {
    if (!_usersStore) {
        try {
            _usersStore = useUsersStore();
        } catch (e) {
            // May fail if called outside Vue/Pinia context
        }
    }
    return _usersStore;
};

const createSafeEvaluator = (expr, ticketData) => {
    // We cannot just use Object.keys(ticketData) because Vue needs to track GET requests
    // for specific properties inside the expression, even if they don't exist on the object yet.
    // By passing 'ticket' as the proxy itself, evaluating `ticket.breakfast` will trigger
    // Vue's reactive getter for 'breakfast' and correctly register the dependency!

    // Wait, some expressions use variables directly without 'ticket.', so we must still inject them.
    // But to preserve reactivity on missing keys, we can use a `with (ticketData)` block 
    // inside the evaluator function! A `with` statement will intercept all variable reads 
    // and route them through the proxy getter.

    // Inject helpers
    const helpers = {
        format: (date, fmt) => date ? format(new Date(date), fmt, { locale: de }) : '',
        formatDistance: (d1, d2) => d1 && d2 ? formatDistance(new Date(d1), new Date(d2), { locale: de }) : '',
        addDays: (date, amount) => date ? addDays(new Date(date), amount) : null,
        subDays: (date, amount) => date ? subDays(new Date(date), amount) : null,
        now: new Date(),
        currentUser: () => {
            try {
                return JSON.parse(localStorage.getItem('user') || '{}');
            } catch (e) {
                return {};
            }
        },
        context: { 
            get user() {
                try {
                    return JSON.parse(localStorage.getItem('user') || '{}').username;
                } catch (e) {
                    return null;
                }
            }
        },
        lookupUserEmail: (username) => {
            if (!username) return null;
            const store = getUsersStore();
            if (!store) return null;
            const userData = store.getUserData(username);
            if (userData && userData.employeeId) {
                return `${userData.employeeId}@valckenburgschule.de`;
            }
            return null;
        }
    };

    const validKeys = ['ticket', 'helpers'];
    const validValues = [ticketData || {}, helpers];

    const funcBody = `
        with(helpers) {
            with(ticket) {
                return ${expr};
            }
        }
    `;

    const func = new Function(...validKeys, funcBody);
    return () => func(...validValues);
};

export function evaluateTemplate(templateStr, ticketData) {
    if (typeof templateStr !== 'string') return templateStr;

    // Check if the string perfectly matches a single expression
    const singleMatch = templateStr.match(/^\{\{((?:[^}]|\}(?!\}))+)\}\}$/);
    if (singleMatch) {
        const expr = singleMatch[1];
        try {
            const evaluate = createSafeEvaluator(expr, ticketData);
            return evaluate(); // Return actual evaluated value instead of coercing to boolean
        } catch (e) {
            console.warn(`Failed to evaluate expression: ${expr}`, e);
            return templateStr;
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
                let val = evaluateTemplate(value, ticketData);
                // Coerce boolean properties to handle undefined properly (e.g., v-if="undefined !== false" shows field)
                if (['visible', 'readonly', 'required', 'optional', 'fixedLength', 'fixedOrder'].includes(key)) {
                    val = !!val;
                }
                evaluatedField[key] = val;
            }
        }

        return evaluatedField;
    });
}

/**
 * Evaluates 'fill' expressions on fields and returns derived values.
 * Only returns values for fields where the fill expression evaluates to a non-empty result.
 * The caller is responsible for only applying fills to currently empty fields.
 *
 * @param {Array} fields - Field definitions (may contain 'fill' properties with {{ }} expressions)
 * @param {Object} context - The data context (ticket data or row data for ObjectArrays)
 * @returns {Object} Map of { fieldName: derivedValue } for non-empty fill results
 */
export function computeFills(fields, context) {
    if (!fields) return {};

    const fills = {};
    for (const field of fields) {
        if (field.fill && typeof field.fill === 'string' && field.fill.includes('{{')) {
            try {
                const value = evaluateTemplate(field.fill, context);
                if (value !== undefined && value !== null && value !== '') {
                    fills[field.name] = value;
                }
            } catch (e) {
                console.warn(`Failed to evaluate fill for field ${field.name}:`, e);
            }
        }
    }
    return fills;
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
