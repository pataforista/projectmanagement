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

    // SYNC INTEGRITY FIX: Always preserve _deleted and _timestamps metadata
    // These are managed by the store/sync engine and are crucial for LWW merging.
    if (record._deleted !== undefined) out._deleted = !!record._deleted;
    if (record._timestamps && typeof record._timestamps === 'object') {
        out._timestamps = sanitizeDeep(record._timestamps);
    }

    return Object.keys(out).length > 0 ? out : null;
}

// ── Store Schemas ────────────────────────────────────────────────────────────

// Allow any value (used for mixed-type or complex nested fields)
const isAny = () => true;

const SCHEMAS = {
    projects: {
        id: isStr, name: isStr, description: isStr, type: isStr,
        status: isStr, color: isStr, createdAt: isNum, order: isNum,
        parentId: isStr, thoughts: isStr, goal: isStr, visibility: isStr,
        ownerId: isStr, createdBy: isStr, createdById: isStr,
        startDate: isStr, endDate: isStr, obsidianUri: isStr, driveUrl: isStr,
    },
    tasks: {
        id: isStr, projectId: isStr, title: isStr, description: isStr,
        status: isStr, priority: isStr, dueDate: isStr, createdAt: isNum,
        updatedAt: isNum, cycleId: isStr, subtasks: isArr, tags: isArr,
        dependencies: isArr, assignee: isStr, assigneeId: isStr, effort: isNum,
        parentId: isStr, visibility: isStr, type: isStr,
        createdBy: isStr, createdById: isStr,
        updatedBy: isStr, updatedById: isStr,
        referenceIds: isArr,
    },
    cycles: {
        id: isStr, projectId: isStr, name: isStr, goal: isStr,
        status: isStr, startDate: isStr, endDate: isStr, createdAt: isNum,
        createdBy: isStr, createdById: isStr,
    },
    decisions: {
        id: isStr, projectId: isStr, title: isStr, description: isStr,
        // 'decision' field holds the actual decision text (different from 'description')
        decision: isStr, context: isStr, impact: isStr,
        outcome: isStr, createdAt: isNum, relatedTaskIds: isArr, date: isStr,
        ownerId: isStr,
    },
    documents: {
        id: isStr, projectId: isStr, title: isStr,
        // content is an array of block objects — NOT a plain string
        content: isAny,
        updatedAt: isNum, sections: isArr,
    },
    members: {
        id: isStr, name: isStr, role: isStr, createdAt: isNum,
        // email is intentionally omitted: stripped from the shared snapshot for privacy
    },
    messages: {
        id: isStr, projectId: isStr, author: isStr, text: isStr,
        timestamp: isNum, type: isStr, visibility: isStr,
    },
    annotations: {
        id: isStr, projectId: isStr, documentId: isStr, selectedText: isStr,
        comment: isStr, author: isStr, resolved: isBool, createdAt: isNum,
    },
    snapshots: {
        id: isStr, projectId: isStr, title: isStr,
        // content and delta can be arrays or objects depending on version strategy
        content: isAny,
        delta: isAny,
        timestamp: isNum,
    },
    logs: {
        id: isStr, action: isStr, entity: isStr, entityId: isStr,
        actor: isStr, timestamp: isNum,
    },
    library: {
        id: isStr, type: isStr, title: isStr, author: isStr, year: isNum,
        doi: isStr, abstract: isStr, tags: isArr, url: isStr, itemType: isStr,
    },
    sessions: {
        id: isStr, title: isStr, description: isStr, date: isStr,
        startTime: isStr, endTime: isStr, projectId: isStr, gcalId: isStr,
        createdAt: isNum, type: isStr, createdBy: isStr, createdById: isStr,
        ownerId: isStr,
    },
    timeLogs: {
        id: isStr, taskId: isStr, projectId: isStr, minutes: isNum,
        note: isStr, createdAt: isNum,
    },
    notifications: {
        id: isStr, type: isStr, title: isStr, text: isStr,
        read: isBool, projectId: isStr, timestamp: isNum,
    },
    interconsultations: {
        id: isStr, patientId: isStr, patientName: isStr, specialty: isStr,
        status: isStr, date: isStr, agenda: isStr, acceptedBy: isStr,
        reason: isStr, projectId: isStr, assigneeId: isStr, notes: isStr,
        createdAt: isNum, updatedAt: isNum, obsidianUri: isStr,
    },
};

// Allowed top-level keys in a HYDRATE_STORE payload
const METADATA_KEYS = new Set([
    'version', 'snapshotSeq', 'updatedAt', 'metadata',
    'settings', 'workspaceSalt', 'pbkdf2Iterations', 'e2ee'
]);

const ALLOWED_KEYS = new Set([...Object.keys(SCHEMAS), ...METADATA_KEYS]);

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

        // Handle metadata keys (pass through)
        if (METADATA_KEYS.has(key)) {
            valid[key] = records;
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
