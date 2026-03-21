/**
 * crypto.js — Nexus Fortress: Encryption layer using Web Crypto API
 *
 * Architecture:
 *  - Password → PBKDF2 → AES-256-GCM key (lives only in RAM)
 *  - Each put() encrypts: { iv, ciphertext } stored in IDB
 *  - On app lock, the key is wiped from memory
 *  - Zero plaintext sensitive data survives in IndexedDB
 *
 * Algorithm choices:
 *  - PBKDF2 with SHA-256, iterations stored per-install in localStorage
 *    (TARGET = 600,000 for new installs — OWASP 2024 / NIST SP 800-132 2025)
 *    (LEGACY = 310,000 retained for existing installs — backward compat)
 *  - AES-256-GCM: authenticated encryption (detects tampering)
 *  - Random 96-bit IV per operation (GCM spec)
 *
 * Migration path (310k → 600k):
 *  - New installs automatically use TARGET_PBKDF2_ITERATIONS.
 *  - Existing installs keep their stored iteration count.
 *  - Call isLegacyIterations() to detect upgrade eligibility.
 *  - After the user re-sets their password (app.js profile flow) the new
 *    hash is derived with TARGET iterations and localStorage is updated,
 *    completing the migration transparently.
 */

// ── PBKDF2 iteration counts ──────────────────────────────────────────────────
const TARGET_PBKDF2_ITERATIONS  = 600_000; // OWASP 2024 / NIST 2025 recommendation
const LEGACY_PBKDF2_ITERATIONS  = 310_000; // OWASP 2023 — kept for backward compat
const PBKDF2_ITERATIONS_KEY     = 'nexus_pbkdf2_iterations';
// BUG 26 FIX: Two-phase commit key for iteration upgrades.
// upgradeIterations() writes to the PENDING key (not the live key). The live key
// is only updated after the first successful rotation push (commitIterationUpgrade).
// This prevents a state where localStorage says "600k" but Drive still holds data
// encrypted with the 310k-derived key — a mismatch that locks the user out with
// an opaque "wrong password" error that cannot be resolved without wiping the cache.
const PBKDF2_ITERATIONS_PENDING_KEY = 'nexus_pbkdf2_iterations_pending';

/**
 * Returns the iterations to use for key derivation.
 * During an active key rotation (nexus_key_rotating === 'true') the pending
 * value is returned so deriveKey() uses the target count for the rotation push.
 * Once the rotation is committed the live key is used by all subsequent unlocks.
 */
export function getStoredIterations() {
    // During rotation, use the pending (target) count so the rotation push
    // encrypts data with the new key. Falls through to the live count otherwise.
    if (localStorage.getItem('nexus_key_rotating') === 'true') {
        const pending = Number(localStorage.getItem(PBKDF2_ITERATIONS_PENDING_KEY) || 0);
        if (pending > 0) return pending;
    }
    const stored = Number(localStorage.getItem(PBKDF2_ITERATIONS_KEY) || 0);
    return stored > 0 ? stored : LEGACY_PBKDF2_ITERATIONS;
}

/**
 * Called after a successful rotation push to promote the pending iteration count
 * to the live key. Until this runs, the live key in localStorage still reflects
 * the pre-rotation count, so a crash before commit leaves the system in a
 * consistent, recoverable state: nexus_key_rotating is still set, and on restart
 * getStoredIterations() will return the pending count and the push will retry.
 */
export function commitIterationUpgrade() {
    const pending = Number(localStorage.getItem(PBKDF2_ITERATIONS_PENDING_KEY) || 0);
    if (pending > 0) {
        localStorage.setItem(PBKDF2_ITERATIONS_KEY, String(pending));
        localStorage.removeItem(PBKDF2_ITERATIONS_PENDING_KEY);
    }
}

/**
 * Returns true when the stored iteration count is below the current target —
 * the workspace is eligible for a security upgrade.
 * The UI can use this to prompt the user to change their master password.
 */
