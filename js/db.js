/**
 * db.js — Offline-first IndexedDB layer
 * Full schema for Workspace de Producción v1
 */

const DB_NAME = 'WorkspaceProduccionDB';
const DB_VERSION = 3;

let db;

const STORES = {
  projects: 'projects',
  tasks: 'tasks',
  cycles: 'cycles',
  decisions: 'decisions',
  documents: 'documents',
  members: 'members',
  syncQueue: 'syncQueue',
  logs: 'logs',
};

const initDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onerror = (e) => {
    console.error('IndexedDB error:', e.target.error);
    reject(e.target.error);
  };

  request.onsuccess = (e) => {
    db = e.target.result;
    console.log('IndexedDB ready.');
    resolve(db);
  };

  request.onupgradeneeded = (e) => {
    const d = e.target.result;

    // Projects
    if (!d.objectStoreNames.contains('projects')) {
      const s = d.createObjectStore('projects', { keyPath: 'id' });
      s.createIndex('type', 'type', { unique: false });
      s.createIndex('status', 'status', { unique: false });
    }

    // Tasks
    if (!d.objectStoreNames.contains('tasks')) {
      const s = d.createObjectStore('tasks', { keyPath: 'id' });
      s.createIndex('projectId', 'projectId', { unique: false });
      s.createIndex('cycleId', 'cycleId', { unique: false });
      s.createIndex('status', 'status', { unique: false });
      s.createIndex('priority', 'priority', { unique: false });
    }

    // Cycles
    if (!d.objectStoreNames.contains('cycles')) {
      const s = d.createObjectStore('cycles', { keyPath: 'id' });
      s.createIndex('projectId', 'projectId', { unique: false });
      s.createIndex('status', 'status', { unique: false });
    }

    // Decisions
    if (!d.objectStoreNames.contains('decisions')) {
      const s = d.createObjectStore('decisions', { keyPath: 'id' });
      s.createIndex('projectId', 'projectId', { unique: false });
    }

    // Documents (one per project)
    if (!d.objectStoreNames.contains('documents')) {
      const s = d.createObjectStore('documents', { keyPath: 'id' });
      s.createIndex('projectId', 'projectId', { unique: false });
    }

    // Members
    if (!d.objectStoreNames.contains('members')) {
      d.createObjectStore('members', { keyPath: 'id' });
    }

    // Sync queue
    if (!d.objectStoreNames.contains('syncQueue')) {
      d.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
    }

    // Activity Logs
    if (!d.objectStoreNames.contains('logs')) {
      const s = d.createObjectStore('logs', { keyPath: 'id' });
      s.createIndex('type', 'type', { unique: false });
      s.createIndex('timestamp', 'timestamp', { unique: false });
    }
  };
});

// ──────────────────────────────────────────────────────────────────────────────
// Generic CRUD helpers
// ──────────────────────────────────────────────────────────────────────────────

function tx(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    const transaction = db.transaction([storeName], mode);
    const store = transaction.objectStore(storeName);
    const req = fn(store);
    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    }
  });
}

const dbAPI = {
  /** Add a record. Rejects if key already exists. */
  add(storeName, record) {
    return tx(storeName, 'readwrite', s => s.add(record));
  },

  /** Put (upsert) a record. */
  put(storeName, record) {
    return tx(storeName, 'readwrite', s => s.put(record));
  },

  /** Get a single record by primary key. */
  getById(storeName, id) {
    return tx(storeName, 'readonly', s => s.get(id));
  },

  /** Get all records in a store. */
  getAll(storeName) {
    return tx(storeName, 'readonly', s => s.getAll());
  },

  /** Get all records matching an index value. */
  getByIndex(storeName, indexName, value) {
    return tx(storeName, 'readonly', s => s.index(indexName).getAll(value));
  },

  /** Delete a record by primary key. */
  delete(storeName, id) {
    return tx(storeName, 'readwrite', s => s.delete(id));
  },

  /** Clear a store. */
  clear(storeName) {
    return tx(storeName, 'readwrite', s => s.clear());
  },

  /** Queue an operation for background sync. */
  queueSync(operation, storeName, payload) {
    return tx('syncQueue', 'readwrite', s => s.add({
      operation, storeName, payload, createdAt: Date.now()
    }));
  },

  STORES,
};

// Initialize on load
initDB().catch(console.error);

window.dbAPI = dbAPI;
window.initDB = initDB;
