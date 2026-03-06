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
 *  - PBKDF2 with SHA-256, 310,000 iterations (OWASP 2023 recommendation)
 *  - AES-256-GCM: authenticated encryption (detects tampering)
 *  - Random 96-bit IV per operation (GCM spec)
 */

// ── Module State ────────────────────────────────────────────────────────────
let _cryptoKey = null; // CryptoKey object — lives only in RAM
let _isLocked = true;

// Stores that contain sensitive data and should be encrypted
export const ENCRYPTED_STORES = new Set([
    'documents', 'tasks', 'projects', 'interconsultations',
    'messages', 'annotations', 'snapshots', 'decisions'
]);

// ── Key Derivation (PBKDF2) ──────────────────────────────────────────────────

/** Internal: reliably gets or creates the salt from localStorage */
async function getOrCreateSalt() {
    let saltB64 = localStorage.getItem('nexus_salt');
    if (saltB64) {
        return new Uint8Array(atob(saltB64).split('').map(c => c.charCodeAt(0)));
    }
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    saltB64 = btoa(String.fromCharCode(...saltBytes));
    localStorage.setItem('nexus_salt', saltB64);
    return saltBytes;
}

/**
 * Derives a CryptoKey from a password using PBKDF2.
 */
export async function deriveKey(password) {
    const enc = new TextEncoder();
    const saltBytes = await getOrCreateSalt();

    // Import the password as a raw key
    const rawKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    // Derive an AES-256-GCM key
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 310_000,
            hash: 'SHA-256'
        },
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Derives a PBKDF2-hardened verification token for password checking.
 *
 * Uses 150,000 PBKDF2-SHA-256 iterations (half of the encryption key
 * derivation) with a separate "verify" purpose, so that an attacker who
 * obtains the Drive JSON file faces ~150k iterations of work per guess
 * rather than a single SHA-256 round.
 *
 * Output is prefixed with "v2:" to distinguish it from legacy SHA-256 hashes
 * and allow transparent migration in app.js.
 */
export async function hashPassword(password) {
    const saltBytes = await getOrCreateSalt();
    const enc = new TextEncoder();
    // Derive a separate purpose key: append ':verify' to the password so the
    // verifier is cryptographically independent from the AES encryption key.
    const rawKey = await crypto.subtle.importKey(
        'raw', enc.encode(password + ':verify'), 'PBKDF2', false, ['deriveKey']
    );
    const verifyKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 150_000, hash: 'SHA-256' },
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,          // extractable so we can export the raw bytes as the token
        ['encrypt']
    );
    const keyBytes = await crypto.subtle.exportKey('raw', verifyKey);
    return 'v2:' + Array.from(new Uint8Array(keyBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Legacy SHA-256 verifier — used ONLY for one-time migration of stored hashes.
 * Do NOT use this for new password storage.
 * @internal
 */
export async function hashPasswordLegacySHA256(password) {
    const saltBytes = await getOrCreateSalt();
    const saltB64 = btoa(String.fromCharCode(...saltBytes));
    const enc = new TextEncoder();
    const data = enc.encode(password + saltB64);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Session Management ───────────────────────────────────────────────────────

/** Called on successful unlock — stores derived key in module RAM */
export async function unlock(password) {
    _cryptoKey = await deriveKey(password);
    _isLocked = false;
}

/** Wipes the key from RAM — all IDB data becomes inaccessible */
export function lock() {
    _cryptoKey = null;
    _isLocked = true;
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
        iv: btoa(String.fromCharCode(...iv)),
        data: btoa(String.fromCharCode(...new Uint8Array(cipherBuf)))
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

    const iv = new Uint8Array(atob(envelope.iv).split('').map(c => c.charCodeAt(0)));
    const cipherBuf = new Uint8Array(atob(envelope.data).split('').map(c => c.charCodeAt(0)));

    const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        _cryptoKey,
        cipherBuf
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plainBuf));
}

/** Decrypt an array of envelopes */
export async function decryptAll(envelopes) {
    return Promise.all(envelopes.map(e => decryptRecord(e)));
}
