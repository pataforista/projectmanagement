-- Migration: Align Sync Infrastructure and Collaboration Tables
-- Fixes sync_queue and sync_cursor to match backend code requirements
-- Adds missing tables for messages, annotations, snapshots, etc.

-- 1. Infrastructure Alignment
-- We drop and recreate these because they are transient/config tables and PK types changed
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

-- 2. New Collaboration Tables (from schema.sql)
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

-- 3. Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_device ON sync_queue(user_id, device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, _deleted);
CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, "read");