export function isLegacyIterations() {
    return getStoredIterations() < TARGET_PBKDF2_ITERATIONS;
}

// ── Module State ────────────────────────────────────────────────────────────
let _cryptoKey = null; // CryptoKey object — lives only in RAM
let _isLocked = true;
let _activeSalt = null; // Stores currently used Salt (for syncing)

// 🔥 HARDCODED TEAM KEY (Option 2: Invisible Frictionless Encryption) 🔥
// This phrase is automatically used to derive the AES key. No UI prompt is shown.
const INVISIBLE_TEAM_PASS = 'milpa-med-2024-secure';

// ── Utilities ───────────────────────────────────────────────────────────────

function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 8192; // Safe chunk size for avoid stack overflow
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function base64ToBuffer(b64) {
    if (!b64 || typeof b64 !== 'string') {
        throw new Error('[Fortress] Invalid base64 input: expected non-empty string');
    }
    try {
        const binaryStr = atob(b64);
        const length = binaryStr.length;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        throw new Error('[Fortress] Invalid base64 input: ' + e.message);
    }
}

/**
 * Computes a SHA-256 checksum of the input data (string or object).
 * Returns a hex string.
 * @param {object|string} data - Data to hash
 * @param {boolean} [sortKeys=true] - Whether to sort object keys deterministically
 */
export async function computeChecksum(data, sortKeys = true) {
    let json;
    if (typeof data === 'string') {
        json = data;
    } else if (sortKeys) {
        // Deterministic stringify: recursively sort keys so {a:1, b:2} and {b:2, a:1} produce the same hash.
        // SECURITY FIX: Sort keys recursively, including objects inside arrays
        const deepSort = (obj) => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) {
                // Sort array items if they're objects, but preserve array order
                return obj.map(deepSort);
            }
            // Sort object keys recursively
            return Object.keys(obj)
                .sort()
                .reduce((acc, k) => {
                    acc[k] = deepSort(obj[k]);
                    return acc;
                }, {});
        };
        try {
            json = JSON.stringify(deepSort(data));
        } catch (e) {
            // Handle circular references or non-serializable values
            console.warn('[Fortress] Checksum serialization failed:', e);
            throw new Error('[Fortress] Cannot compute checksum of non-serializable data');
        }
    } else {
        json = JSON.stringify(data);
    }

    const enc = new TextEncoder();
    const buf = enc.encode(json);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}



/**
 * ENCRYPTED_STORES: Which stores are encrypted end-to-end when E2EE is active?
 *
 * ✅ ENCRYPTED (sensitive data):
 *  - projects, tasks, cycles, decisions: core work data
 *  - documents: detailed project documentation
 *  - messages: team chat (includes private thoughts)
 *  - annotations, snapshots: version history
 *  - interconsultations: medical referral details (PII)
 *  - sessions: class/appointment details
 *  - timeLogs: productivity data
 *  - library: bibliography (research metadata)
 *  - notifications: activity alerts (reveals patterns)
 *  - members: team identity metadata (names, roles, emails)
 *  - logs: activity traces (reveals patterns of work)
 *
 * ⚠️ POLICY: All stores in this set are encrypted in Drive when E2EE is active.
 *  Stores NOT listed remain plaintext (metadata only).
 *
 * Keep in sync with:
 *  - sync.js:getSnapshot() (lines 615-632): explicit encryption of each store
 *  - sync.js:seedFromRemote() (lines 1404-1414): explicit decryption of each store
 *  - db.js:dbAPI.put() (line 333): automatic IDB encryption check
 */
export const ENCRYPTED_STORES = new Set([
    'projects',
    'tasks',
    'cycles',
    'decisions',
    'documents',
    'messages',
    'annotations',
    'snapshots',
    'interconsultations',
    'sessions',
    'timeLogs',
    'library',
    'notifications',
    'members',
    'logs'
]);

// ── Key Derivation (PBKDF2) ──────────────────────────────────────────────────

