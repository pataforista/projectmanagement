/**
 * storage-manager.js — Dual-Storage Abstraction Layer
 * Opción 2: Session isolation using sessionStorage + localStorage
 *
 * Routes storage operations to appropriate backend:
 * - GLOBAL keys → localStorage (shared across tabs)
 * - SESSION keys → sessionStorage (per-tab)
 * - SENSITIVE keys → never in sessionStorage (security)
 */

export const StorageManager = (() => {
    // Keys that should be stored globally (localStorage) — shared across tabs
    const GLOBAL_KEYS = new Set([
        'gdrive_sync_config',       // Drive configuration (shared)
        'workspace_team_label',     // Team name
        'autolock_enabled',         // Security preference
        'low_feedback_enabled',     // UI preference
        'pwa-install-dismissed',    // PWA state
        'nexus_pbkdf2_iterations',          // PBKDF2 iterations (global)
        'nexus_pbkdf2_iterations_pending',  // PBKDF2 pending iterations (key rotation)
        'nexus_key_rotating',               // Key rotation in-progress flag
        'workspace_lock_hash',              // Password hash
        'workspace_recovery_hash',  // Recovery code hash
        'nexus_salt',               // Encryption salt (CRITICAL)
        'nexus_storage_migrated_v2', // Migration marker
        'nexus_migration_timestamp', // Migration timestamp
        'nexus_account_history',    // Account history (global)
        'nexus_last_verified_sub',  // Last verified Google sub
        'sync_gcal',                // Google Calendar sync pref
        'sync_gtasks',              // Google Tasks sync pref
    ]);

    // Keys that should be stored per-session (sessionStorage) — unique per tab
    const SESSION_KEYS = new Set([
        'workspace_user_email',     // Current user email (per-tab)
        'workspace_user_name',      // Current user name
        'workspace_user_avatar',    // Current user avatar
        'workspace_user_role',      // Current user role
        'workspace_user_member_id', // Current member ID
        'workspace_user_email_hash',// Email hash (per-tab)
        'google_id_token',          // Google ID token (per-tab)
        'gdrive_connected',         // Auth status (per-tab)
        'gdrive_file_id',           // Last accessed file (per-tab)
        'gdrive_folder_id',         // Last accessed folder (per-tab)
        'gdrive_chat_folder_id',    // Chat folder (per-tab)
        'nexus_stored_google_sub',  // Stored Google sub (per-tab)
        'nexus_stored_google_aud',  // Stored Google aud (per-tab)
        'nexus_current_session_id', // Current session ID (per-tab)
        'todoist_token',            // Todoist token (per-tab)
        'ollama_url',               // Ollama URL (per-tab, can differ)
        'ollama_model',             // Ollama model (per-tab)
        'elabftw_url',              // eLabFTW URL (per-tab)
        'elabftw_api_key',          // eLabFTW key (per-tab)
        'zenodo_token',             // Zenodo token (per-tab)
        'zenodo_sandbox',           // Zenodo sandbox flag (per-tab)
        'zotero_user_id',           // Zotero user ID (per-tab)
        'zotero_api_key',           // Zotero API key (per-tab)
    ]);

    // Sensitive keys that should NEVER be in sessionStorage
    const SENSITIVE_KEYS = new Set([
        'workspace_lock_hash',
        'workspace_recovery_hash',
        'nexus_salt',
    ]);

    // Migration state
    let isMigrated = false;

    /**
     * Determine storage target for a key
     */
    function getStorageTarget(key, scope = 'auto') {
        if (scope !== 'auto') {
            return scope;
        }

        if (GLOBAL_KEYS.has(key)) {
            return 'global';
        }
        if (SESSION_KEYS.has(key)) {
            return 'session';
        }

        // Default: assume session (per-tab)
        return 'session';
    }

    /**
     * Check if a key is sensitive (should never be in sessionStorage)
     */
    function isSensitiveKey(key) {
        return SENSITIVE_KEYS.has(key);
    }

    /**
     * Get value from appropriate storage
     */
    function get(key, scope = 'auto') {
        const target = getStorageTarget(key, scope);

        if (target === 'global') {
            return localStorage.getItem(key);
        } else if (target === 'session') {
            return sessionStorage.getItem(key);
        }
        return null;
    }

    /**
     * Set value to appropriate storage
     */
    function set(key, value, scope = 'auto') {
        const target = getStorageTarget(key, scope);

        // Validate: sensitive keys should never be in session
        if (isSensitiveKey(key) && target === 'session') {
            console.error(`[StorageManager] SECURITY: Attempted to store sensitive key "${key}" in sessionStorage!`);
            return;
        }

        if (target === 'global') {
            localStorage.setItem(key, value);
        } else if (target === 'session') {
            sessionStorage.setItem(key, value);
        }
    }

    /**
     * Remove value from appropriate storage
     */
    function remove(key, scope = 'auto') {
        const target = getStorageTarget(key, scope);

        if (target === 'global') {
            localStorage.removeItem(key);
        } else if (target === 'session') {
            sessionStorage.removeItem(key);
        }
    }

    /**
     * Check if key exists in appropriate storage
     */
    function has(key, scope = 'auto') {
        return get(key, scope) !== null;
    }

    /**
     * Migrate session keys from localStorage to sessionStorage
     * Called on first load of new version to transition data
     */
    function migrateSessionKeys() {
        if (isMigrated || localStorage.getItem('nexus_storage_migrated_v2') === 'true') {
            isMigrated = true;
            return;
        }

        console.log('[StorageManager] Migrating session keys to sessionStorage...');

        // Copy all SESSION_KEYS from localStorage to sessionStorage
        for (const key of SESSION_KEYS) {
            const value = localStorage.getItem(key);
            if (value !== null) {
                sessionStorage.setItem(key, value);
                // Don't delete yet — keep for fallback
            }
        }

        // Mark as migrated
        localStorage.setItem('nexus_storage_migrated_v2', 'true');
        localStorage.setItem('nexus_migration_timestamp', String(Date.now()));

        console.log('[StorageManager] Migration complete');
        isMigrated = true;
    }

    /**
     * Clean up old localStorage session keys after migration period
     * Called on subsequent loads (e.g., after 2 weeks)
     */
    function cleanupOldStorage() {
        const migrationTime = Number(localStorage.getItem('nexus_migration_timestamp') || 0);
        if (migrationTime === 0) return; // Not migrated yet

        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

        if (migrationTime < twoWeeksAgo) {
            console.log('[StorageManager] Cleaning up old localStorage session keys...');

            // Remove old session keys from localStorage
            for (const key of SESSION_KEYS) {
                localStorage.removeItem(key);
            }

            localStorage.removeItem('nexus_migration_timestamp');
            console.log('[StorageManager] Cleanup complete');
        }
    }

    /**
     * Validate security boundaries
     * Sensitive keys should NEVER be in sessionStorage
     */
    function validateSecurityBoundaries() {
        let violations = false;

        for (const key of SENSITIVE_KEYS) {
            if (sessionStorage.getItem(key) !== null) {
                console.error(`[StorageManager] SECURITY VIOLATION: Sensitive key "${key}" found in sessionStorage!`);
                sessionStorage.removeItem(key);
                violations = true;
            }
        }

        if (violations) {
            console.warn('[StorageManager] Security violations detected and corrected');
        }

        return !violations;
    }

    /**
     * Clear all session data (for logout)
     * WARNING: Only call this when explicitly logging out — not on account switch!
     */
    function clearSessionData() {
        console.log('[StorageManager] Clearing session data...');

        for (const key of SESSION_KEYS) {
            sessionStorage.removeItem(key);
            // Also clear from localStorage if it exists (for backward compat)
            localStorage.removeItem(key);
        }

        // Preserve: GLOBAL_KEYS (config, settings, etc.)
    }

    /**
     * Validate that email (PRIMARY KEY) is set when other session keys exist
     */
    function validateEmailAsKey() {
        const email = get('workspace_user_email', 'session');
        if (!email) {
            const token = get('google_id_token', 'session');
            if (token) {
                console.error('[StorageManager] CRITICAL: Session has token but no email (primary key)!');
                return false;
            }
        }
        return true;
    }

    /**
     * Clear all data (for factory reset)
     */
    function clearAll() {
        console.warn('[StorageManager] Clearing ALL storage data');

        for (const key of SESSION_KEYS) {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        }

        // Note: Do NOT clear GLOBAL_KEYS here — that's intentional
        // (user settings, configurations should persist)
    }

    /**
     * Get all keys currently in use
     */
    function getAllKeys() {
        const keys = new Set();

        // From localStorage
        for (let i = 0; i < localStorage.length; i++) {
            keys.add(localStorage.key(i));
        }

        // From sessionStorage
        for (let i = 0; i < sessionStorage.length; i++) {
            keys.add(sessionStorage.key(i));
        }

        return Array.from(keys);
    }

    /**
     * Get storage stats (for debugging)
     */
    function getStats() {
        let localStorageSize = 0;
        let sessionStorageSize = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            localStorageSize += key.length + (localStorage.getItem(key) || '').length;
        }

        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            sessionStorageSize += key.length + (sessionStorage.getItem(key) || '').length;
        }

        return {
            localStorage: {
                count: localStorage.length,
                sizeBytes: localStorageSize,
                sizeMB: (localStorageSize / (1024 * 1024)).toFixed(2),
            },
            sessionStorage: {
                count: sessionStorage.length,
                sizeBytes: sessionStorageSize,
                sizeMB: (sessionStorageSize / (1024 * 1024)).toFixed(2),
            },
            total: {
                count: localStorage.length + sessionStorage.length,
                sizeBytes: localStorageSize + sessionStorageSize,
                sizeMB: ((localStorageSize + sessionStorageSize) / (1024 * 1024)).toFixed(2),
            },
        };
    }

    /**
     * PUBLIC API
     */
    return {
        get,
        set,
        remove,
        has,
        migrateSessionKeys,
        cleanupOldStorage,
        validateSecurityBoundaries,
        validateEmailAsKey,
        clearSessionData,
        clearAll,
        getAllKeys,
        getStats,
        getStorageTarget,
        isSensitiveKey,

        // Expose key lists for debugging
        GLOBAL_KEYS: Object.freeze(new Set(GLOBAL_KEYS)),
        SESSION_KEYS: Object.freeze(new Set(SESSION_KEYS)),
        SENSITIVE_KEYS: Object.freeze(new Set(SENSITIVE_KEYS)),
    };
})();

export default StorageManager;
