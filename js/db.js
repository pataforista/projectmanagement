/**
 * db.js
 * Offline-first IndexedDB setup using Vanilla API.
 * Provides full CRUD API and seeds initial demo data.
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
    // Add a new record
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

    // Get all records from a store
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([storeName], "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Get a single record by its key
    async getById(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([storeName], "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Update (put/replace) a record
    async updateRecord(storeName, record) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Delete a record by key
    async deleteRecord(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // Get records by an indexed field value
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

// Seed initial demo data (runs only if DB is empty)
const seedInitialData = async () => {
    const existing = await dbAPI.getAll('projects');
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 4);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 3);

    const proj1Id = 'proj-001';
    const proj2Id = 'proj-002';

    await dbAPI.addRecord('projects', {
        id: proj1Id,
        name: 'Artículo de Investigación',
        description: 'Investigación sobre métodos de aprendizaje activo en educación superior.',
        type: 'research',
        status: 'active',
        createdAt: now,
        updatedAt: now
    });

    await dbAPI.addRecord('projects', {
        id: proj2Id,
        name: 'Clase Semestre A',
        description: 'Material y planificación para el semestre en curso.',
        type: 'course',
        status: 'active',
        createdAt: now,
        updatedAt: now
    });

    const tasks = [
        {
            id: 'task-001',
            title: 'Redactar introducción del artículo',
            status: 'in_progress',
            projectId: proj1Id,
            dueDate: today.toISOString().split('T')[0]
        },
        {
            id: 'task-002',
            title: 'Revisión bibliográfica',
            status: 'in_review',
            projectId: proj1Id,
            dueDate: tomorrow.toISOString().split('T')[0]
        },
        {
            id: 'task-003',
            title: 'Preparar presentación clase 3',
            status: 'todo',
            projectId: proj2Id,
            dueDate: nextWeek.toISOString().split('T')[0]
        }
    ];

    for (const task of tasks) {
        await dbAPI.addRecord('tasks', { ...task, createdAt: now, updatedAt: now });
    }

    await dbAPI.addRecord('cycles', {
        id: 'cycle-001',
        name: 'Semana de Cierre',
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        status: 'active',
        projectId: proj1Id,
        createdAt: now,
        updatedAt: now
    });

    console.log("Demo data seeded successfully.");
};

// Initialize, seed, then signal readiness
initDB()
    .then(() => seedInitialData())
    .then(() => { window.dbReady = true; })
    .catch(console.error);

// Export for global usage
window.dbAPI = dbAPI;
