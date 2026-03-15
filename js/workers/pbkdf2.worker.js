/**
 * pbkdf2.worker.js — Off-thread PBKDF2 key derivation
 *
 * BUG 33 FIX: 600k PBKDF2 iterations takes ~800ms–1.2s on mid-range mobile.
 * Running this on the main thread blocks the entire event loop: animations
 * freeze, the OS may report the page as unresponsive, and any GIF/spinner
 * shown as a loading indicator will also freeze (defeating its purpose).
 *
 * Solution: move the CPU-intensive importKey + deriveKey work here.
 * CryptoKey objects are structured-cloneable per the WebCrypto spec, so the
 * derived key can be postMessage'd back to the main thread and stored in RAM.
 *
 * Protocol:
 *   Main → Worker: { pwdBuffer: ArrayBuffer, saltBuffer: ArrayBuffer, iterations: number }
 *                  Both buffers are TRANSFERRED (zero-copy, detached in main thread).
 *   Worker → Main: { key: CryptoKey }   on success
 *                  { error: string }     on failure
 *
 * The worker terminates after each derivation (one-shot, no reuse).
 */
self.onmessage = async ({ data: { pwdBuffer, saltBuffer, iterations } }) => {
    const pwdBytes  = new Uint8Array(pwdBuffer);
    const saltBytes = new Uint8Array(saltBuffer);
    try {
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
            // Zero the password bytes in worker memory as soon as importKey is done.
            pwdBytes.fill(0);
        }

        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
            rawKey,
            { name: 'AES-GCM', length: 256 },
            false,               // non-extractable — key material never leaves the crypto engine
            ['encrypt', 'decrypt']
        );

        // CryptoKey is structured-cloneable (WebCrypto spec §13) — safe to postMessage.
        self.postMessage({ key });
    } catch (e) {
        self.postMessage({ error: e.message ?? String(e) });
    }
};
