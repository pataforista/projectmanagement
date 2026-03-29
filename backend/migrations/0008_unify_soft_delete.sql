-- Add missing columns to sessions table
ALTER TABLE sessions ADD COLUMN _deleted BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN deleted_at DATETIME;

-- Add missing columns to refresh_tokens table
ALTER TABLE refresh_tokens ADD COLUMN _deleted BOOLEAN DEFAULT 0;

-- Update existing soft-deleted records for sessions
UPDATE sessions SET _deleted = 1, deleted_at = revoked_at 
WHERE is_active = 0 AND revoked_at IS NOT NULL AND _deleted = 0;

-- Update existing soft-deleted records for refresh_tokens
UPDATE refresh_tokens SET _deleted = 1 
WHERE revoked_at IS NOT NULL AND _deleted = 0;

-- Add performance indexes for active records
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(_deleted, user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON refresh_tokens(_deleted, user_id);
