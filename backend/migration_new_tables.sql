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
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  element_id TEXT,
  content TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS time_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT,
  minutes INTEGER,
  description TEXT,
  _deleted BOOLEAN DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s','now') * 1000),
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
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
  created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);