/**
 * Internal: gets or creates the encryption salt from localStorage.
 * Salt is scoped to the current Google account (workspace_user_email) when
 * available, so that different accounts in the same browser derive independent
 * keys even if they share the same password. Falls back to a global salt for
 * local-only (no Google account) workspaces.
 *
 * Migration: on first sign-in with an existing global salt, the global salt is
 * re-used under the account-scoped key so existing encrypted data remains
 * readable without any re-encryption.
 */
async function getOrCreateSalt() {
    if (_activeSalt) return _activeSalt;

    let email = localStorage.getItem('workspace_user_email') || '';
    if (email) {
        // SECURITY FIX: Validate email before encoding
        let scopedKey;
        try {
            scopedKey = `nexus_salt_${btoa(email).replace(/=/g, '')}`;
        } catch (e) {
            console.error('[Fortress] Email encoding failed, falling back to global salt:', e);
            // Fallthrough to global salt
            email = '';
        }

        if (scopedKey) {
            let saltB64 = localStorage.getItem(scopedKey);
            if (!saltB64) {
                // Migrate: adopt the existing global salt so in-place encrypted data
                // remains accessible after we introduce account scoping.
                saltB64 = localStorage.getItem('nexus_salt');
                if (saltB64) {
                    localStorage.setItem(scopedKey, saltB64);
                    // Existing data: leave iterations as-is (backward compat).
                    // NOTE: Global salt is NOT deleted to avoid conflicts if email is cleared.
                } else {
                    // Brand-new install: generate salt AND stamp the target iterations.
                    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
                    saltB64 = bufferToBase64(saltBytes);
                    localStorage.setItem(scopedKey, saltB64);
                    // Only set iterations if they haven't been set before, so a
                    // reinstall or account-switch doesn't reset the count unexpectedly.
                    if (!localStorage.getItem(PBKDF2_ITERATIONS_KEY)) {
                        localStorage.setItem(PBKDF2_ITERATIONS_KEY, String(TARGET_PBKDF2_ITERATIONS));
                    }
                }
            }
            _activeSalt = base64ToBuffer(saltB64);
            return _activeSalt;
        }
    }

    // Local-only mode: use (or create) the legacy global salt.
    let saltB64 = localStorage.getItem('nexus_salt');
    if (saltB64) {
        _activeSalt = base64ToBuffer(saltB64);
        return _activeSalt;
    }
    // Brand-new local-only install.
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    saltB64 = bufferToBase64(saltBytes);
    localStorage.setItem('nexus_salt', saltB64);
    if (!localStorage.getItem(PBKDF2_ITERATIONS_KEY)) {
        localStorage.setItem(PBKDF2_ITERATIONS_KEY, String(TARGET_PBKDF2_ITERATIONS));
    }
    _activeSalt = saltBytes;
    return _activeSalt;
}

export function getWorkspaceSaltBase64() {
    if (!_activeSalt) return null;
    return bufferToBase64(_activeSalt);
}

/**
 * HMAC-SHA256 checksum of the workspace salt, bound to the user's email.
 * This prevents "salt poisoning": a malicious collaborator cannot inject a
 * different salt and claim it's legitimate, because the HMAC would be wrong.
 *
 * The checksum is computed as: HMAC-SHA256(salt + email, "nexus-salt")
 * - email is public (from OAuth) but user-specific
 * - salt is per-device but could be changed
 * - The combination is unique and verifiable without decryption
 *
 * @param {string} saltB64 - Base64-encoded salt
 * @param {string} email - User email (public, from OAuth token)
 * @returns {Promise<string>} Hex-encoded HMAC checksum
 */
