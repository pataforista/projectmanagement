-- =========================================================
-- workspace-db schema — aplica con:
--   npx wrangler d1 execute workspace-db --file=schema.sql          (produccion)
--   npx wrangler d1 execute workspace-db --local --file=schema.sql  (local)
-- Todas las sentencias usan IF NOT EXISTS / IF NOT EXISTS INDEX,
-- por lo que es seguro ejecutar multiples veces.
-- =========================================================

-- Auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  google_aud TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  locale TEXT DEFAULT 'es-ES',
  email_verified BOOLEAN DEFAULT 0,
  two_factor_enabled BOOLEAN DEFAULT 0,
  encryption_key_iv TEXT,
  encrypted_key_hash TEXT,
  login_count INTEGER DEFAULT 0,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  google_sub TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  device_name TEXT,
  device_id TEXT,
  access_token_hash TEXT,
  access_token_expires_at DATETIME,
  is_active BOOLEAN DEFAULT 1,
  is_revoked BOOLEAN DEFAULT 0,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME,
  replaced_by_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
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

-- Workspace entities
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT,
  status TEXT,
  color TEXT,
  icon TEXT,
  view_type TEXT,
  parent_id TEXT,
  owner_id TEXT,
  visibility TEXT DEFAULT 'shared',
  "order" INTEGER DEFAULT 0,
  metadata TEXT,
  _deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  cycle_id TEXT,
  parent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  priority TEXT,
  assignee_id TEXT,
  tags TEXT,
  subtasks TEXT,
  dependencies TEXT,
  estimate INTEGER,
  due_date DATETIME,
  visibility TEXT DEFAULT 'shared',
  _deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  start_date DATETIME,
  end_date DATETIME,
  _deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT,
  tags TEXT,
  related_task_ids TEXT,
  _deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT,
  content TEXT,
  type TEXT,
  metadata TEXT,
  _deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  avatar TEXT,
  status TEXT,
  _deleted BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  content_hash TEXT,
  type TEXT,
  tags TEXT,
  is_pinned BOOLEAN DEFAULT 0,
  links TEXT,
  frontmatter TEXT,
  encrypted BOOLEAN DEFAULT 0,
  encryption_iv TEXT,
  local_version INTEGER DEFAULT 1,
  remote_version INTEGER DEFAULT 0,
  synced_at DATETIME,
  conflict_state TEXT,
  conflict_remote_data TEXT,
  conflict_resolution_strategy TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  _deleted BOOLEAN DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sync infrastructure
CREATE TABLE IF NOT EXISTS sync_queue (
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

CREATE TABLE IF NOT EXISTS sync_cursor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  last_sync_time INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, device_id)
);

-- Collaboration entities
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_session_id ON refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_user_synced ON notes(user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_user_device ON sync_queue(user_id, device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_account_history_user_id ON account_history(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_timestamp ON logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, _deleted);
CREATE INDEX IF NOT EXISTS idx_annotations_project ON annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project ON calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
