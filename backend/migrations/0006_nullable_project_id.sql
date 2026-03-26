-- Migration: Nullable Project ID (v2)
-- Allows tasks, cycles, decisions, documents and members to exist without a project_id

-- 1. Tasks
CREATE TABLE tasks_new (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    payload TEXT,
    _deleted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    user_id TEXT,
    cycle_id TEXT,
    parent_id TEXT,
    description TEXT,
    assignee_id TEXT,
    tags TEXT,
    subtasks TEXT,
    dependencies TEXT,
    estimate INTEGER,
    due_date DATETIME,
    visibility TEXT DEFAULT 'shared',
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
INSERT INTO tasks_new (id, project_id, title, status, priority, payload, _deleted, created_at, updated_at, user_id, cycle_id, parent_id, description, assignee_id, tags, subtasks, dependencies, estimate, due_date, visibility)
SELECT id, project_id, title, status, priority, payload, _deleted, created_at, updated_at, user_id, cycle_id, parent_id, description, assignee_id, tags, subtasks, dependencies, estimate, due_date, visibility FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

-- 2. Cycles
CREATE TABLE cycles_new (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    start_date INTEGER,
    end_date INTEGER,
    _deleted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    user_id TEXT,
    description TEXT,
    status TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
INSERT INTO cycles_new (id, project_id, name, start_date, end_date, _deleted, created_at, updated_at, user_id, description, status)
SELECT id, project_id, name, start_date, end_date, _deleted, created_at, updated_at, user_id, description, status FROM cycles;
DROP TABLE cycles;
ALTER TABLE cycles_new RENAME TO cycles;

-- 3. Decisions
CREATE TABLE decisions_new (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT NOT NULL,
    content TEXT,
    _deleted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    user_id TEXT,
    status TEXT,
    tags TEXT,
    related_task_ids TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
INSERT INTO decisions_new (id, project_id, title, content, _deleted, created_at, updated_at, user_id, status, tags, related_task_ids)
SELECT id, project_id, title, content, _deleted, created_at, updated_at, user_id, status, tags, related_task_ids FROM decisions;
DROP TABLE decisions;
ALTER TABLE decisions_new RENAME TO decisions;

-- 4. Documents
CREATE TABLE documents_new (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    content TEXT,
    _deleted INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL,
    user_id TEXT,
    title TEXT,
    type TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
INSERT INTO documents_new (id, project_id, content, _deleted, updated_at, user_id, title, type, metadata, created_at)
SELECT id, project_id, content, _deleted, updated_at, user_id, title, type, metadata, created_at FROM documents;
DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

-- 5. Members
CREATE TABLE members_new (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    name TEXT,
    email TEXT,
    role TEXT,
    _deleted INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    avatar TEXT,
    status TEXT
);
INSERT INTO members_new (id, project_id, user_id, name, email, role, _deleted, created_at, updated_at, avatar, status)
SELECT id, project_id, user_id, name, email, role, _deleted, created_at, updated_at, avatar, status FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;
