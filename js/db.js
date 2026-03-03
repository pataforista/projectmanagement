/**
 * db.js
 * Offline-first IndexedDB setup — v2 schema.
 * Stores: projects, tasks (workItems), cycles, decisions, documents, syncQueue
 */

const DB_NAME = 'WorkspaceProduccionDB';
const DB_VERSION = 2;

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
            console.log("IndexedDB v2 initialized.");
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const upgradeDb = event.target.result;

            // ── v1 stores ──────────────────────────────────────────────
            if (!upgradeDb.objectStoreNames.contains('projects')) {
                const s = upgradeDb.createObjectStore('projects', { keyPath: 'id' });
                s.createIndex('type', 'type', { unique: false });
                s.createIndex('status', 'status', { unique: false });
            }

            if (!upgradeDb.objectStoreNames.contains('tasks')) {
                const s = upgradeDb.createObjectStore('tasks', { keyPath: 'id' });
                s.createIndex('projectId', 'projectId', { unique: false });
                s.createIndex('cycleId', 'cycleId', { unique: false });
                s.createIndex('status', 'status', { unique: false });
                s.createIndex('priority', 'priority', { unique: false });
            }

            if (!upgradeDb.objectStoreNames.contains('cycles')) {
                const s = upgradeDb.createObjectStore('cycles', { keyPath: 'id' });
                s.createIndex('projectId', 'projectId', { unique: false });
            }

            if (!upgradeDb.objectStoreNames.contains('decisions')) {
                const s = upgradeDb.createObjectStore('decisions', { keyPath: 'id' });
                s.createIndex('projectId', 'projectId', { unique: false });
            }

            if (!upgradeDb.objectStoreNames.contains('syncQueue')) {
                upgradeDb.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }

            // ── v2 stores ──────────────────────────────────────────────
            if (event.oldVersion < 2) {
                if (!upgradeDb.objectStoreNames.contains('documents')) {
                    const s = upgradeDb.createObjectStore('documents', { keyPath: 'id' });
                    s.createIndex('projectId', 'projectId', { unique: false });
                }
            }
        };
    });
};

// ── Full CRUD API ──────────────────────────────────────────────────────────

