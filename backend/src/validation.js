const { format, formatDistance, addDays, subDays } = require('date-fns');
const { de } = require('date-fns/locale');

const userCache = new Map();

// Helper to lookup user displayName in background
function getBackendDisplayName(username) {
    if (!username) return '';
    const cleanUsername = username.toLowerCase();
    if (userCache.has(cleanUsername)) {
        return userCache.get(cleanUsername);
    }
    
    // Trigger background database fetch
    try {
        const User = require('./models/user');
        User.findOne({ username: cleanUsername }).then(u => {
            if (u && u.displayName) {
                userCache.set(cleanUsername, u.displayName);
            } else {
                userCache.set(cleanUsername, username);
            }
        }).catch(err => {
            console.error(`[Validation] Error fetching user ${username} in background:`, err);
        });
    } catch (e) {
        // Model import or mongoose fetch could fail if not fully initialized or in test scripts
    }

    // Return fallback for first execution
    return username;
}

// Pre-populate user cache
try {
    const User = require('./models/user');
    User.find({}).then(users => {
        for (const u of users) {
            if (u.username && u.displayName) {
                userCache.set(u.username.toLowerCase(), u.displayName);
            }
        }
    }).catch(err => {
        // Connection or query might fail on immediate startup, background fetch will handle
    });
} catch (e) {
    // Ignore import errors in tests/scripts where Mongoose isn't initialized
}

function getFirstNameFromDisplayName(displayName) {
    if (!displayName) return '';
    if (displayName.includes(',')) {
        const parts = displayName.split(',');
        return parts[1] ? parts[1].trim() : parts[0].trim();
    }
    const parts = displayName.trim().split(/\s+/);
    return parts[0] || '';
}

function getLastNameFromDisplayName(displayName) {
    if (!displayName) return '';
    if (displayName.includes(',')) {
        const parts = displayName.split(',');
        return parts[0].trim();
    }
    const parts = displayName.trim().split(/\s+/);
    if (parts.length <= 1) return '';
    return parts.slice(1).join(' ');
}

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
        currentUser: () => user || {},
        firstName: (username) => {
            const displayName = getBackendDisplayName(username);
            return getFirstNameFromDisplayName(displayName);
        },
        lastName: (username) => {
            const displayName = getBackendDisplayName(username);
            return getLastNameFromDisplayName(displayName);
        }
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
