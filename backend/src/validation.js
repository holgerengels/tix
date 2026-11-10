const { format, formatDistance, addDays, subDays } = require('date-fns');
const { de } = require('date-fns/locale');
const mongoose = require('mongoose');

const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const PRELOAD_RETRY_COOLDOWN = 5 * 1000; // 5 seconds
const MAX_EVALUATOR_CACHE_SIZE = 1000;
const IDENTIFIER_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const userCache = new Map(); // cleanUsername -> { displayName, timestamp }
const pendingUserFetches = new Set();
let preloadPromise = null;
let lastBulkPreload = 0;
let lastBulkAttempt = 0;

const evaluatorCache = new Map();

function pruneExpiredUsers(now = Date.now()) {
    for (const [key, entry] of userCache.entries()) {
        if (now - entry.timestamp >= USER_CACHE_TTL) {
            userCache.delete(key);
        }
    }
}

async function preloadUserCache() {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
    if (preloadPromise) return preloadPromise;

    lastBulkAttempt = Date.now();

    preloadPromise = (async () => {
        try {
            const User = require('./models/user');
            const query = User.find({}, 'username displayName');
            const users = typeof query?.lean === 'function' ? await query.lean() : await query;
            const now = Date.now();
            pruneExpiredUsers(now);
            for (const u of (users || [])) {
                if (u.username && u.displayName) {
                    userCache.set(u.username.toLowerCase(), {
                        displayName: u.displayName,
                        timestamp: now
                    });
                }
            }
            lastBulkPreload = now;
        } catch (err) {
            // Connection or query might fail on immediate startup; background fetch will handle
        } finally {
            preloadPromise = null;
        }
    })();

    return preloadPromise;
}

function refreshUserInBackground(cleanUsername, fallbackUsername) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return;

    const now = Date.now();
    if (now - lastBulkPreload >= USER_CACHE_TTL && now - lastBulkAttempt >= PRELOAD_RETRY_COOLDOWN) {
        preloadUserCache();
        return;
    }

    if (pendingUserFetches.has(cleanUsername)) return;
    pendingUserFetches.add(cleanUsername);

    try {
        const User = require('./models/user');
        const query = User.findOne({ username: cleanUsername }, 'username displayName');
        const promise = typeof query?.lean === 'function' ? query.lean() : query;
        Promise.resolve(promise).then(u => {
            const displayName = (u && u.displayName) ? u.displayName : fallbackUsername;
            userCache.set(cleanUsername, { displayName, timestamp: Date.now() });
        }).catch(err => {
            console.error(`[Validation] Error fetching user ${fallbackUsername} in background:`, err);
        }).finally(() => {
            pendingUserFetches.delete(cleanUsername);
        });
    } catch (e) {
        pendingUserFetches.delete(cleanUsername);
        // Model import or mongoose fetch could fail if not fully initialized or in test scripts
    }
}

// Helper to lookup user displayName from TTL cache with background refresh
function getBackendDisplayName(username) {
    if (!username) return '';
    const cleanUsername = username.toLowerCase();
    const now = Date.now();
    const cached = userCache.get(cleanUsername);

    if (cached) {
        if (now - cached.timestamp < USER_CACHE_TTL) {
            return cached.displayName;
        }
        // Stale-while-revalidate: avoid flashing raw username while refreshing expired entry
        refreshUserInBackground(cleanUsername, username);
        return cached.displayName;
    }

    refreshUserInBackground(cleanUsername, username);
    return username;
}

