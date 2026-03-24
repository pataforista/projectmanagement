-- Migration: Admin Key & Audit Log
-- Adds workspace-level config storage and audit trail for critical operations

-- Workspace configuration (global key-value store)
-- Used to store admin_key_hash and other workspace settings server-side
CREATE TABLE IF NOT EXISTS workspace_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT -- user_id of who last modified this entry
);

-- Audit log for critical operations
-- Records admin key changes, role changes, member deletions, etc.
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,       -- SET_ADMIN_KEY, CHANGE_ROLE, DELETE_MEMBER, etc.
    entity_type TEXT,           -- member, workspace_config, etc.
    entity_id TEXT,
    old_value TEXT,             -- JSON snapshot before the change
    new_value TEXT,             -- JSON snapshot after the change
    ip_address TEXT,
    user_agent TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, timestamp);
