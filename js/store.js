/**
 * store.js — Central reactive state
 * Loads from IndexedDB, provides subscribe() and dispatch()
 */

const store = (() => {
    // ──────────────────────────────────────────────────────────────────────────
    // Internal State
    // ──────────────────────────────────────────────────────────────────────────
    let _state = {
        projects: [],
        tasks: [],
        cycles: [],
        decisions: [],
        documents: [],
        members: [],
        logs: [],
        library: [],
    };

    const _subscribers = {};

    function _notify(key) {
        if (_subscribers['*']) _subscribers['*'].forEach(fn => fn(_state));
        if (_subscribers[key]) _subscribers[key].forEach(fn => fn(_state[key]));
    }

    // ── Load from DB ──────────────────────────────────────────────────────────
    async function load() {
        _state.projects = await dbAPI.getAll('projects');
        _state.tasks = await dbAPI.getAll('tasks');
        _state.cycles = await dbAPI.getAll('cycles');
        _state.decisions = await dbAPI.getAll('decisions');
        _state.documents = await dbAPI.getAll('documents');
        _state.members = await dbAPI.getAll('members');
        _state.logs = await dbAPI.getAll('logs') || [];
        _state.library = await dbAPI.getAll('library') || [];
        _notify('*');
    }

    // ── Seed if empty ─────────────────────────────────────────────────────────
    async function seedIfEmpty() {
        if (_state.projects.length > 0) return;

        console.log('Seeding initial data...');
        const now = Date.now();
        const p1 = { id: 'p1', name: 'Proyecto de Investigación A', description: 'Investigación sobre metodologías ágiles en educación.', type: 'Investigación', status: 'activo', createdAt: now };
        const p2 = { id: 'p2', name: 'Artículo: Cognición y Lenguaje', description: 'Redacción de paper para revista indexada.', type: 'Artículo', status: 'activo', createdAt: now };
        const p3 = { id: 'p3', name: 'Clase Semestre A — Metodología', description: 'Preparación de material y dictado de clases.', type: 'Clase', status: 'activo', createdAt: now };

        const t1 = { id: 't1', projectId: 'p2', title: 'Redactar introducción del artículo', status: 'En elaboración', priority: 'alta', dueDate: '2026-03-04', subtasks: [], tags: ['Escritura'], createdAt: now };
        const t2 = { id: 't2', projectId: 'p3', title: 'Definir pregunta de investigación central', status: 'Capturado', priority: 'media', dueDate: '2026-03-05', subtasks: [], tags: ['Planeación'], createdAt: now };

        await dbAPI.put('projects', p1); await dbAPI.put('projects', p2); await dbAPI.put('projects', p3);
        await dbAPI.put('tasks', t1); await dbAPI.put('tasks', t2);

        _state.projects = [p1, p2, p3];
        _state.tasks = [t1, t2];
        _notify('*');
    }

    // ── Subscription ──────────────────────────────────────────────────────────
    function subscribe(key, fn) {
        if (!_subscribers[key]) _subscribers[key] = [];
        _subscribers[key].push(fn);
        // Initial call
        if (key === '*') fn(_state);
        else fn(_state[key]);
        return () => {
            _subscribers[key] = _subscribers[key].filter(x => x !== fn);
        };
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Actions — each mutates DB + memory + notifies
    // ──────────────────────────────────────────────────────────────────────────

    async function dispatch(action, payload) {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let storeName;

        switch (action) {
            // ── Projects ──
            case 'ADD_PROJECT': {
                storeName = 'projects';
                const record = { id: uid, createdAt: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.projects.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Proyecto "${record.name}" creado.`, 'success');
                return record;
            }
            case 'UPDATE_PROJECT': {
                storeName = 'projects';
                const idx = _state.projects.findIndex(p => p.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.projects[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.projects[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'UPDATE_PROJECT_ORDERS': {
                storeName = 'projects';
                // payload: array of {id, order}
                for (const update of payload) {
                    const idx = _state.projects.findIndex(p => p.id === update.id);
                    if (idx !== -1) {
                        _state.projects[idx].order = update.order;
                        await dbAPI.put(storeName, _state.projects[idx]);
                    }
                }
                _notify(storeName);
                break;
            }
            case 'DELETE_PROJECT': {
                storeName = 'projects';
                await dbAPI.delete(storeName, payload.id);
                _state.projects = _state.projects.filter(p => p.id !== payload.id);
                _notify(storeName);
                if (window.showToast) showToast('Proyecto eliminado.', 'info');
                break;
            }

            // ── Tasks ──
            case 'ADD_TASK': {
                storeName = 'tasks';
                const record = {
                    id: uid,
                    createdAt: Date.now(),
                    cycleId: null,
                    subtasks: [],
                    tags: [],
                    ...payload
                };
                await dbAPI.put(storeName, record);
                _state.tasks.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Tarea "${record.title}" creada.`, 'success');
                return record;
            }
            case 'UPDATE_TASK': {
                storeName = 'tasks';
                const idx = _state.tasks.findIndex(t => t.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.tasks[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.tasks[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_TASK': {
                storeName = 'tasks';
                await dbAPI.delete(storeName, payload.id);
                _state.tasks = _state.tasks.filter(t => t.id !== payload.id);
                _notify(storeName);
                break;
            }

            // ── Cycles ──
            case 'ADD_CYCLE': {
                storeName = 'cycles';
                const record = { id: uid, createdAt: Date.now(), status: 'activo', ...payload };
                await dbAPI.put(storeName, record);
                _state.cycles.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Ciclo "${record.name}" creado.`, 'success');
                return record;
            }
            case 'UPDATE_CYCLE': {
                storeName = 'cycles';
                const idx = _state.cycles.findIndex(c => c.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.cycles[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.cycles[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_CYCLE': {
                storeName = 'cycles';
                await dbAPI.delete(storeName, payload.id);
                _state.cycles = _state.cycles.filter(c => c.id !== payload.id);
                _notify(storeName);
                if (window.showToast) showToast('Ciclo eliminado.', 'info');
                break;
            }

            // ── Decisions ──
            case 'ADD_DECISION': {
                storeName = 'decisions';
                const record = { id: uid, createdAt: Date.now(), relatedTaskIds: [], ...payload };
                await dbAPI.put(storeName, record);
                _state.decisions.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Decisión "${record.title}" registrada.`, 'success');
                return record;
            }
            case 'UPDATE_DECISION': {
                storeName = 'decisions';
                const idx = _state.decisions.findIndex(d => d.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.decisions[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.decisions[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_DECISION': {
                storeName = 'decisions';
                await dbAPI.delete(storeName, payload.id);
                _state.decisions = _state.decisions.filter(d => d.id !== payload.id);
                _notify(storeName);
                if (window.showToast) showToast('Decisión eliminada.', 'info');
                break;
            }

            // ── Documents ──
            case 'SAVE_DOCUMENT': {
                storeName = 'documents';
                const existing = _state.documents.find(d => d.projectId === payload.projectId);
                const record = { id: `doc-${payload.projectId}`, updatedAt: Date.now(), ...existing, ...payload };
                await dbAPI.put(storeName, record);
                const idx = _state.documents.findIndex(d => d.projectId === payload.projectId);
                if (idx !== -1) _state.documents[idx] = record;
                else _state.documents.push(record);
                _notify(storeName);
                break;
            }

            // ── Activity Logs ──
            case 'ADD_LOG': {
                storeName = 'logs';
                if (!_state.logs) _state.logs = [];
                const record = { id: uid, timestamp: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.logs.push(record);
                _notify(storeName);
                return record;
            }


            // ── Members ──
            case 'ADD_MEMBER': {
                storeName = 'members';
                const record = { id: uid, createdAt: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.members.push(record);
                _notify(storeName);
                return record;
            }

            // ── Library / Zotero ──
            case 'IMPORT_LIBRARY': {
                storeName = 'library';
                const items = payload.items; // Array of items from Zotero
                let count = 0;

                for (const item of items) {
                    await dbAPI.put(storeName, item);
                    count++;
                }

                _state.library = await dbAPI.getAll(storeName);
                _notify(storeName);
                if (window.showToast) showToast(`${count} referencias importadas de Zotero.`, 'success');
                break;
            }
            case 'CLEAR_LIBRARY_AND_SYNC': {
                storeName = 'library';
                await dbAPI.clear(storeName); // wipe old state

                const items = payload; // Array of mapped zotero items
                for (const item of items) {
                    await dbAPI.put(storeName, item);
                }

                _state.library = await dbAPI.getAll(storeName);
                _notify(storeName);
                break;
            }

            // ── Sync ──
            case 'HYDRATE_STORE': {
                // Validate: only allow known store keys and array values
                const ALLOWED_KEYS = new Set(['projects', 'tasks', 'cycles', 'decisions', 'documents', 'members', 'logs', 'library']);
                for (const key in payload) {
                    if (!ALLOWED_KEYS.has(key)) {
                        console.warn(`[Store] HYDRATE_STORE: unknown key "${key}" rejected`);
                        continue;
                    }
                    if (!Array.isArray(payload[key])) {
                        console.warn(`[Store] HYDRATE_STORE: non-array value for "${key}" rejected`);
                        continue;
                    }
                    // Validate each record has at minimum an id string
                    const sanitized = payload[key].filter(r =>
                        r && typeof r === 'object' && typeof r.id === 'string' && r.id.length > 0
                    );
                    await dbAPI.clear(key);
                    _state[key] = sanitized;
                    for (const r of sanitized) {
                        await dbAPI.put(key, r);
                    }
                }
                _notify('*');
                break;
            }

            default:
                console.warn('Unknown action:', action);
        }

        // Trigger Google Drive sync push if connected
        if (window.syncManager) {
            syncManager.push();
        }
    }

    // ── Selectors ──
    const get = {
        projects: () => [..._state.projects].sort((a, b) => (a.order || 0) - (b.order || 0)),
        activeTasks: () => _state.tasks.filter(t => t.status !== 'Archivado' && t.status !== 'Terminado'),
        tasksByProject: (id) => _state.tasks.filter(t => t.projectId === id),
        tasksByCycle: (id) => _state.tasks.filter(t => t.cycleId === id),
        tasksByStatus: (s) => _state.tasks.filter(t => t.status === s),
        cyclesByProject: (id) => _state.cycles.filter(c => c.projectId === id),
        activeCycles: () => _state.cycles.filter(c => c.status === 'activo'),
        decisionsByProject: (id) => _state.decisions.filter(d => d.projectId === id),
        allDecisions: () => _state.decisions,
        decisions: () => _state.decisions,
        documentByProject: (id) => _state.documents.find(d => d.projectId === id) || null,
        documents: () => _state.documents,
        members: () => _state.members,
        memberById: (id) => _state.members.find(m => m.id === id),
        projectById: (id) => _state.projects.find(p => p.id === id),
        allTasks: () => _state.tasks,
        blockedTasks: () => _state.tasks.filter(t => t.status === 'En espera'),
        upcomingDeliverables: (days = 7) => {
            const cutoff = Date.now() + days * 86400000;
            return _state.tasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() <= cutoff && t.status !== 'Terminado' && t.status !== 'Archivado');
        },
        allCycles: () => _state.cycles,
        cycles: () => _state.cycles,
        cycleProgress: (cycleId) => {
            const tasks = _state.tasks.filter(t => t.cycleId === cycleId);
            if (!tasks.length) return 0;
            const done = tasks.filter(t => t.status === 'Terminado' || t.status === 'Archivado').length;
            return Math.round((done / tasks.length) * 100);
        },
        logs: () => _state.logs,
        library: () => _state.library,
    };

    return { load, seedIfEmpty, dispatch, subscribe, get };
})();

window.store = store;