// Pre-populate user cache once DB connection is active (no buffering queries during unit tests)
if (mongoose.connection) {
    if (mongoose.connection.readyState === 1) {
        preloadUserCache();
    }
    if (typeof mongoose.connection.on === 'function') {
        mongoose.connection.on('connected', () => {
            preloadUserCache();
        });
    }
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

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function getCompiledEvaluator(expr, validKeys, isAsync) {
    const cacheKey = `${isAsync ? 'A' : 'S'}\0${validKeys.join(',')}\0${expr}`;
    let func = evaluatorCache.get(cacheKey);
    if (!func) {
        func = isAsync
            ? new AsyncFunction(...validKeys, `return await (${expr})`)
            : new Function(...validKeys, `return ${expr}`);
        if (evaluatorCache.size >= MAX_EVALUATOR_CACHE_SIZE) {
            evaluatorCache.delete(evaluatorCache.keys().next().value);
        }
        evaluatorCache.set(cacheKey, func);
    }
    return func;
}

const createSafeEvaluator = (expr, ticketData, user = null, action = null, isAsync = false) => {
    const data = ticketData || {};
    const validKeys = [];
    const validValues = [];
    for (const [k, v] of Object.entries(data)) {
        if (IDENTIFIER_REGEX.test(k)) {
            validKeys.push(k);
            validValues.push(v);
        }
    }

    validKeys.push('ticket');
    validValues.push(data);

    // Inject helpers
    const helpers = {
        format: (date, fmt) => date ? format(new Date(date), fmt, { locale: de }) : '',
        formatDistance: (d1, d2) => d1 && d2 ? formatDistance(new Date(d1), new Date(d2), { locale: de }) : '',
        addDays: (date, amount) => date ? addDays(new Date(date), amount) : null,
        subDays: (date, amount) => date ? subDays(new Date(date), amount) : null,
        now: new Date(),
        action: action || null,
        context: { user: user ? user.username : null },
        currentUser: () => user || {},
        firstName: (username) => {
            const displayName = getBackendDisplayName(username);
            return getFirstNameFromDisplayName(displayName);
        },
        lastName: (username) => {
            const displayName = getBackendDisplayName(username);
            return getLastNameFromDisplayName(displayName);
        },
        isAvailable: async (termin, date, excludeTicketId = null) => {
            if (!termin || !termin.room || !termin.start || !termin.end || !date) return true;
            const { checkRoomAvailability } = require('./caldav');
            return await checkRoomAvailability(termin.room, date, termin.start, termin.end, excludeTicketId);
        }
    };

    for (const [key, val] of Object.entries(helpers)) {
        validKeys.push(key);
        validValues.push(val);
    }

    const func = getCompiledEvaluator(expr, validKeys, isAsync);
    return () => func(...validValues);
};

function shouldRunValidation(validationDef, action = null) {
    if (!validationDef) return false;

    if (validationDef.actions) {
        const allowed = Array.isArray(validationDef.actions) ? validationDef.actions : [validationDef.actions];
        if (!action || !allowed.includes(action)) {
            return false;
        }
    }

    if (validationDef.exceptActions) {
        const excluded = Array.isArray(validationDef.exceptActions) ? validationDef.exceptActions : [validationDef.exceptActions];
        if (action && excluded.includes(action)) {
            return false;
        }
    }

    return true;
}

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
            if (key === 'default' || key === 'computed') continue;
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

function validateTicket(ticketData, workflow, formFields = null, user = null, action = null) {
    const errors = [];

    const fieldsToValidate = formFields || workflow.fields || [];
    const evaluatedFields = evaluateFields(fieldsToValidate, ticketData, user);
    const asyncTasks = [];

    for (const field of evaluatedFields) {
        if (field.required && field.visible !== false) {
            const val = ticketData[field.name];
            if (val === undefined || val === null || val === '') {
                errors.push(`Das Feld '${field.label || field.name}' ist ein Pflichtfeld.`);
            }
        }

        if (field.validation && field.visible !== false && shouldRunValidation(field.validation, action)) {
            try {
                const expr = field.validation.expression;
                const isAsync = expr && (expr.includes('isAvailable') || expr.includes('await'));
                const evaluate = createSafeEvaluator(expr, ticketData, user, action, isAsync);
                const res = evaluate();
                if (res instanceof Promise || (res && typeof res.then === 'function')) {
                    asyncTasks.push(
                        res.then(passed => {
                            if (!passed) {
                                errors.push(field.validation.message || `Validierung fehlgeschlagen für '${field.label || field.name}'`);
                            }
                        }).catch(e => {
                            console.error(`Error evaluating field validation for ${field.name}:`, e.message || e);
                            const isUserFacing = e.isValidationError || (e.message && e.message.startsWith('Kalender-Server'));
                            const msg = isUserFacing ? e.message : `Interner Fehler bei Validierung von '${field.label || field.name}'`;
                            errors.push(msg);
                        })
                    );
                } else {
                    if (!res) {
                        errors.push(field.validation.message || `Validierung fehlgeschlagen für '${field.label || field.name}'`);
                    }
                }
            } catch (e) {
                console.error(`Error evaluating field validation for ${field.name}:`, e.message || e);
                const isUserFacing = e.isValidationError || (e.message && e.message.startsWith('Kalender-Server'));
                const msg = isUserFacing ? e.message : `Interner Fehler bei Validierung von '${field.label || field.name}'`;
                errors.push(msg);
            }
        }
    }

    if (workflow.validations && Array.isArray(workflow.validations)) {
        for (const validation of workflow.validations) {
            if (shouldRunValidation(validation, action)) {
                try {
                    const expr = validation.expression;
                    const isAsync = expr && (expr.includes('isAvailable') || expr.includes('await'));
                    const evaluate = createSafeEvaluator(expr, ticketData, user, action, isAsync);
                    const res = evaluate();
                    if (res instanceof Promise || (res && typeof res.then === 'function')) {
                        asyncTasks.push(
                            res.then(passed => {
                                if (!passed) {
                                    errors.push(validation.message || `Validierung fehlgeschlagen: ${validation.name}`);
                                }
                            }).catch(e => {
                                console.error(`Error evaluating validation ${validation.name}:`, e.message || e);
                                const isUserFacing = e.isValidationError || (e.message && e.message.startsWith('Kalender-Server'));
                                const msg = isUserFacing ? e.message : `Interner Fehler bei Validierung: ${validation.name}`;
                                errors.push(msg);
                            })
                        );
                    } else {
                        if (!res) {
                            errors.push(validation.message || `Validierung fehlgeschlagen: ${validation.name}`);
                        }
                    }
                } catch (e) {
                    console.error(`Error evaluating validation ${validation.name}:`, e.message || e);
                    const isUserFacing = e.isValidationError || (e.message && e.message.startsWith('Kalender-Server'));
                    const msg = isUserFacing ? e.message : `Interner Fehler bei Validierung: ${validation.name}`;
                    errors.push(msg);
                }
            }
        }
    }

    if (asyncTasks.length > 0) {
        return Promise.all(asyncTasks).then(() => ({
            isValid: errors.length === 0,
            errors
        }));
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

function clearValidationCaches() {
    userCache.clear();
    evaluatorCache.clear();
    pendingUserFetches.clear();
    lastBulkPreload = 0;
    lastBulkAttempt = 0;
}

module.exports = {
    createSafeEvaluator,
    shouldRunValidation,
    evaluateTemplate,
    evaluateFields,
    validateTicket,
    computeSummary,
    preloadUserCache,
    getBackendDisplayName,
    getEvaluatorCacheSize: () => evaluatorCache.size,
    getUserCacheSize: () => userCache.size,
    clearValidationCaches
};
