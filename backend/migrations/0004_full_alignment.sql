-- Migration: Full Alignment (v2)
-- Aligns ALL tables with the latest schema.sql requirements

-- 1. Infrastructure (Drop and Recreate transient tables)
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
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS sync_cursor;
CREATE TABLE sync_cursor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_sync_time INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, device_id)
);

-- 2. Projects
ALTER TABLE projects ADD COLUMN type TEXT;
ALTER TABLE projects ADD COLUMN status TEXT;
ALTER TABLE projects ADD COLUMN color TEXT;
ALTER TABLE projects ADD COLUMN icon TEXT;
ALTER TABLE projects ADD COLUMN view_type TEXT;
ALTER TABLE projects ADD COLUMN parent_id TEXT;
ALTER TABLE projects ADD COLUMN owner_id TEXT;
ALTER TABLE projects ADD COLUMN "order" INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN metadata TEXT;

-- 3. Tasks
ALTER TABLE tasks ADD COLUMN user_id TEXT;
ALTER TABLE tasks ADD COLUMN cycle_id TEXT;
ALTER TABLE tasks ADD COLUMN parent_id TEXT;
ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN assignee_id TEXT;
ALTER TABLE tasks ADD COLUMN tags TEXT;
ALTER TABLE tasks ADD COLUMN subtasks TEXT;
ALTER TABLE tasks ADD COLUMN dependencies TEXT;
ALTER TABLE tasks ADD COLUMN estimate INTEGER;
ALTER TABLE tasks ADD COLUMN due_date DATETIME;
ALTER TABLE tasks ADD COLUMN visibility TEXT DEFAULT 'shared';

-- 4. Cycles
ALTER TABLE cycles ADD COLUMN user_id TEXT;
ALTER TABLE cycles ADD COLUMN description TEXT;
ALTER TABLE cycles ADD COLUMN status TEXT;

-- 5. Decisions
ALTER TABLE decisions ADD COLUMN user_id TEXT;
ALTER TABLE decisions ADD COLUMN status TEXT;
ALTER TABLE decisions ADD COLUMN tags TEXT;
ALTER TABLE decisions ADD COLUMN related_task_ids TEXT;

-- 6. Documents
ALTER TABLE documents ADD COLUMN user_id TEXT;
ALTER TABLE documents ADD COLUMN title TEXT;
ALTER TABLE documents ADD COLUMN type TEXT;
ALTER TABLE documents ADD COLUMN metadata TEXT;

-- 7. Members
ALTER TABLE members ADD COLUMN avatar TEXT;
ALTER TABLE members ADD COLUMN status TEXT;

-- 8. Notes
ALTER TABLE notes ADD COLUMN content_hash TEXT;
ALTER TABLE notes ADD COLUMN is_pinned BOOLEAN DEFAULT 0;
ALTER TABLE notes ADD COLUMN encrypted BOOLEAN DEFAULT 0;
ALTER TABLE notes ADD COLUMN encryption_iv TEXT;
ALTER TABLE notes ADD COLUMN remote_version INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN synced_at DATETIME;
ALTER TABLE notes ADD COLUMN conflict_state TEXT;
ALTER TABLE notes ADD COLUMN conflict_remote_data TEXT;
ALTER TABLE notes ADD COLUMN conflict_resolution_strategy TEXT;
ALTER TABLE notes ADD COLUMN created_by TEXT;
ALTER TABLE notes ADD COLUMN updated_by TEXT;

-- 9. Create New Collaboration Tables
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  text TEXT,
  sender TEXT,
  visibility TEXT,
  _deleted BOOLEAN DEFAULT 0,
  timestamp INTEGER DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  element_id TEXT,
  content TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT,
  content TEXT,
  delta TEXT,
  _deleted BOOLEAN DEFAULT 0,
  timestamp INTEGER DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS interconsultations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  owner_id TEXT,
  status TEXT,
  visibility TEXT,
  department TEXT,
  reason TEXT,
  response TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  owner_id TEXT,
  title TEXT,
  date TEXT,
  type TEXT,
  description TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS time_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT,
  minutes INTEGER,
  description TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  type TEXT,
  authors TEXT,
  url TEXT,
  metadata TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  type TEXT,
  title TEXT,
  text TEXT,
  read BOOLEAN DEFAULT 0,
  _deleted BOOLEAN DEFAULT 0,
  timestamp INTEGER DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  old_email TEXT,
  new_email TEXT NOT NULL,
  old_google_sub TEXT,
  new_google_sub TEXT,
  reason TEXT NOT NULL,
  same_sub BOOLEAN,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_device ON sync_queue(user_id, device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, _deleted);
CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
