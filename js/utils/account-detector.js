/**
 * account-detector.js — Multi-Account Google Login Support
 * Opción 1: Auto-detection of account changes and session switches
 *
 * Monitors Google session for account changes and emits events
 * when the user switches accounts.
 *
 * EMAIL IS PRIMARY KEY — all account coordination uses email
 * - Detects account switches via Google 'sub' (secondary)
 * - Tracks email changes within same account (alias)
 * - Maintains account history indexed by email
 */

import { StorageManager } from './storage-manager.js';

export const AccountChangeDetector = (() => {
    // Configuration
    const ACCOUNT_HISTORY_KEY = 'nexus_account_history';
    const STORED_SUB_KEY = 'nexus_stored_google_sub';
    const STORED_AUD_KEY = 'nexus_stored_google_aud';
    const LAST_VERIFIED_KEY = 'nexus_last_verified_account';
    const VERIFICATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

    // State
    let verificationTimer = null;
    let lastVerifiedAt = 0;
    let changeCallback = null;
    let accountHistoryCache = [];

    /**
     * Decode JWT without verification (we trust Google's signature from their domain)
     */
    function decodeIdToken(token) {
        if (!token || typeof token !== 'string' || token === 'null' || token === 'undefined') return null;
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const decoded = JSON.parse(
                atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
            );
            return decoded;
        } catch (e) {
            console.warn('[AccountChangeDetector] Failed to decode token:', e);
            return null;
        }
    }

    /**
     * Check if ID token has expired
     */
    function isExpiredIdToken(decoded) {
        if (!decoded || !decoded.exp) return true;
        return Date.now() / 1000 > decoded.exp;
    }

    /**
     * Load account history from localStorage
     */
    function loadAccountHistory() {
        try {
            const raw = localStorage.getItem(ACCOUNT_HISTORY_KEY);
            accountHistoryCache = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[AccountChangeDetector] Failed to load history:', e);
            accountHistoryCache = [];
        }
        return accountHistoryCache;
    }

    /**
     * Save account history to localStorage
     */
    function saveAccountHistory() {
        try {
            localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(accountHistoryCache));
        } catch (e) {
            console.warn('[AccountChangeDetector] Failed to save history:', e);
        }
    }

    /**
     * Add account to history (deduped by EMAIL as PRIMARY KEY)
     */
    function recordAccountInHistory(email, subject, issuedAt) {
        loadAccountHistory();

        if (!email) {
            console.warn('[AccountChangeDetector] Cannot record account history: email is required');
            return;
        }

        const existing = accountHistoryCache.find(a => a.email === email);
        if (existing) {
            // Update existing entry — email is PRIMARY KEY
            existing.lastSeen = Date.now();
            existing.count = (existing.count || 1) + 1;
            // If subject changed (alias or account update), update it
            if (subject && subject !== existing.subject) {
                existing.previousSubjects = existing.previousSubjects || [];
                existing.previousSubjects.push(existing.subject);
                existing.subject = subject;
            }
        } else {
            accountHistoryCache.push({
                email,      // PRIMARY KEY for account coordination
                subject,
                createdAt: Date.now(),
                lastSeen: Date.now(),
                count: 1,
            });
        }

        // Keep only last 20 accounts (by lastSeen)
        if (accountHistoryCache.length > 20) {
            accountHistoryCache = accountHistoryCache.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 20);
        }

        saveAccountHistory();
    }

    /**
     * Compare current Google session with stored session
     * Returns: {changed: bool, reason: 'account_switched'|'token_expired'|'sub_mismatch'|null}
     */
    function compareWithStored(idToken) {
        const decoded = decodeIdToken(idToken);
        if (!decoded) {
            return { changed: true, reason: 'invalid_token', oldEmail: null, newEmail: null };
        }

        // Check 1: Token expired
        if (isExpiredIdToken(decoded)) {
            return { changed: true, reason: 'token_expired', oldEmail: null, newEmail: decoded.email };
        }

        // Check 2: Subject ID (sub) changed — different account (PRIMARY KEY)
        const storedSub = StorageManager.get(STORED_SUB_KEY, 'session');
        const storedEmail = StorageManager.get('workspace_user_email', 'session');

        if (storedSub && decoded.sub !== storedSub) {
            return {
                changed: true,
                reason: 'account_switched',
                oldEmail: storedEmail || 'unknown',
                newEmail: decoded.email,
                oldSub: storedSub,
                newSub: decoded.sub,
            };
        }

        // Check 3: Audience (aud) changed — possible security issue
        const storedAud = StorageManager.get(STORED_AUD_KEY, 'session');
        if (storedAud && decoded.aud !== storedAud) {
            return {
                changed: true,
                reason: 'aud_mismatch',
                oldEmail: storedEmail,
                newEmail: decoded.email,
                security: 'CRITICAL',
            };
        }

        // Check 4: Email changed within same account (sub matches, email differs)
        // This is valid — email can be alias or recovery address
        if (storedEmail && storedSub && decoded.sub === storedSub && decoded.email !== storedEmail) {
            // Email is PRIMARY KEY for account coordination — sync to SessionManager
            return {
                changed: true,
                reason: 'email_updated',
                oldEmail: storedEmail,
                newEmail: decoded.email,
                sameSub: true, // Same account (sub matches), just email changed
            };
        }

        return { changed: false, reason: null };
    }

    /**
     * Store current Google session identifiers
     */
    function storeCurrentSession(idToken) {
        const decoded = decodeIdToken(idToken);
        if (!decoded) return false;

        StorageManager.set(STORED_SUB_KEY, decoded.sub, 'session');
        StorageManager.set(STORED_AUD_KEY, decoded.aud, 'session');
        StorageManager.set(LAST_VERIFIED_KEY, String(Date.now()), 'session');

        recordAccountInHistory(decoded.email, decoded.sub, decoded.iat);

        return true;
    }

    /**
     * Verify current session (called periodically)
     */
    async function verifyCurrent() {
        const now = Date.now();

        // Rate limit: don't check more than every 1 minute
        if (now - lastVerifiedAt < 60 * 1000) {
            return;
        }

        lastVerifiedAt = now;

        const storedIdToken = StorageManager.get('google_id_token', 'session');
        if (!storedIdToken) return;

        const comparison = compareWithStored(storedIdToken);

        if (comparison.changed) {
            if (changeCallback) {
                // Normalize event type based on reason
                let eventType = 'token_expired';
                if (comparison.reason === 'account_switched') {
                    eventType = 'account_switched';
                } else if (comparison.reason === 'email_updated') {
                    eventType = 'email_updated';
                }

                const event = {
                    type: eventType,
                    reason: comparison.reason,
                    oldEmail: comparison.oldEmail,
                    newEmail: comparison.newEmail,
                    sameSub: comparison.sameSub || false, // EMAIL CHANGED but same account
                    timestamp: now,
                };

                // Check security issues
                if (comparison.reason === 'aud_mismatch') {
                    console.error('[AccountChangeDetector] SECURITY: Token audience mismatch!');
                    event.security = 'CRITICAL';
                }

                // Log email updates (PRIMARY KEY changes)
                if (comparison.reason === 'email_updated') {
                    console.log(`[AccountChangeDetector] Email updated for account ${comparison.oldSub}: ${comparison.oldEmail} -> ${comparison.newEmail}`);
                }

                changeCallback(event);
            }
        }
    }

    /**
     * Start periodic verification of Google session
     */
    function startVerification() {
        if (verificationTimer) clearInterval(verificationTimer);

        // Initial check
        verifyCurrent();

        // Periodic checks
        verificationTimer = setInterval(() => {
            verifyCurrent();
        }, VERIFICATION_INTERVAL);
    }

    /**
     * Stop verification
     */
    function stopVerification() {
        if (verificationTimer) {
            clearInterval(verificationTimer);
            verificationTimer = null;
        }
    }

    /**
     * PUBLIC API
     */
    return {
        /**
         * Initialize detector with callback for account changes
         * callback(event: {type, reason, oldEmail, newEmail, timestamp})
         */
        init(callback) {
            changeCallback = callback;
            storeCurrentSession(StorageManager.get('google_id_token', 'session'));
            startVerification();
            console.log('[AccountChangeDetector] Initialized');
        },

        /**
         * Stop monitoring
         */
        destroy() {
            stopVerification();
            changeCallback = null;
            console.log('[AccountChangeDetector] Destroyed');
        },

        /**
         * Get current account information from stored token
         */
        getCurrentAccount() {
            const token = StorageManager.get('google_id_token', 'session');
            if (!token) return null;

            const decoded = decodeIdToken(token);
            return decoded ? {
                email: decoded.email,
                name: decoded.name,
                sub: decoded.sub,
                aud: decoded.aud,
                exp: decoded.exp,
                iat: decoded.iat,
            } : null;
        },

        /**
         * Compare current Google session with stored one
         */
        compareWithStored(idToken) {
            return compareWithStored(idToken);
        },

        /**
         * Record account switch in history
         */
        recordAccountSwitch(email, idToken) {
            const decoded = decodeIdToken(idToken);
            if (decoded) {
                recordAccountInHistory(email, decoded.sub, decoded.iat);
                storeCurrentSession(idToken);
            }
        },

        /**
         * Get account history (list of all accounts seen)
         */
        getAccountHistory() {
            loadAccountHistory();
            return accountHistoryCache.slice().sort((a, b) => b.lastSeen - a.lastSeen);
        },

        /**
         * Clear account history
         */
        clearHistory() {
            accountHistoryCache = [];
            localStorage.removeItem(ACCOUNT_HISTORY_KEY);
        },

        /**
         * Get last verification timestamp
         */
        getLastVerified() {
            return lastVerifiedAt;
        },

        /**
         * Force immediate verification
         */
        forceVerify() {
            return verifyCurrent();
        },

        /**
         * Validate token signature and structure
         * (Note: Full JWT signature validation requires Google's public keys)
         */
        validateTokenStructure(token) {
            const decoded = decodeIdToken(token);
            if (!decoded) return false;

            // Check required fields
            const required = ['sub', 'email', 'aud', 'exp', 'iat'];
            for (const field of required) {
                if (!decoded[field]) return false;
            }

            // Check expiration
            if (isExpiredIdToken(decoded)) return false;

            return true;
        },
    };
})();

export default AccountChangeDetector;
