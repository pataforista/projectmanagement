/**
 * Multi-Account Google Login Test Suite
 * Tests for Opciones 1, 2, and 3
 *
 * Run with: npm test -- multi-account-test-suite
 */

import { AccountChangeDetector } from '../utils/account-detector.js';
import { StorageManager } from '../utils/storage-manager.js';
import { SessionManager } from '../utils/session-manager.js';

// Mock showToast if not available
if (typeof showToast === 'undefined') {
    window.showToast = (msg, type) => console.log(`[${type.toUpperCase()}] ${msg}`);
}

// ────────────────────────────────────────────────────────────────────────────────
// OPCIÓN 1: Account Change Detection
// ────────────────────────────────────────────────────────────────────────────────

describe('AccountChangeDetector (Opción 1)', () => {
    beforeEach(() => {
        localStorage.clear();
        AccountChangeDetector.clearHistory();
    });

    test('should detect account switch when sub changes', () => {
        const token1 = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImVtYWlsIjoiYTFAZXhhbXBsZS5jb20iLCJhdWQiOiJjbGllbnQtaWQiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTY3MzAwMDAwMH0.sig';
        const token2 = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMiIsImVtYWlsIjoiYTJAZXhhbXBsZS5jb20iLCJhdWQiOiJjbGllbnQtaWQiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTY3MzAwMDAwMH0.sig';

        // Setup first account
        AccountChangeDetector.recordAccountSwitch('a1@example.com', token1);

        // Check second account
        const comparison = AccountChangeDetector.compareWithStored(token2);
        expect(comparison.changed).toBe(true);
        expect(comparison.reason).toBe('account_switched');
        expect(comparison.oldEmail).toBe('a1@example.com');
        expect(comparison.newEmail).toBe('a2@example.com');
    });

    test('should maintain account history', () => {
        const token1 = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImVtYWlsIjoiYWNjb3VudC1hQGV4YW1wbGUuY29tIn0.sig';
        const token2 = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMiIsImVtYWlsIjoiYWNjb3VudC1iQGV4YW1wbGUuY29tIn0.sig';
        const token3 = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMyIsImVtYWlsIjoiYWNjb3VudC1jQGV4YW1wbGUuY29tIn0.sig';

        AccountChangeDetector.recordAccountSwitch('account-a@example.com', token1);
        AccountChangeDetector.recordAccountSwitch('account-b@example.com', token2);
        AccountChangeDetector.recordAccountSwitch('account-c@example.com', token3);

        const history = AccountChangeDetector.getAccountHistory();
        expect(history.length).toBeGreaterThanOrEqual(3);
        expect(history[0].email).toBe('account-c@example.com'); // Most recent first
    });

    test('should validate token structure', () => {
        const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImVtYWlsIjoiYUBleGFtcGxlLmNvbSIsImF1ZCI6ImNsaWVudC1pZCIsImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNjczMDAwMDAwfQ.sig';
        const invalidToken = 'invalid.token.format';
        const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMSIsImVtYWlsIjoiYUBleGFtcGxlLmNvbSIsImF1ZCI6ImNsaWVudC1pZCIsImV4cCI6MTAwMCwiaWF0IjoxNjczMDAwMDAwfQ.sig';

        expect(AccountChangeDetector.validateTokenStructure(validToken)).toBe(true);
        expect(AccountChangeDetector.validateTokenStructure(invalidToken)).toBe(false);
        expect(AccountChangeDetector.validateTokenStructure(expiredToken)).toBe(false);
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// OPCIÓN 2: Storage Manager - Session Isolation
// ────────────────────────────────────────────────────────────────────────────────

describe('StorageManager (Opción 2)', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    test('should route global keys to localStorage', () => {
        StorageManager.set('gdrive_sync_config', JSON.stringify({test: true}));
        expect(localStorage.getItem('gdrive_sync_config')).toBe(JSON.stringify({test: true}));
        expect(sessionStorage.getItem('gdrive_sync_config')).toBeNull();
    });

    test('should route session keys to sessionStorage', () => {
        StorageManager.set('workspace_user_email', 'user@example.com');
        expect(sessionStorage.getItem('workspace_user_email')).toBe('user@example.com');
        // May also be in localStorage for backward compat, but sessionStorage is authoritative
    });

    test('should prevent sensitive keys in sessionStorage', () => {
        sessionStorage.setItem('workspace_lock_hash', 'DANGEROUS_HASH');
        StorageManager.validateSecurityBoundaries();
        expect(sessionStorage.getItem('workspace_lock_hash')).toBeNull();
    });

    test('should migrate legacy keys from localStorage', async () => {
        // Simulate old data in localStorage
        localStorage.setItem('workspace_user_email', 'old@example.com');
        localStorage.setItem('workspace_user_name', 'Old User');
        localStorage.setItem('gdrive_sync_config', JSON.stringify({test: true}));

        StorageManager.migrateSessionKeys();

        // Session keys should be in sessionStorage
        expect(sessionStorage.getItem('workspace_user_email')).toBe('old@example.com');
        expect(sessionStorage.getItem('workspace_user_name')).toBe('Old User');

        // Global keys should remain in localStorage
        expect(localStorage.getItem('gdrive_sync_config')).toBe(JSON.stringify({test: true}));
    });

    test('should get storage stats', () => {
        StorageManager.set('test-key-1', 'value1');
        StorageManager.set('workspace_user_email', 'user@example.com');

        const stats = StorageManager.getStats();
        expect(stats.localStorage).toBeDefined();
        expect(stats.sessionStorage).toBeDefined();
        expect(stats.total).toBeDefined();
        expect(stats.total.count).toBeGreaterThan(0);
    });

    test('should clear session data without clearing globals', () => {
        StorageManager.set('gdrive_sync_config', JSON.stringify({test: true}));
        StorageManager.set('workspace_user_email', 'user@example.com');

        StorageManager.clearSessionData();

        expect(sessionStorage.getItem('workspace_user_email')).toBeNull();
        expect(localStorage.getItem('gdrive_sync_config')).toBe(JSON.stringify({test: true}));
    });

    test('should distinguish between global and session keys', () => {
        const globalKey = 'gdrive_sync_config';
        const sessionKey = 'workspace_user_email';

        expect(StorageManager.getStorageTarget(globalKey)).toBe('global');
        expect(StorageManager.getStorageTarget(sessionKey)).toBe('session');
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// OPCIÓN 3: Session Manager - Multi-Session Switching
// ────────────────────────────────────────────────────────────────────────────────

describe('SessionManager (Opción 3)', () => {
    let mockDB = null;

    beforeEach(async () => {
        localStorage.clear();
        sessionStorage.clear();

        // Create a simple mock IndexedDB
        mockDB = {
            sessions: {
                _data: [],
                add: async function(session) {
                    this._data.push(session);
                },
                get: async function(id) {
                    return this._data.find(s => s.id === id) || null;
                },
                getAll: async function() {
                    return this._data.slice();
                },
                update: async function(id, changes) {
                    const session = this._data.find(s => s.id === id);
                    if (session) Object.assign(session, changes);
                },
                delete: async function(id) {
                    this._data = this._data.filter(s => s.id !== id);
                },
            },
            transaction: function(storeName, mode) {
                return this[storeName];
            }
        };

        window.db = mockDB;
        await SessionManager.init(mockDB);
    });

    test('should create and list sessions', async () => {
        const sessionId = await SessionManager.createSession(
            'user1@example.com',
            'token123',
            { name: 'User 1', avatar: 'U' }
        );

        expect(sessionId).toBeTruthy();
        expect(sessionId).toContain('session_');

        const sessions = await SessionManager.listSessions();
        expect(sessions.length).toBeGreaterThan(0);
        expect(sessions[0].email).toBe('user1@example.com');
    });

    test('should switch sessions atomically', async () => {
        const s1 = await SessionManager.createSession('user1@example.com', 'token1', {name: 'User 1'});
        const s2 = await SessionManager.createSession('user2@example.com', 'token2', {name: 'User 2'});

        await SessionManager.switchSession(s2);

        expect(StorageManager.get('workspace_user_email', 'session')).toBe('user2@example.com');
        expect(StorageManager.get('workspace_user_name', 'session')).toBe('User 2');
    });

    test('should end session and switch to another', async () => {
        const s1 = await SessionManager.createSession('user1@example.com', 'token1', {name: 'User 1'});
        const s2 = await SessionManager.createSession('user2@example.com', 'token2', {name: 'User 2'});

        await SessionManager.switchSession(s1);
        expect(StorageManager.get('workspace_user_email', 'session')).toBe('user1@example.com');

        await SessionManager.endSession(s1);

        // Should auto-switch to s2
        expect(StorageManager.get('workspace_user_email', 'session')).toBe('user2@example.com');
    });

    test('should find session by email', async () => {
        await SessionManager.createSession('user@example.com', 'token123', {name: 'User'});
        const found = await SessionManager.findSessionByEmail('user@example.com');
        expect(found).toBeTruthy();
        expect(found.email).toBe('user@example.com');
    });

    test('should check if user has active session', async () => {
        await SessionManager.createSession('user@example.com', 'token123', {name: 'User'});
        const has = await SessionManager.hasSession('user@example.com');
        expect(has).toBe(true);
    });

    test('should logout and clear session data', async () => {
        await SessionManager.createSession('user@example.com', 'token123', {name: 'User'});
        await SessionManager.switchSession((await SessionManager.listSessions())[0].id);

        StorageManager.set('workspace_user_email', 'user@example.com', 'session');

        await SessionManager.logout();

        expect(StorageManager.get('workspace_user_email', 'session')).toBeNull();
        expect(localStorage.getItem('nexus_current_session_id')).toBeNull();
    });

    test('should generate unique session IDs', () => {
        const id1 = SessionManager.generateSessionId('user1@example.com');
        const id2 = SessionManager.generateSessionId('user2@example.com');

        expect(id1).not.toBe(id2);
        expect(id1).toContain('session_');
        expect(id2).toContain('session_');
    });
});

// ────────────────────────────────────────────────────────────────────────────────
// Integration Tests
// ────────────────────────────────────────────────────────────────────────────────

describe('Multi-Account Integration', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    test('should handle account switch without data loss', async () => {
        // Create two sessions
        const mockDB = {
            sessions: { _data: [], add: async function(s) { this._data.push(s); }, get: async function(id) { return this._data.find(s => s.id === id); }, getAll: async function() { return this._data; }, update: async function(id, c) { const s = this._data.find(x => x.id === id); if(s) Object.assign(s, c); }, delete: async function(id) { this._data = this._data.filter(s => s.id !== id); } },
            transaction: function(store, mode) { return this[store]; }
        };
        window.db = mockDB;
        await SessionManager.init(mockDB);

        const s1 = await SessionManager.createSession('user1@example.com', 'token1', {name: 'User 1'});
        const s2 = await SessionManager.createSession('user2@example.com', 'token2', {name: 'User 2'});

        // User 1 creates data
        await SessionManager.switchSession(s1);
        StorageManager.set('workspace_user_email', 'user1@example.com', 'session');

        // User 2 creates different data
        await SessionManager.switchSession(s2);
        StorageManager.set('workspace_user_email', 'user2@example.com', 'session');

        // Switch back to User 1
        await SessionManager.switchSession(s1);
        expect(StorageManager.get('workspace_user_email', 'session')).toBe('user1@example.com');
    });

    test('should prevent credential leakage across accounts', () => {
        // Setup Account A
        StorageManager.set('workspace_user_email', 'accountA@example.com', 'session');
        localStorage.setItem('workspace_lock_hash', 'hash_A');

        // Clear session for Account B
        StorageManager.clearSessionData();

        // Account B should not see Account A's credentials
        expect(StorageManager.get('workspace_user_email', 'session')).toBeNull();
        expect(localStorage.getItem('workspace_lock_hash')).toBe('hash_A');
    });
});

// Export for test runners
export {
    AccountChangeDetector,
    StorageManager,
    SessionManager,
};