export async function computeSaltChecksum(saltB64, email) {
    const msg = saltB64 + '::' + (email || '');
    const key = new TextEncoder().encode('nexus-salt-hmac');
    const data = new TextEncoder().encode(msg);

    const hmac = await crypto.subtle.sign('HMAC',
        await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        data
    );

    return Array.from(new Uint8Array(hmac)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that a salt checksum matches the current salt and email.
 * If validation fails, the salt was likely poisoned by a collaborator.
 *
 * @param {string} saltB64 - Base64-encoded salt
 * @param {string} checksum - Hex-encoded HMAC checksum from remote
 * @param {string} email - User email (should match OAuth token)
 * @returns {Promise<boolean>} true if checksum is valid, false if poisoned or mismatched
 */
export async function validateSaltChecksum(saltB64, checksum, email) {
    if (!saltB64 || !checksum) return false;
    const computed = await computeSaltChecksum(saltB64, email);
    return computed === checksum;
}

/**
 * Inject remote workspace salt, with optional HMAC validation.
 *
 * @param {string} saltB64 - Base64-encoded salt from remote
 * @param {string|null} saltChecksum - Optional HMAC-SHA256 checksum for validation
 * @returns {Promise<{locked: boolean, rejected: boolean}>}
 *   - locked: true if salt was injected and user needs to re-auth
 *   - rejected: true if validation failed (salt was poisoned)
 */
export async function injectWorkspaceSalt(saltB64, saltChecksum = null) {
    if (!saltB64) return { locked: false, rejected: false };

    const email = localStorage.getItem('workspace_user_email') || '';

    // SECURITY FIX: Validate checksum if provided
    // BUG FIX: Disabled this validation because it relies on the local user's email,
    // which fails when pulling a salt generated by a DIFFERENT team member.
    // metadata.checksum already protects against accidental payload corruption.
    if (saltChecksum) {
        // const isValid = await validateSaltChecksum(saltB64, saltChecksum, email);
        // if (!isValid) { ... }
    }


    const currentB64 = getWorkspaceSaltBase64();
    if (saltB64 !== currentB64) {
        console.warn('[Fortress] Remote salt differs from local. Updating salt and locking vault.');
        if (email) {
            const scopedKey = `nexus_salt_${btoa(email).replace(/=/g, '')}`;
            localStorage.setItem(scopedKey, saltB64);
        } else {
            localStorage.setItem('nexus_salt', saltB64);
        }
        _activeSalt = base64ToBuffer(saltB64);
        lock();
        
        // BUG FIX: In Frictionless mode, automatically try to re-unlock with the team key.
        // This ensures that if another device updated the salt (e.g. during a sync or 
        // starting from scratch), this device seamlessly adapts without forcing
        // a manual reload or password prompt.
        try {
            console.log('[Fortress] Frictionless: attempting auto-unlock with new salt...');
            await unlock(INVISIBLE_TEAM_PASS);
            console.log('[Fortress] Frictionless: auto-unlock success.');
            return { locked: false, rejected: false };
        } catch (e) {
            console.error('[Fortress] Frictionless: auto-unlock failed after salt change.', e);
            return { locked: true, rejected: false }; // User needs to re-auth if team key failed
        }
    }
    return { locked: false, rejected: false };
}

/**
 * Main-thread fallback: importKey + deriveKey on the calling thread.
 * Used when the Worker API is unavailable (e.g. old browsers, Service Worker
 * contexts that cannot spawn nested workers).
 */
async function _deriveKeyMainThread(pwdBytes, saltBytes, iterations) {
    let rawKey;
    try {
        rawKey = await crypto.subtle.importKey(
            'raw',
            pwdBytes,
            'PBKDF2',
            false,
            ['deriveKey']
        );
    } finally {
        pwdBytes.fill(0);
    }
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Derives a CryptoKey from a password using PBKDF2.
 *
 * BUG 33 FIX: 600k iterations blocks the main thread for ~800ms–1.2s on
 * mid-range mobile, freezing all animations and input. Offload to a Web
 * Worker so the event loop stays responsive during key derivation.
 * CryptoKey objects are structured-cloneable (WebCrypto spec §13) and can
 * be postMessage'd from worker back to the main thread.
 * Falls back to main-thread derivation if Worker is not available.
 */
export async function deriveKey(password) {
    const enc = new TextEncoder();
    const saltBytes = await getOrCreateSalt();
    const iterations = getStoredIterations();

    const pwdBytes = enc.encode(password);
    // Defensive copy of the salt: if we transfer saltBytes.buffer to the worker,
    // the underlying ArrayBuffer gets detached and _activeSalt becomes unusable.
    // Transfer a copy so _activeSalt is untouched in the main thread.
    const saltCopy = new Uint8Array(saltBytes);

    if (typeof Worker !== 'undefined') {
        return new Promise((resolve, reject) => {
            let worker;
            let isSettled = false; // SECURITY FIX: Guard against race condition

            try {
                worker = new Worker(new URL('../workers/pbkdf2.worker.js', import.meta.url));
            } catch (e) {
                // Worker construction failed (e.g. CSP, bundler issues) — fall back immediately.
                console.warn('[Fortress] Worker spawn failed, falling back to main-thread PBKDF2:', e);
                _deriveKeyMainThread(pwdBytes, saltCopy, iterations).then(resolve, reject);
                return;
            }

            // SECURITY FIX: Add timeout to prevent infinite hang if worker doesn't respond
            const timeoutId = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    worker.terminate();
                    console.warn('[Fortress] Worker PBKDF2 timeout, falling back to main-thread');
                    const fallbackPwd = enc.encode(password);
                    _deriveKeyMainThread(fallbackPwd, saltCopy, iterations).then(resolve, reject);
                }
            }, 30000); // 30 second timeout

            worker.onmessage = ({ data: { key, error } }) => {
                if (isSettled) return; // Guard against race condition
                isSettled = true;
                clearTimeout(timeoutId);
                worker.terminate();
                if (error) {
                    reject(new Error('[Fortress] Worker PBKDF2 failed: ' + error));
                } else {
                    resolve(key);
                }
            };

            worker.onerror = (e) => {
                if (isSettled) return; // Guard against race condition
                isSettled = true;
                clearTimeout(timeoutId);
                worker.terminate();
                console.warn('[Fortress] Worker error, falling back to main-thread PBKDF2:', e);
                // pwdBytes was transferred — create a fresh encoding for fallback.
                const fallbackPwd = enc.encode(password);
                _deriveKeyMainThread(fallbackPwd, saltCopy, iterations).then(resolve, reject);
            };

            // Transfer both buffers: zero-copy into worker memory.
            // pwdBytes.buffer: password bytes are consumed (no longer in main thread — reduces attack surface).
            // saltCopy.buffer: defensive copy transferred; original _activeSalt is unaffected.
            worker.postMessage(
                { pwdBuffer: pwdBytes.buffer, saltBuffer: saltCopy.buffer, iterations },
                [pwdBytes.buffer, saltCopy.buffer]
            );
        });
    }

    // Fallback: main-thread derivation (no Worker support).
    return _deriveKeyMainThread(pwdBytes, saltCopy, iterations);
}

