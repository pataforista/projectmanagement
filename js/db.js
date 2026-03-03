/**
 * db.js
 * Offline-first IndexedDB setup using Vanilla API.
 * This establishes the data models to be used (or migrated to Dexie) when Node is available.
 */

const DB_NAME = 'WorkspaceProduccionDB';
const DB_VERSION = 1;

let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log("IndexedDB initialized successfully.");
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const upgradeDb = event.target.result;

            // 1. Projects Store
            if (!upgradeDb.objectStoreNames.contains('projects')) {
                const projectStore = upgradeDb.createObjectStore('projects', { keyPath: 'id' });
                projectStore.createIndex('type', 'type', { unique: false });
                projectStore.createIndex('status', 'status', { unique: false });
            }

            // 2. Tasks Store
            if (!upgradeDb.objectStoreNames.contains('tasks')) {
                const taskStore = upgradeDb.createObjectStore('tasks', { keyPath: 'id' });
                taskStore.createIndex('projectId', 'projectId', { unique: false });
                taskStore.createIndex('cycleId', 'cycleId', { unique: false });
                taskStore.createIndex('status', 'status', { unique: false });
            }

            // 3. Cycles Store
            if (!upgradeDb.objectStoreNames.contains('cycles')) {
                const cycleStore = upgradeDb.createObjectStore('cycles', { keyPath: 'id' });
                cycleStore.createIndex('projectId', 'projectId', { unique: false });
            }

            // 4. Decisions Store
            if (!upgradeDb.objectStoreNames.contains('decisions')) {
                const decisionStore = upgradeDb.createObjectStore('decisions', { keyPath: 'id' });
                decisionStore.createIndex('projectId', 'projectId', { unique: false });
            }

            // 5. Sync Queue (Offline-First specific layer)
            if (!upgradeDb.objectStoreNames.contains('syncQueue')) {
                upgradeDb.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
};

// API Methods
const dbAPI = {
    // Basic Add
    async addRecord(storeName, record) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.add(record);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Get All by Index
    async getRecordsByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([storeName], "readonly");
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// Initialize on load
initDB().catch(console.error);

// Export for global usage if needed
window.dbAPI = dbAPI;