const dbAPI = {
    async addRecord(storeName, record) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const tx = db.transaction([storeName], "readwrite");
            const req = tx.objectStore(storeName).add(record);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const tx = db.transaction([storeName], "readonly");
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async getById(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const tx = db.transaction([storeName], "readonly");
            const req = tx.objectStore(storeName).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async updateRecord(storeName, record) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const tx = db.transaction([storeName], "readwrite");
            const req = tx.objectStore(storeName).put(record);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async deleteRecord(storeName, id) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const tx = db.transaction([storeName], "readwrite");
            const req = tx.objectStore(storeName).delete(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async getRecordsByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const tx = db.transaction([storeName], "readonly");
            const req = tx.objectStore(storeName).index(indexName).getAll(value);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
};

// ── Seed initial demo data ─────────────────────────────────────────────────

const seedInitialData = async () => {
    const existing = await dbAPI.getAll('projects');
    if (existing.length > 0) return;

    const now = new Date().toISOString();
    const today = new Date();

    const d = (offset) => {
        const x = new Date(today);
        x.setDate(x.getDate() + offset);
        return x.toISOString().split('T')[0];
    };

    const proj1 = 'proj-001';
    const proj2 = 'proj-002';

    // Projects
    await dbAPI.addRecord('projects', {
        id: proj1,
        name: 'Artículo de Investigación',
        description: 'Investigación sobre métodos de aprendizaje activo en educación superior latinoamericana.',
        type: 'research',
        status: 'active',
        createdAt: now, updatedAt: now
    });
    await dbAPI.addRecord('projects', {
        id: proj2,
        name: 'Clase Semestre A',
        description: 'Material, planificación y recursos del semestre en curso.',
        type: 'course',
        status: 'active',
        createdAt: now, updatedAt: now
    });

    // Tasks (workItems) — with priority and type
    const tasks = [
        { id: 'task-001', title: 'Redactar introducción del artículo', status: 'in_progress', priority: 'high',    type: 'task',        projectId: proj1, dueDate: d(0)  },
        { id: 'task-002', title: 'Revisión bibliográfica',             status: 'in_review',  priority: 'medium', type: 'task',        projectId: proj1, dueDate: d(1)  },
        { id: 'task-003', title: 'Preparar presentación clase 3',      status: 'todo',       priority: 'medium', type: 'deliverable', projectId: proj2, dueDate: d(7)  },
        { id: 'task-004', title: 'Definir marco teórico',              status: 'todo',       priority: 'high',   type: 'task',        projectId: proj1, dueDate: d(5)  },
        { id: 'task-005', title: 'Solicitar acceso a base de datos',   status: 'blocked',    priority: 'urgent', type: 'task',        projectId: proj1, dueDate: d(-1) },
        { id: 'task-006', title: 'Diseñar rúbrica de evaluación',      status: 'todo',       priority: 'low',    type: 'deliverable', projectId: proj2, dueDate: d(14) },
        { id: 'task-007', title: 'Revisar referencias APA 7',          status: 'done',       priority: 'medium', type: 'task',        projectId: proj1, dueDate: d(-3) },
    ];
    for (const t of tasks) {
        await dbAPI.addRecord('tasks', { ...t, createdAt: now, updatedAt: now });
    }

    // Cycle
    await dbAPI.addRecord('cycles', {
        id: 'cycle-001',
        name: 'Semana de Cierre',
        startDate: d(-4),
        endDate: d(3),
        status: 'active',
        projectId: proj1,
        createdAt: now, updatedAt: now
    });

    // Decisions
    await dbAPI.addRecord('decisions', {
        id: 'dec-001',
        title: 'Enfocar artículo en educación superior',
        context: 'El alcance inicial era demasiado amplio para el tiempo disponible.',
        decision: 'Limitar el estudio a instituciones de educación superior latinoamericanas.',
        impact: 'Reduce muestra pero aumenta coherencia y profundidad del manuscrito.',
        projectId: proj1,
        date: d(0),
        createdAt: now, updatedAt: now
    });
    await dbAPI.addRecord('decisions', {
        id: 'dec-002',
        title: 'Usar APA 7ma edición',
        context: 'La revista objetivo migró su guía de estilo en el último número.',
        decision: 'Actualizar todas las referencias a APA 7 antes de enviar el primer borrador.',
        impact: 'Requiere revisión de ~30 referencias ya escritas.',
        projectId: proj1,
        date: d(-2),
        createdAt: now, updatedAt: now
    });

    // Living document
    await dbAPI.addRecord('documents', {
        id: 'doc-001',
        projectId: proj1,
        title: 'Documento Maestro',
        content: [
            '# Propósito',
            'Investigar el impacto de metodologías activas en el aprendizaje en educación superior.',
            '',
            '# Esquema del artículo',
            '1. Introducción',
            '2. Marco teórico',
            '3. Metodología',
            '4. Resultados y discusión',
            '5. Conclusiones',
            '',
            '# Acuerdos del equipo',
            '- Tono académico formal',
            '- Máximo 8,000 palabras',
            '- APA 7ma edición',
            '- Envío a revista Q1 antes de fin de ciclo',
            '',
            '# Próximos pasos clave',
            '- Completar introducción',
            '- Finalizar revisión bibliográfica',
            '- Obtener acceso a base de datos'
        ].join('\n'),
        createdAt: now, updatedAt: now
    });

    console.log("Demo data (v2) seeded.");
};

// Initialize → seed → signal readiness
initDB()
    .then(() => seedInitialData())
    .then(() => { window.dbReady = true; })
    .catch(console.error);

window.dbAPI = dbAPI;
