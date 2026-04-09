-- Migration 0009: Fix critical sync bugs
-- 1. Recreate sync_queue with UNIQUE(user_id, device_id, entity_id) so the
--    ON CONFLICT UPSERT in syncService.js actually fires. Without this
--    constraint every push INSERT created a new row, making pull return the
--    same changes on every cycle and corrupt local state.
DROP TABLE IF EXISTS sync_queue;
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, device_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_device ON sync_queue(user_id, device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);

-- 2. Add message column to logs — the hardcoded INSERT in syncService.js
--    references this column; without it every log sync fails with
--    "no such column: message".
-- ALTER TABLE logs ADD COLUMN message TEXT; -- Redundant: already exists in 0001_initial_schema.sql

-- 3. Add columns that the frontend sends for time_logs but that were missing
--    from the table definition, causing those fields to be silently discarded.
ALTER TABLE time_logs ADD COLUMN duration INTEGER;
ALTER TABLE time_logs ADD COLUMN project_id TEXT;
ALTER TABLE time_logs ADD COLUMN date TEXT;