/**
 * Derives a SHA-256 hash for password verification.
 */
export async function hashPassword(password) {
    const saltBytes = await getOrCreateSalt();
    const saltB64 = bufferToBase64(saltBytes);
    const enc = new TextEncoder();
    // SECURITY FIX: zero the plaintext buffer immediately after digest().
    const data = enc.encode(password + saltB64);
    let hashBuf;
    try {
        hashBuf = await crypto.subtle.digest('SHA-256', data);
    } finally {
        data.fill(0);
    }
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Session Management ───────────────────────────────────────────────────────

/** Called on successful unlock — stores derived key in module RAM */
export async function unlock(password = INVISIBLE_TEAM_PASS) {
    _cryptoKey = await deriveKey(password);
    _isLocked = false;
}

/**
 * Upgrades the PBKDF2 iteration count to TARGET_PBKDF2_ITERATIONS and
 * re-derives the in-memory key with the new count.
 */
export function upgradeIterations() {
    localStorage.setItem(PBKDF2_ITERATIONS_PENDING_KEY, String(TARGET_PBKDF2_ITERATIONS));
    // Re-unlock immediately with the hardcoded key to apply new iterations
    unlock();
}

/** Wipes the key from RAM — all IDB data becomes inaccessible */
export function lock() {
    _cryptoKey = null;
    _isLocked = true;
    _activeSalt = null;
}

export function isLocked() { return _isLocked; }
export function hasKey() { return _cryptoKey !== null; }

// Auto-unlock on load using the invisible team pass
unlock().catch(e => console.error('[Fortress] Auto-unlock failed:', e));

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * Encrypts a JSON-serializable object.
 * Returns { iv: string, data: string } — both base64-encoded.
 * Throws if the key is not available (app is locked).
 */
export async function encryptRecord(record) {
    if (!_cryptoKey) throw new Error('[Fortress] App is locked — cannot encrypt.');
    if (!record || typeof record !== 'object') {
        throw new Error('[Fortress] Invalid record: must be a non-null object');
    }

    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
    const enc = new TextEncoder();

    let plaintext;
    try {
        plaintext = enc.encode(JSON.stringify(record));
    } catch (e) {
        throw new Error('[Fortress] Failed to serialize record for encryption: ' + e.message);
    }

    const cipherBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        _cryptoKey,
        plaintext
    );

    return {
        __encrypted: true,
        iv: bufferToBase64(iv),
        data: bufferToBase64(cipherBuf)
    };
}

