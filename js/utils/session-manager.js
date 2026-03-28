/**
 * session-manager.js — Multi-Session Management
 * Opción 3: Fast logout/login and session switching (like Gmail)
 *
 * Manages multiple user sessions and allows quick switching without page reload.
 * Sessions are stored in IndexedDB and can be switched atomically.
 */

import { StorageManager } from './storage-manager.js';
import { BackendClient } from '../api/backend-client.js';

export const SessionManager = (() => {
    const SESSIONS_STORE = 'sessions';
    const CURRENT_SESSION_KEY = 'nexus_current_session_id';
    const SESSION_ID_PREFIX = 'session_';

    let db = null;
    let currentSessionId = null;

    /**
     * Initialize SessionManager with IndexedDB connection
     */
    async function init(indexedDB) {
        db = indexedDB;

        // Restore current session ID from sessionStorage (per-tab isolation)
        currentSessionId = StorageManager.get(CURRENT_SESSION_KEY, 'session');

        console.log('[SessionManager] Initialized');
        return true;
    }

    /**
     * Generate unique session ID
     */
    function generateSessionId(email) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${SESSION_ID_PREFIX}${email.split('@')[0]}_${timestamp}_${random}`;
    }

    /**
     * Create a new session for a user
     * EMAIL IS PRIMARY KEY — use for all account coordination
     */
    async function createSession(email, idToken, metadata = {}) {
        if (!db || !db.objectStoreNames.contains(SESSIONS_STORE)) {
            console.warn('[SessionManager] IndexedDB not available, session creation deferred');
            return null;
        }

        if (!email) {
            console.error('[SessionManager] CRITICAL: Cannot create session without email');
            return null;
        }

        const sessionId = generateSessionId(email);

        const session = {
            id: sessionId,
            email,  // PRIMARY KEY for account coordination
            createdAt: Date.now(),
            lastActive: Date.now(),
            idToken,              // Store encrypted in IDB
            metadata: {
                name: metadata.name || email,
                avatar: metadata.avatar || email.charAt(0).toUpperCase(),
                memberId: metadata.memberId || '',
                role: metadata.role || 'member',
                sub: metadata.sub || '',  // Google account identifier (for sync)
                aud: metadata.aud || '',  // Google audience (for sync)
            },
            status: 'active',
        };

        try {
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(SESSIONS_STORE);
            await store.add(session);

            console.log(`[SessionManager] Session created: ${sessionId} (email: ${email})`);
            return sessionId;
        } catch (e) {
            console.error('[SessionManager] Failed to create session:', e);
            return null;
        }
    }

    /**
     * List all active sessions
     */
    async function listSessions() {
        if (!db || !db.objectStoreNames.contains(SESSIONS_STORE)) {
            console.warn('[SessionManager] IndexedDB not available or missing sessions store');
            return [];
        }

        try {
            const tx = db.transaction(SESSIONS_STORE, 'readonly');
            const store = tx.objectStore(SESSIONS_STORE);
            const sessions = await store.getAll();

            return sessions
                .filter(s => s.status === 'active')
                .sort((a, b) => b.lastActive - a.lastActive);
        } catch (e) {
            console.error('[SessionManager] Failed to list sessions:', e);
            return [];
        }
    }

    /**
     * Get a specific session by ID
     */
    async function getSession(sessionId) {
        if (!db || !db.objectStoreNames.contains(SESSIONS_STORE)) return null;

        try {
            const tx = db.transaction(SESSIONS_STORE, 'readonly');
            const store = tx.objectStore(SESSIONS_STORE);
            return await store.get(sessionId);
        } catch (e) {
            console.error('[SessionManager] Failed to get session:', e);
            return null;
        }
    }

    /**
     * Switch to a different session
     * This is atomic: saves current state and loads new state
     * EMAIL IS PRIMARY KEY — all account coordination uses email
     */
    async function switchSession(sessionId) {
        const targetSession = await getSession(sessionId);
        if (!targetSession || targetSession.status !== 'active') {
            console.warn(`[SessionManager] Session ${sessionId} not found or inactive`);
            return false;
        }

        // Validate email is present (PRIMARY KEY)
        if (!targetSession.email) {
            console.error('[SessionManager] CRITICAL: Session missing email (primary key)');
            return false;
        }

        // Save current session's last activity
        const currentEmail = StorageManager.get('workspace_user_email', 'session');
        if (currentEmail && currentSessionId) {
            try {
                const tx = db.transaction(SESSIONS_STORE, 'readwrite');
                const store = tx.objectStore(SESSIONS_STORE);
                const current = await store.get(currentSessionId);

                if (current) {
                    current.lastActive = Date.now();
                    await store.put(current);
                }
            } catch (e) {
                console.warn('[SessionManager] Failed to update current session:', e);
            }
        }

        // Load target session — EMAIL IS PRIMARY KEY
        StorageManager.set('workspace_user_email', targetSession.email, 'session');
        StorageManager.set('google_id_token', targetSession.idToken, 'session');
        StorageManager.set('workspace_user_name', targetSession.metadata.name || targetSession.email, 'session');
        StorageManager.set('workspace_user_avatar', targetSession.metadata.avatar || targetSession.email.charAt(0).toUpperCase(), 'session');
        StorageManager.set('workspace_user_member_id', targetSession.metadata.memberId || '', 'session');
        StorageManager.set('workspace_user_role', targetSession.metadata.role || 'member', 'session');

        // Store account identifiers for sync coordination
        if (targetSession.metadata.sub) {
            StorageManager.set('nexus_stored_google_sub', targetSession.metadata.sub, 'session');
        }
        if (targetSession.metadata.aud) {
            StorageManager.set('nexus_stored_google_aud', targetSession.metadata.aud, 'session');
        }

        // Update current session pointer (per-tab)
        StorageManager.set(CURRENT_SESSION_KEY, sessionId, 'session');
        currentSessionId = sessionId;

        // Update last active timestamp
        try {
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(SESSIONS_STORE);
            targetSession.lastActive = Date.now();
            await store.put(targetSession);
        } catch (e) {
            console.warn('[SessionManager] Failed to update session timestamp:', e);
        }

        console.log(`[SessionManager] Switched to session: ${sessionId} (email: ${targetSession.email})`);

        // Dispatch event for UI to react
        window.dispatchEvent(new CustomEvent('session:switched', {
            detail: { sessionId, email: targetSession.email }
        }));

        // Sync across tabs via BroadcastChannel
        if (typeof BroadcastChannel !== 'undefined') {
            try {
                const channel = new BroadcastChannel('session-sync');
                channel.postMessage({
                    type: 'session:switched',
                    data: { sessionId, email: targetSession.email }
                });
                channel.close();
            } catch (e) {
                console.warn('[SessionManager] Failed to broadcast session switch:', e);
            }
        }

        return true;
    }

    /**
     * End a session (soft delete — mark as inactive)
     */
    async function endSession(sessionId) {
        if (!db || !db.objectStoreNames.contains(SESSIONS_STORE)) return false;

        try {
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(SESSIONS_STORE);
            const session = await store.get(sessionId);

            if (!session) {
                console.warn(`[SessionManager] Session ${sessionId} not found`);
                return false;
            }

            session.status = 'inactive';
            session.endedAt = Date.now();
            await store.put(session);

            console.log(`[SessionManager] Session ended: ${sessionId}`);

            // If this was the current session, switch to another one
            if (currentSessionId === sessionId) {
                const others = await listSessions();
                if (others.length > 0) {
                    await switchSession(others[0].id);
                } else {
                    // No other sessions — logout completely
                    await logout();
                }
            }

            return true;
        } catch (e) {
            console.error('[SessionManager] Failed to end session:', e);
            return false;
        }
    }

    /**
     * Complete logout — clear current session
     */
    async function logout() {
        console.log('[SessionManager] Performing logout');

        // Clear session storage
        StorageManager.clearSessionData();

        // Clear current session pointer
        StorageManager.remove(CURRENT_SESSION_KEY, 'session');
        currentSessionId = null;

        // Preserve:
        // - GLOBAL_KEYS (config, settings, etc.)
        // - workspace_lock_hash (password protection)
        // - nexus_salt (encryption key)

        // Dispatch event
        window.dispatchEvent(new CustomEvent('session:logout'));

        return true;
    }

    /**
     * Fast logout (no page reload, no Google revocation wait)
     */
    async function logoutFast() {
        console.log('[SessionManager] Fast logout initiated');

        // 1. Revoke the backend session BEFORE clearing local tokens so the
        //    Authorization header is still valid when the request is sent.
        //    This is fire-and-forget — we do not block logout on a network failure.
        BackendClient.logout().catch(e => {
            console.warn('[SessionManager] Backend logout notification failed:', e);
        });

        // 2. Clear local session (sessionStorage + in-memory tokens)
        await logout();

        // 3. Attempt Google OAuth2 access token revocation (fire-and-forget).
        //    The Google Drive access token lives on the syncManager, not in storage,
        //    so we ask syncManager to expose it if available.
        //    NOTE: google.accounts.oauth2.revoke() requires the *access token*, NOT
        //    the ID token.  Passing the ID token would silently fail.
        const googleAccessToken = window.syncManager?.getAccessToken?.();
        if (googleAccessToken && window.google?.accounts?.oauth2) {
            try {
                google.accounts.oauth2.revoke(googleAccessToken, (response) => {
                    if (response?.error) {
                        console.warn('[SessionManager] Google revocation failed:', response.error);
                    }
                });
            } catch (e) {
                console.warn('[SessionManager] Could not revoke Google token:', e);
            }
        }

        // 4. Show feedback to user
        if (window.showToast) {
            showToast('Sesión cerrada', 'success');
        }

        // 5. Reload page after brief delay (allow toast to show)
        setTimeout(() => {
            location.reload();
        }, 300);
    }

    /**
     * Get current session
     */
    async function getCurrentSession() {
        if (!currentSessionId) return null;
        return getSession(currentSessionId);
    }

    /**
     * Check if a user (email) has an active session
     */
    async function hasSession(email) {
        const sessions = await listSessions();
        return sessions.some(s => s.email === email);
    }

    /**
     * Find session by email
     */
    async function findSessionByEmail(email) {
        const sessions = await listSessions();
        return sessions.find(s => s.email === email) || null;
    }

    /**
     * Permanently delete a session (hard delete)
     */
    async function deleteSession(sessionId) {
        if (!db || !db.objectStoreNames.contains(SESSIONS_STORE)) return false;

        try {
            const tx = db.transaction(SESSIONS_STORE, 'readwrite');
            const store = tx.objectStore(SESSIONS_STORE);
            await store.delete(sessionId);

            console.log(`[SessionManager] Session deleted: ${sessionId}`);

            // If this was current session, switch or logout
            if (currentSessionId === sessionId) {
                const others = await listSessions();
                if (others.length > 0) {
                    await switchSession(others[0].id);
                } else {
                    await logout();
                }
            }

            return true;
        } catch (e) {
            console.error('[SessionManager] Failed to delete session:', e);
            return false;
        }
    }

    /**
     * Get session statistics
     */
    async function getStats() {
        const sessions = await listSessions();
        return {
            totalActive: sessions.length,
            currentSessionId,
            sessions: sessions.map(s => ({
                id: s.id,
                email: s.email,
                name: s.metadata.name,
                createdAt: s.createdAt,
                lastActive: s.lastActive,
            })),
        };
    }

    /**
     * Synchronize session state across tabs using BroadcastChannel
     */
    async function syncAcrossTabs() {
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('[SessionManager] BroadcastChannel not available for cross-tab sync');
            return;
        }

        const channel = new BroadcastChannel('session-sync');

        channel.onmessage = async (event) => {
            const { type, data } = event.data;

            if (type === 'session:switched') {
                // Another tab switched session — restore our state if needed
                const currentEmail = StorageManager.get('workspace_user_email', 'session');
                if (currentEmail && currentEmail !== data.email && data.sessionId) {
                    // This tab has a different session active
                    console.log(`[SessionManager] Cross-tab session sync: ignoring switch in other tab (different email)`);
                } else if (!currentEmail && data.sessionId) {
                    // This tab is empty — load the session from other tab
                    const session = await getSession(data.sessionId);
                    if (session) {
                        await switchSession(data.sessionId);
                        console.log(`[SessionManager] Cross-tab session sync: restored session from other tab`);
                    }
                }
            }
        };

        return channel;
    }

    /**
     * PUBLIC API
     */
    return {
        init,
        createSession,
        listSessions,
        getSession,
        switchSession,
        endSession,
        logout,
        logoutFast,
        getCurrentSession,
        hasSession,
        findSessionByEmail,
        deleteSession,
        getStats,
        syncAcrossTabs,

        // Helpers
        generateSessionId,

        // Properties
        get currentSessionId() {
            return currentSessionId;
        },
    };
})();

export default SessionManager;
