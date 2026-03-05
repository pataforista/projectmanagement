/**
 * schema.js — Nexus Fortress: Sync Payload Validator
 *
 * Prevents XSS and data injection by validating every HYDRATE_STORE payload
 * from Google Drive BEFORE it touches IndexedDB or the in-memory store.
 *
 * Strategy: Allowlist-based validation
 *  - Only known top-level keys accepted
 *  - Per-store field validators with type checking
 *  - Strings are stripped of <script>, event handlers, and data: URIs
 *  - Unknown fields are silently dropped (not rejected)
 */

// ── String Sanitizer ─────────────────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    /javascript\s*:/gi,
    /on\w+\s*=/gi,              // onclick=, onerror=, etc.
    /data\s*:\s*text\/html/gi,  // data: URI XSS
    /vbscript\s*:/gi,
];

function sanitizeString(val) {
    if (typeof val !== 'string') return val;
    let s = val;
    for (const pat of DANGEROUS_PATTERNS) s = s.replace(pat, '');
    return s;
}

function sanitizeDeep(obj) {
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeDeep);
    if (obj && typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) out[k] = sanitizeDeep(v);
        return out;
    }
    return obj;
}

// ── Field Validators ─────────────────────────────────────────────────────────

const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number';
const isBool = v => typeof v === 'boolean';
const isArr = v => Array.isArray(v);

/** Validates a single record field-by-field using a shape definition */
function validateRecord(record, shape) {
    if (!record || typeof record !== 'object') return null;
    const out = {};
    for (const [field, validator] of Object.entries(shape)) {
        const val = record[field];
        if (val === undefined || val === null) continue; // optional fields are skipped
        if (validator(val)) out[field] = sanitizeDeep(val);
        // Invalid-typed fields are silently dropped
    }
    return Object.keys(out).length > 0 ? out : null;
}

// ── Store Schemas ────────────────────────────────────────────────────────────

const SCHEMAS = {
    projects: {
        id: isStr, name: isStr, description: isStr, type: isStr,
        status: isStr, color: isStr, createdAt: isNum, order: isNum,
        parentId: isStr, thoughts: isStr
    },
    tasks: {
        id: isStr, projectId: isStr, title: isStr, description: isStr,
        status: isStr, priority: isStr, dueDate: isStr, createdAt: isNum,
        cycleId: isStr, subtasks: isArr, tags: isArr, dependencies: isArr,
        assignee: isStr, effort: isNum, parentId: isStr
    },
    cycles: {
        id: isStr, projectId: isStr, name: isStr, goal: isStr,
        status: isStr, startDate: isStr, endDate: isStr, createdAt: isNum
    },
    decisions: {
        id: isStr, projectId: isStr, title: isStr, description: isStr,
        outcome: isStr, createdAt: isNum, relatedTaskIds: isArr
    },
    documents: {
        id: isStr, projectId: isStr, title: isStr, content: isStr,
        updatedAt: isNum, sections: isArr
    },
    members: {
        id: isStr, name: isStr, role: isStr, email: isStr, createdAt: isNum
    },
    messages: {
        id: isStr, projectId: isStr, author: isStr, text: isStr,
        timestamp: isNum, type: isStr
    },
    annotations: {
        id: isStr, projectId: isStr, documentId: isStr, selectedText: isStr,
        comment: isStr, author: isStr, resolved: isBool, createdAt: isNum
    },
    snapshots: {
        id: isStr, projectId: isStr, title: isStr, content: isStr,
        delta: isStr, timestamp: isNum
    },
    logs: {
        id: isStr, action: isStr, entity: isStr, entityId: isStr,
        actor: isStr, timestamp: isNum
    },
    library: {
        id: isStr, type: isStr, title: isStr, author: isStr, year: isNum,
        doi: isStr, abstract: isStr, tags: isArr, url: isStr
    },
    sessions: {
        id: isStr, title: isStr, description: isStr, date: isStr,
        startTime: isStr, endTime: isStr, projectId: isStr, gcalId: isStr,
        createdAt: isNum
    },
    timeLogs: {
        id: isStr, taskId: isStr, projectId: isStr, minutes: isNum,
        note: isStr, createdAt: isNum
    },
    notifications: {
        id: isStr, type: isStr, title: isStr, text: isStr,
        read: isBool, projectId: isStr, timestamp: isNum
    }
};

// Allowed top-level keys in a HYDRATE_STORE payload
const ALLOWED_KEYS = new Set(Object.keys(SCHEMAS));

// ── Public Validator ─────────────────────────────────────────────────────────

/**
 * Validates and sanitizes a HYDRATE_STORE payload.
 * Returns a clean payload with only valid, sanitized records.
 * Logs warnings for rejected items.
 *
 * @param {object} payload - Raw payload from Google Drive
 * @returns {{ valid: object, rejected: number }}
 */
export function validateSyncPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        console.error('[Schema] Invalid payload: not an object');
        return { valid: {}, rejected: 0 };
    }

    const valid = {};
    let rejected = 0;

    for (const [key, records] of Object.entries(payload)) {
        // Drop unknown top-level keys
        if (!ALLOWED_KEYS.has(key)) {
            console.warn(`[Schema] Dropping unknown top-level key: "${key}"`);
            rejected++;
            continue;
        }

        if (!Array.isArray(records)) continue;

        const schema = SCHEMAS[key];
        const cleanRecords = [];

        for (const record of records) {
            // Each record must have an `id` string
            if (!record?.id || typeof record.id !== 'string') {
                rejected++;
                continue;
            }

            const cleaned = validateRecord(record, schema);
            if (cleaned) {
                // Always preserve the id
                cleanRecords.push({ id: record.id, ...cleaned });
            } else {
                rejected++;
            }
        }

        valid[key] = cleanRecords;
    }

    if (rejected > 0) {
        console.warn(`[Schema] Validation complete. ${rejected} records/fields rejected.`);
    }

    return { valid, rejected };
}

/**
 * Quick validation for a single record before it enters the store.
 * Returns null if the record fails validation.
 */
export function validateRecord_single(storeName, record) {
    const schema = SCHEMAS[storeName];
    if (!schema) return record; // Unknown store: pass through
    return validateRecord(record, schema);
}