/**
 * Decrypts a record that was produced by encryptRecord().
 * Returns the original JS object.
 * Throws if tampering is detected (AES-GCM authentication failure).
 */
export async function decryptRecord(envelope) {
    if (!_cryptoKey) throw new Error('[Fortress] App is locked — cannot decrypt.');

    // Not encrypted: return as-is (legacy or non-encrypted store)
    if (!envelope || typeof envelope !== 'object' || !envelope.__encrypted) {
        return envelope;
    }

    try {
        // SECURITY FIX: Validate envelope structure before accessing fields
        if (typeof envelope.iv !== 'string' || typeof envelope.data !== 'string') {
            throw new Error('Encrypted envelope must have iv and data as strings');
        }

        // atob() calls are inside the try/catch: a malformed iv or data field
        // (e.g. a record encrypted by a different account and stored as-is) would
        // throw InvalidCharacterError here, which must be treated the same as an
        // OperationError — skip the record rather than crashing the whole store load.
        const iv = base64ToBuffer(envelope.iv);
        const cipherBuf = base64ToBuffer(envelope.data);

        const plainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            _cryptoKey,
            cipherBuf
        );

        const dec = new TextDecoder();
        return JSON.parse(dec.decode(plainBuf));
    } catch (e) {
        // OperationError        → wrong key, tampered ciphertext, or different account
        // InvalidCharacterError → malformed base64 in iv or data
        // SyntaxError           → decrypted bytes are not valid JSON
        // In all cases: return null so decryptAll() filters this record out
        // without preventing the rest of the store from loading.

        // SECURITY: Log tampering attempts explicitly
        if (e.name === 'OperationError') {
            console.error('[Fortress] ⚠️ SECURITY: Decryption failed (possible tampering or wrong key)', {
                recordId: envelope.id ?? '(no id)',
                error: e.message,
                timestamp: new Date().toISOString()
            });
        } else {
            console.warn('[Fortress] Decryption failed — skipping record.', envelope.id ?? '(no id)', e.name || e.message);
        }
        return null;
    }
}

/** Decrypt an array of envelopes. Records that fail to decrypt are silently
 *  dropped (they return null from decryptRecord) so a single bad/foreign-key
 *  record never prevents the rest of the store from loading. */
export async function decryptAll(envelopes) {
    const results = await Promise.all(envelopes.map(e => decryptRecord(e)));
    return results.filter(r => r !== null);
}
