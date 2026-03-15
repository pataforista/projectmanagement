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
    const binaryStr = atob(b64);
    const length = binaryStr.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
}

/**
 * Computes a SHA-256 checksum of the input data (string or object).
 * Returns a hex string.
 */
export async function computeChecksum(data) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    const enc = new TextEncoder();
    const buf = enc.encode(json);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Stores that contain sensitive data and should be encrypted
export const ENCRYPTED_STORES = new Set([
    'documents', 'tasks', 'projects', 'cycles', 'interconsultations',
    'messages', 'annotations', 'snapshots', 'decisions'
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

    const email = localStorage.getItem('workspace_user_email') || '';
    if (email) {
        const scopedKey = `nexus_salt_${btoa(email).replace(/=/g, '')}`;
        let saltB64 = localStorage.getItem(scopedKey);
        if (!saltB64) {
            // Migrate: adopt the existing global salt so in-place encrypted data
            // remains accessible after we introduce account scoping.
            saltB64 = localStorage.getItem('nexus_salt');
            if (saltB64) {
                localStorage.setItem(scopedKey, saltB64);
                // Existing data: leave iterations as-is (backward compat).
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

export function injectWorkspaceSalt(saltB64) {
    if (!saltB64) return false;
    const currentB64 = getWorkspaceSaltBase64();
    if (saltB64 !== currentB64) {
        console.warn('[Fortress] Remote salt differs from local. Updating salt and locking vault.');
        const email = localStorage.getItem('workspace_user_email') || '';
        if (email) {
            const scopedKey = `nexus_salt_${btoa(email).replace(/=/g, '')}`;
            localStorage.setItem(scopedKey, saltB64);
        } else {
            localStorage.setItem('nexus_salt', saltB64);
        }
        _activeSalt = base64ToBuffer(saltB64);
        lock();
        return true; // Indicates the app was locked and needs re-auth
    }
    return false;
}

/**
 * Derives a CryptoKey from a password using PBKDF2.
 */
export async function deriveKey(password) {
    const enc = new TextEncoder();
    const saltBytes = await getOrCreateSalt();

    // SECURITY FIX: Hold a reference to the password bytes so we can zero them
    // immediately after importKey. Without this, the Uint8Array containing the
    // plaintext password stays in heap memory until the GC decides to collect it,
    // making it recoverable from a memory dump.
    // Note: the JS string `password` itself cannot be zeroed (strings are immutable),
    // but zeroing the derived Uint8Array reduces the attack surface.
    const pwdBytes = enc.encode(password);
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

    // Derive an AES-256-GCM key using the iteration count stored for this install.
    // New installs use TARGET_PBKDF2_ITERATIONS (600,000); existing installs fall
    // back to LEGACY_PBKDF2_ITERATIONS (310,000) for backward compatibility.
    const iterations = getStoredIterations();
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations,
            hash: 'SHA-256'
        },
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
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
export async function unlock(password) {
    _cryptoKey = await deriveKey(password);
    _isLocked = false;
}

/**
 * Upgrades the PBKDF2 iteration count to TARGET_PBKDF2_ITERATIONS and
 * re-derives the in-memory key with the new count.
 *
 * Call this after a successful password change (app.js profile flow) when
 * isLegacyIterations() returns true. The existing encrypted data remains
 * readable because the AES-256-GCM key material does NOT change —
 * only future key derivations (next unlock) will use the higher count.
 *
 * After calling this, the user must re-enter their password on next unlock
 * so the key is re-derived with 600k iterations.
 */
export function upgradeIterations() {
    // BUG 26 FIX: Write to the PENDING key, not the live key.
    // The live key is only updated after the first successful rotation push
    // (via commitIterationUpgrade). This way, if the app crashes between
    // upgradeIterations() and the push, localStorage still reflects the old
    // iteration count for any non-rotation unlock attempt, preventing a
    // permanent "wrong password" lockout.
    localStorage.setItem(PBKDF2_ITERATIONS_PENDING_KEY, String(TARGET_PBKDF2_ITERATIONS));
    // Lock so the next unlock re-derives the key with the pending (new) count.
    lock();
}

/** Wipes the key from RAM — all IDB data becomes inaccessible */
export function lock() {
    _cryptoKey = null;
    _isLocked = true;
    // BUG FIX: clear the cached salt so that a subsequent getOrCreateSalt()
    // re-reads from localStorage. Without this, unlocking as a different account
    // (different scoped key) would derive the key with the previous user's salt.
    _activeSalt = null;
}

export function isLocked() { return _isLocked; }
export function hasKey() { return _cryptoKey !== null; }

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

/**
 * Encrypts a JSON-serializable object.
 * Returns { iv: string, data: string } — both base64-encoded.
 * Throws if the key is not available (app is locked).
 */
export async function encryptRecord(record) {
    if (!_cryptoKey) throw new Error('[Fortress] App is locked — cannot encrypt.');

    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
    const enc = new TextEncoder();
    const plaintext = enc.encode(JSON.stringify(record));

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
    if (!envelope?.__encrypted) return envelope; // Already plaintext (legacy or non-encrypted store)

    try {
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
        console.warn('[Fortress] Decryption failed — skipping record.', envelope.id ?? '(no id)', e.name || e.message);
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
