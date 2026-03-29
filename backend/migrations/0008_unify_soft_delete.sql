-- ===================================================================
-- Migration: Unify soft delete flags across all tables
-- Purpose: Ensure consistent _deleted + deleted_at convention
-- Date: 2026-03-29
--
-- Before:
--   - projects, tasks: _deleted BOOLEAN
--   - sessions: is_active BOOLEAN (opposite semantic)
--   - refresh_tokens: revoked_at DATETIME
--   - audit_log: no delete support
--
-- After:
--   - All entities: _deleted BOOLEAN DEFAULT 0 + deleted_at DATETIME
--   - Consistent semantics across all tables
-- ===================================================================

-- Add missing columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS _deleted BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_at DATETIME;

-- Add missing columns to refresh_tokens table
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS _deleted BOOLEAN DEFAULT 0;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- Update existing soft-deleted sessions
UPDATE sessions SET _deleted = 1, deleted_at = revoked_at
WHERE is_active = 0 AND revoked_at IS NOT NULL AND _deleted = 0;

-- Update existing revoked refresh tokens
UPDATE refresh_tokens SET _deleted = 1, deleted_at = revoked_at
WHERE revoked_at IS NOT NULL AND _deleted = 0;

-- Add index for soft-delete queries (for faster filtering of active records)
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(_deleted, user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(_deleted, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(_deleted, user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(_deleted, project_id);

-- Note: Old columns (is_active, revoked_at, is_revoked) are preserved for backwards compatibility
-- They will be removed in a future migration after confirming full migration success
