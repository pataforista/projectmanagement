/**
 * db.js — Offline-first IndexedDB layer
 * Full schema for Workspace de Producción v1
 * Nexus Fortress: AES-256-GCM at-rest encryption via Web Crypto API
 */

// Lazily resolved crypto module (imported after auth unlocks the key)
let _cryptoLayer = null;
async function getCrypto() {
  if (!_cryptoLayer) {
    _cryptoLayer = await import('./utils/crypto.js');
  }
  return _cryptoLayer;
}


const DB_NAME = 'WorkspaceProduccionDB';
const DB_VERSION = 11; // v11: added assigneeId to interconsultations

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
  library: 'library',
  interconsultations: 'interconsultations',
  sessions: 'sessions',
  timeLogs: 'timeLogs',
  snapshots: 'snapshots',
  annotations: 'annotations',
  messages: 'messages',
  notifications: 'notifications'
};

/**
 * Inicializa la base de datos IndexedDB.
 * Maneja la creación de object stores e índices en el evento onupgradeneeded.
 * Incluye un mecanismo de recuperación en caso de errores de versión.
 * @returns {Promise<IDBDatabase>} Promesa que resuelve la instancia de la base de datos.
 */
export const initDB = () => new Promise(async (resolve, reject) => {
  const openDB = () => new Promise((res, rej) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => {
      const err = e.target.error;
      // VersionError: browser has a newer DB than what we can use.
      // Delete the database and try once more.
      if (err && err.name === 'VersionError') {
        console.warn('[DB] VersionError — deleting stale DB and recreating…');
        const del = indexedDB.deleteDatabase(DB_NAME);
        del.onsuccess = () => res(null); // signal retry
        del.onerror = () => rej(err);
      } else {
        console.error('IndexedDB error:', err);
        rej(err);
      }
    };

    // BUG 30 FIX: Without onblocked, a version upgrade request hangs indefinitely
    // when another tab still holds an open connection to the old schema version.
    // onblocked fires on the *opening* request when the upgrade is blocked by
    // an existing connection that hasn't closed yet. Notify the user so they
    // can close the other tab and the upgrade can proceed.
    request.onblocked = () => {
      console.warn('[DB] Version upgrade blocked by another open tab. Prompting user.');
      if (window.showToast) {
        window.showToast('Actualización de base de datos bloqueada. Cierra las demás pestañas y recarga.', 'warning', true);
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      console.log('IndexedDB ready (v' + db.version + ').');

      // BUG 30 FIX: Without onversionchange, when a newer tab triggers a schema
      // upgrade, the current tab's open connection blocks the upgrade indefinitely.
      // onversionchange fires on the *existing* db connection when another context
      // opens a higher version. Close gracefully and reload so the upgrade can proceed.
      db.onversionchange = () => {
        console.warn('[DB] Schema version change detected from another tab. Closing connection and reloading.');
        db.close();
        if (window.showToast) {
          window.showToast('Actualización de base de datos en progreso. Recargando...', 'info');
        }
        setTimeout(() => location.reload(), 1500);
      };

      res(db);
    };

    request.onupgradeneeded = (e) => {
      const d = e.target.result;

      // Projects
      if (!d.objectStoreNames.contains('projects')) {
        const s = d.createObjectStore('projects', { keyPath: 'id' });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('parentId', 'parentId', { unique: false });
        s.createIndex('ownerId', 'ownerId', { unique: false });
      } else {
        const s = e.target.transaction.objectStore('projects');
        if (!s.indexNames.contains('ownerId')) s.createIndex('ownerId', 'ownerId', { unique: false });
      }

      // Tasks
      if (!d.objectStoreNames.contains('tasks')) {
        const s = d.createObjectStore('tasks', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
        s.createIndex('parentId', 'parentId', { unique: false });
        s.createIndex('cycleId', 'cycleId', { unique: false });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('priority', 'priority', { unique: false });
        s.createIndex('createdBy', 'createdBy', { unique: false });
        s.createIndex('assigneeId', 'assigneeId', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
        s.createIndex('updatedAt', 'updatedAt', { unique: false });
      } else {
        const s = e.target.transaction.objectStore('tasks');
        if (!s.indexNames.contains('createdBy')) s.createIndex('createdBy', 'createdBy', { unique: false });
        if (!s.indexNames.contains('assigneeId')) s.createIndex('assigneeId', 'assigneeId', { unique: false });
        if (!s.indexNames.contains('createdAt')) s.createIndex('createdAt', 'createdAt', { unique: false });
        if (!s.indexNames.contains('updatedAt')) s.createIndex('updatedAt', 'updatedAt', { unique: false });
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

      // Library (Zotero)
      if (!d.objectStoreNames.contains('library')) {
        const s = d.createObjectStore('library', { keyPath: 'id' });
        s.createIndex('itemType', 'itemType', { unique: false });
        s.createIndex('author', 'author', { unique: false });
      }

      // Interconsultations (Medical Referrals)
      if (!d.objectStoreNames.contains('interconsultations')) {
        const s = d.createObjectStore('interconsultations', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
        s.createIndex('status', 'status', { unique: false });
        s.createIndex('assigneeId', 'assigneeId', { unique: false });
      } else {
        const s = e.target.transaction.objectStore('interconsultations');
        if (!s.indexNames.contains('assigneeId')) s.createIndex('assigneeId', 'assigneeId', { unique: false });
      }

      // Sessions (Classes, Medical Appointments, Meetings)
      if (!d.objectStoreNames.contains('sessions')) {
        const s = d.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('date', 'date', { unique: false });
      }

      // Time Logs (Task tracking)
      if (!d.objectStoreNames.contains('timeLogs')) {
        const s = d.createObjectStore('timeLogs', { keyPath: 'id' });
        s.createIndex('taskId', 'taskId', { unique: false });
        s.createIndex('projectId', 'projectId', { unique: false });
      }

      // Snapshots (Version control for writing)
      if (!d.objectStoreNames.contains('snapshots')) {
        const s = d.createObjectStore('snapshots', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Annotations (Contextual comments)
      if (!d.objectStoreNames.contains('annotations')) {
        const s = d.createObjectStore('annotations', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
        s.createIndex('documentId', 'documentId', { unique: false });
      }

      // Messages (Project discussions)
      if (!d.objectStoreNames.contains('messages')) {
        const s = d.createObjectStore('messages', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Notifications — was missing from schema (store.js writes to this store)
      if (!d.objectStoreNames.contains('notifications')) {
        const s = d.createObjectStore('notifications', { keyPath: 'id' });
        s.createIndex('read', 'read', { unique: false });
        s.createIndex('timestamp', 'timestamp', { unique: false });
        s.createIndex('type', 'type', { unique: false });
      }
    };
  });

  // First attempt
  let result = null;
  try {
    result = await openDB();
  } catch (err) {
    if (err && err.name === 'VersionError') {
      console.warn('[DB] Handled VersionError, DB deleted, retrying...');
      // openDB already deletes it internally on VersionError, we just wait a bit and retry
      await new Promise(r => setTimeout(r, 500));
      result = await openDB();
    } else {
      console.warn('[DB] Open failed temporarily (likely locked), retrying in 2 seconds...', err);
      // Wait for filesystem lock to release instead of destructive wipe
      await new Promise(r => setTimeout(r, 2000));
      result = await openDB();
    }
  }

  // If signal retry was requested natively in VersionError handler:
  if (result === null) {
    result = await openDB();
  }

  resolve(result);
});


// ──────────────────────────────────────────────────────────────────────────────
// Generic CRUD helpers
// ──────────────────────────────────────────────────────────────────────────────

// Throttled save indicator — avoids DOM flooding in batch operations
let _saveIndicatorEl = null;
let _saveIndicatorTimer = null;
function _showSaveIndicator() {
  if (_saveIndicatorTimer) clearTimeout(_saveIndicatorTimer);
  if (!_saveIndicatorEl) {
    _saveIndicatorEl = document.createElement('div');
    _saveIndicatorEl.style.cssText = 'position:fixed; bottom:20px; right:20px; background:var(--accent-success); color:#fff; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:600; opacity:0; transition:opacity 0.2s; z-index:999999; pointer-events:none; box-shadow:0 2px 5px rgba(0,0,0,0.2); display:flex; align-items:center; gap:4px;';
    _saveIndicatorEl.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Guardado local';
    document.body.appendChild(_saveIndicatorEl);
    requestAnimationFrame(() => { if (_saveIndicatorEl) _saveIndicatorEl.style.opacity = '1'; });
  }
  _saveIndicatorTimer = setTimeout(() => {
    if (_saveIndicatorEl) {
      _saveIndicatorEl.style.opacity = '0';
      setTimeout(() => { _saveIndicatorEl?.remove(); _saveIndicatorEl = null; }, 200);
    }
  }, 1500);
}

/**
 * Ejecuta una operación IndexedDB manejando los eventos onsuccess y onerror automáticamente,
 * devolviendo una Promesa estándar.
 * 
 * @param {string} storeName - El nombre del ObjectStore sobre el que operar.
 * @param {IDBTransactionMode} mode - Tipo de transacción ('readonly' o 'readwrite').
 * @param {Function} fn - Callback que recibe el store para ejecutar un request de la IDB.
 * @returns {Promise<any>} Promesa que se resuelve con el resultado de la transacción.
 */
function tx(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('DB not initialized');
    try {
      const transaction = db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      const req = fn(store);
      if (req) {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.error(`[DB] Error in ${storeName}:`, req.error);
          reject(req.error);
        };
      } else {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error(`[DB] Tx error in ${storeName}:`, transaction.error);
          reject(transaction.error);
        };
      }
    } catch (e) {
      console.error(`[DB] Exception in ${storeName} tx:`, e);
      reject(e);
    }
  });
}

export const dbAPI = {
  /** Add a record. Rejects if key already exists. */
  add(storeName, record) {
    return tx(storeName, 'readwrite', s => s.add(record));
  },

  /** Put (upsert) a record — encrypts sensitive stores when key is available. */
  async put(storeName, record) {
    try {
      let dataToStore = record;

      // Encrypt if store is sensitive and the crypto key is available
      const crypto = await getCrypto();
      if (crypto.ENCRYPTED_STORES.has(storeName) && crypto.hasKey()) {
        dataToStore = await crypto.encryptRecord(record);
        // Always preserve the primary key (id) outside the encrypted envelope
        // so IndexedDB can use it as keyPath
        dataToStore.id = record.id;
      }

      const res = await tx(storeName, 'readwrite', s => s.put(dataToStore));
      // Show a throttled save indicator (single reusable DOM node)
      if (storeName !== 'logs' && storeName !== 'syncQueue') {
        _showSaveIndicator();
      }
      return res;
    } catch (e) {
      if (window.showToast) window.showToast('Error crítico de guardado local.', 'error');
      throw e;
    }
  },

  /** Get a single record by primary key. */
  async getById(storeName, id) {
    const rawRecord = await tx(storeName, 'readonly', s => s.get(id));
    if (!rawRecord) return null;
    const crypto = await getCrypto();
    if (crypto.ENCRYPTED_STORES.has(storeName) && crypto.hasKey()) {
      return crypto.decryptRecord(rawRecord);
    }
    return rawRecord;
  },

  /** Get all records in a store — decrypts if store is encrypted. */
  async getAll(storeName) {
    const rawRecords = await tx(storeName, 'readonly', s => s.getAll());
    const crypto = await getCrypto();
    if (crypto.ENCRYPTED_STORES.has(storeName) && crypto.hasKey()) {
      return crypto.decryptAll(rawRecords);
    }
    return rawRecords;
  },

  /** Get all records matching an index value. */
  async getByIndex(storeName, indexName, value) {
    const rawRecords = await tx(storeName, 'readonly', s => s.index(indexName).getAll(value));
    const crypto = await getCrypto();
    if (crypto.ENCRYPTED_STORES.has(storeName) && crypto.hasKey()) {
      return crypto.decryptAll(rawRecords);
    }
    return rawRecords;
  },

  /** Delete a record by primary key. */
  async delete(storeName, id) {
    try {
      return await tx(storeName, 'readwrite', s => s.delete(id));
    } catch (e) {
      if (window.showToast) window.showToast('Error al eliminar registro local.', 'error');
      throw e;
    }
  },

  /** Clear a store. */
  clear(storeName) {
    return tx(storeName, 'readwrite', s => s.clear());
  },

  /**
   * ATOMICITY FIX (BUG 18): Writes an entire hydration payload across multiple stores
   * in a single IDB transaction. If the page is killed mid-write, IDB rolls back the
   * whole transaction automatically — the database is never left in a half-updated state.
   *
   * BUG 28 FIX (Borrado por Desbordamiento): Uses UPSERT (put-only), NOT clear+put.
   * The BUG 27 cap limits the Drive snapshot to the N most-recent records. A
   * clear+put would destroy any local records beyond that cap that were not included
   * in the remote snapshot — a silent, permanent data loss. Upsert-only preserves all
   * existing local records; only records explicitly present in the snapshot are updated.
   * Records that are capped out of the snapshot simply stay in IDB untouched.
   *
   * Two-phase approach (required because IDB transactions expire on async awaits):
   *   Phase 1 (async, outside transaction): encrypt records for sensitive stores.
   *   Phase 2 (sync IDB requests only): open one multi-store readwrite transaction,
   *            put all pre-encrypted records (no clear), let it auto-commit.
   *
   * @param {Record<string, Array>} plainStoreMap  Plain (decrypted) records per store name.
   */
  async bulkHydrate(plainStoreMap) {
    const storeNames = Object.keys(plainStoreMap);
    if (!storeNames.length) return;

    // Phase 1: pre-encrypt all records that belong to sensitive stores.
    // Must be done BEFORE opening the transaction so no async work happens
    // inside the transaction scope (which would cause it to auto-commit early).
    const cryptoModule = await getCrypto();
    const encStoreMap = {};
    for (const storeName of storeNames) {
      const records = plainStoreMap[storeName];
      const shouldEncrypt = cryptoModule.ENCRYPTED_STORES.has(storeName) && cryptoModule.hasKey();
      if (shouldEncrypt) {
        encStoreMap[storeName] = await Promise.all(records.map(async r => {
          const enc = await cryptoModule.encryptRecord(r);
          enc.id = r.id; // keep keyPath outside envelope so IDB can index it
          return enc;
        }));
      } else {
        encStoreMap[storeName] = records;
      }
    }

    // Phase 2: single atomic multi-store transaction — all IDB requests are
    // synchronous from IDB's perspective (no awaits between requests).
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error('[DB] bulkHydrate: DB not initialized'));
      try {
        const transaction = db.transaction(storeNames, 'readwrite');
        transaction.oncomplete = () => resolve();
        // BUG 35 FIX: Specifically detect QuotaExceededError so the caller (and the
        // user) knows the failure is due to insufficient device storage rather than
        // a generic IDB error. Showing a clear toast prevents the app from appearing
        // to fail silently when the device runs out of disk space (common on mobile).
        const _handleIDBError = (fallbackMsg) => {
            const err = transaction.error ?? new Error(fallbackMsg);
            if (err && err.name === 'QuotaExceededError') {
                if (window.showToast) {
                    window.showToast(
                        'Espacio insuficiente en el dispositivo. La sincronización se ha pausado para proteger tus datos.',
                        'error',
                        true
                    );
                }
            }
            reject(err);
        };
        transaction.onerror = () => _handleIDBError('[DB] bulkHydrate error');
        transaction.onabort = () => _handleIDBError('[DB] bulkHydrate aborted');

        for (const storeName of storeNames) {
          const store = transaction.objectStore(storeName);
          for (const record of encStoreMap[storeName]) {
            store.put(record);
          }
        }
        // Transaction auto-commits once all put requests have been queued
        // and control returns to the event loop with no pending requests.
      } catch (e) {
        reject(e);
      }
    });
  },

  /** Queue an operation for background sync. */
  queueSync(operation, storeName, payload) {
    return tx('syncQueue', 'readwrite', s => s.add({
      operation, storeName, payload, createdAt: Date.now()
    }));
  },

  STORES,
};

window.dbAPI = dbAPI;
window.initDB = initDB;
