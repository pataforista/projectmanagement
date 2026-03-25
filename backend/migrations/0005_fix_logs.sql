-- Migration: Fix Logs Table
-- Adds missing columns to the logs table for granular synchronization

ALTER TABLE logs ADD COLUMN action TEXT;
ALTER TABLE logs ADD COLUMN entity_type TEXT;
ALTER TABLE logs ADD COLUMN entity_id TEXT;
ALTER TABLE logs ADD COLUMN payload TEXT;

-- Index for log synchronization
CREATE INDEX IF NOT EXISTS idx_logs_user_timestamp ON logs(user_id, timestamp);
