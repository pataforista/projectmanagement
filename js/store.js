import { dbAPI } from './db.js';
import { createDelta, applyDelta } from './utils/versioning.js';
import { generateUID as uid, esc, getCurrentWorkspaceActor } from './utils.js';

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
        interconsultations: [],
        sessions: [],
        timeLogs: [],
        snapshots: [],
        annotations: [],
        messages: [],
        notifications: [],
    };

    const _subscribers = {};

    // Hardening: Debounce UI updates to prevent CPU thrashing during bulk operations (like Sync)
    const _notifyTimeouts = {};
    function _notify(key) {
        if (_notifyTimeouts[key]) {
            cancelAnimationFrame(_notifyTimeouts[key]);
        }
        _notifyTimeouts[key] = requestAnimationFrame(() => {
            if (_subscribers['*']) _subscribers['*'].forEach(fn => fn(_state));
            if (key !== '*' && _subscribers[key]) _subscribers[key].forEach(fn => fn(_state[key]));
        });
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
        _state.interconsultations = await dbAPI.getAll('interconsultations') || [];
        _state.sessions = await dbAPI.getAll('sessions') || [];
        _state.timeLogs = await dbAPI.getAll('timeLogs') || [];
        _state.snapshots = await dbAPI.getAll('snapshots') || [];
        _state.annotations = await dbAPI.getAll('annotations') || [];
        _state.messages = await dbAPI.getAll('messages') || [];
        _state.notifications = await dbAPI.getAll('notifications') || [];
        _notify('*');
    }

    // ── Seed if empty ─────────────────────────────────────────────────────────
    async function seedIfEmpty() {
        if (_state.projects.length > 0) return;

        console.log('Seeding initial data...');
        const now = Date.now();

        const m1 = { id: 'u1', name: 'Carlos (Tú)', role: 'Investigador Principal', avatar: 'C' };
        const m2 = { id: 'u2', name: 'Equipo Alpha', role: 'Colaboradores', avatar: 'A' };
        const m3 = { id: 'u3', name: 'Supervisor', role: 'Revisión', avatar: 'S' };

        await dbAPI.put('members', m1);
        await dbAPI.put('members', m2);
        await dbAPI.put('members', m3);
        _state.members = [m1, m2, m3];

        const p1 = { id: 'p1', name: 'Proyecto de Investigación A', description: 'Investigación sobre metodologías ágiles en educación.', type: 'Investigación', status: 'activo', ownerId: 'u1', createdAt: now };
        const p2 = { id: 'p2', name: 'Artículo: Cognición y Lenguaje', description: 'Redacción de paper para revista indexada.', type: 'Artículo', status: 'activo', ownerId: 'u1', createdAt: now };
        const p3 = { id: 'p3', name: 'Clase Semestre A — Metodología', description: 'Preparación de material y dictado de clases.', type: 'Clase', status: 'activo', ownerId: 'u1', createdAt: now };

        const t1 = { id: 't1', projectId: 'p2', title: 'Redactar introducción del artículo', status: 'En elaboración', priority: 'alta', dueDate: '2026-03-04', subtasks: [], tags: ['Escritura'], assigneeId: 'u1', createdAt: now };
        const t2 = { id: 't2', projectId: 'p3', title: 'Definir pregunta de investigación central', status: 'Capturado', priority: 'media', dueDate: '2026-03-05', subtasks: [], tags: ['Planeación'], assigneeId: 'u2', createdAt: now };

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
        const _uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let storeName;

        switch (action) {
            // ── Projects ──
            case 'ADD_PROJECT': {
                storeName = 'projects';
                const record = { id: _uid, createdAt: Date.now(), ...payload };
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
                const actor = getCurrentWorkspaceActor();
                const record = {
                    id: _uid,
                    createdAt: Date.now(),
                    createdBy: actor.label,
                    createdById: actor.id,
                    updatedAt: Date.now(),
                    updatedBy: actor.label,
                    updatedById: actor.id,
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
                const actor = getCurrentWorkspaceActor();
                const idx = _state.tasks.findIndex(t => t.id === payload.id);
                if (idx !== -1) {
                    const updated = {
                        ..._state.tasks[idx],
                        ...payload,
                        updatedBy: actor.label,
                        updatedById: actor.id,
                        updatedAt: Date.now(),
                        dependencies: payload.dependencies || _state.tasks[idx].dependencies || []
                    };
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
                const record = { id: _uid, createdAt: Date.now(), status: 'activo', ...payload };
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
                const record = { id: _uid, createdAt: Date.now(), relatedTaskIds: [], ...payload };
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
                const record = { id: _uid, timestamp: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.logs.push(record);
                _notify(storeName);
                return record;
            }


            // ── Members ──
            case 'ADD_MEMBER': {
                storeName = 'members';
                const record = { id: _uid, createdAt: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.members.push(record);
                _notify(storeName);
                return record;
            }
            case 'UPDATE_MEMBER': {
                storeName = 'members';
                const idx = _state.members.findIndex(m => m.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.members[idx], ...payload, updatedAt: Date.now() };
                    await dbAPI.put(storeName, updated);
                    _state.members[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_MEMBER': {
                storeName = 'members';
                await dbAPI.delete(storeName, payload.id);
                _state.members = _state.members.filter(m => m.id !== payload.id);
                _notify(storeName);
                if (window.showToast) showToast('Miembro eliminado.', 'info');
                break;
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
            case 'UPDATE_LIBRARY_ITEM': {
                storeName = 'library';
                const idx = _state.library.findIndex(i => i.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.library[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.library[idx] = updated;
                    _notify(storeName);
                }
                break;
            }

            // ── Interconsultations ──
            case 'ADD_INTERCONSULTATION': {
                storeName = 'interconsultations';
                const record = { id: _uid, createdAt: Date.now(), status: 'Solicitada', ...payload };
                await dbAPI.put(storeName, record);
                _state.interconsultations.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Interconsulta creada.`, 'success');
                return record;
            }
            case 'UPDATE_INTERCONSULTATION': {
                storeName = 'interconsultations';
                const idx = _state.interconsultations.findIndex(i => i.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.interconsultations[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.interconsultations[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_INTERCONSULTATION': {
                storeName = 'interconsultations';
                await dbAPI.delete(storeName, payload.id);
                _state.interconsultations = _state.interconsultations.filter(i => i.id !== payload.id);
                _notify(storeName);
                break;
            }

            // ── Sessions ──
            case 'ADD_SESSION': {
                storeName = 'sessions';
                const record = { id: _uid, createdAt: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.sessions.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`${payload.type} registrada.`, 'success');
                return record;
            }
            case 'UPDATE_SESSION': {
                storeName = 'sessions';
                const idx = _state.sessions.findIndex(s => s.id === payload.id);
                if (idx !== -1) {
                    const updated = { ..._state.sessions[idx], ...payload };
                    await dbAPI.put(storeName, updated);
                    _state.sessions[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_SESSION': {
                storeName = 'sessions';
                await dbAPI.delete(storeName, payload.id);
                _state.sessions = _state.sessions.filter(s => s.id !== payload.id);
                _notify(storeName);
                break;
            }

            // ── Time Logs ──
            case 'ADD_TIME_LOG': {
                storeName = 'timeLogs';
                const record = { id: _uid, createdAt: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.timeLogs.push(record);
                _notify(storeName);
                return record;
            }
            case 'DELETE_TIME_LOG': {
                storeName = 'timeLogs';
                await dbAPI.delete(storeName, payload.id);
                _state.timeLogs = _state.timeLogs.filter(t => t.id !== payload.id);
                _notify(storeName);
                break;
            }

            // ── Snapshots ──
            case 'ADD_SNAPSHOT': {
                storeName = 'snapshots';
                const projectSnapshots = _state.snapshots
                    .filter(s => s.projectId === payload.projectId)
                    .sort((a, b) => b.timestamp - a.timestamp);

                const lastSnap = projectSnapshots[0];
                let snapshotRecord = {
                    id: _uid,
                    timestamp: Date.now(),
                    projectId: payload.projectId,
                    title: payload.title || 'Versión'
                };

                if (lastSnap && lastSnap.content) {
                    // Store delta relative to last snapshot if possible
                    // However, it's safer to store full content for snapshots 
                    // and use deltas for intermediate saves. 
                    // But the user requested "only save the patch".
                    // Let's implement full content for the LATEST and deltas for OLDER ones?
                    // No, usually Git-Lite stores deltas relative to a BASE.
                    const delta = createDelta(lastSnap.content, payload.content);
                    snapshotRecord.delta = delta;
                    // We keep 'content' empty or limited to save space
                } else {
                    snapshotRecord.content = payload.content;
                }

                await dbAPI.put(storeName, snapshotRecord);
                _state.snapshots.push(snapshotRecord);
                _notify(storeName);
                if (window.showToast) showToast('Versión guardada (delta).', 'success');
                return snapshotRecord;
            }
            case 'DELETE_SNAPSHOT': {
                storeName = 'snapshots';
                await dbAPI.delete(storeName, payload.id);
                _state.snapshots = _state.snapshots.filter(s => s.id !== payload.id);
                _notify(storeName);
                break;
            }

            // ── Annotations ──
            case 'ADD_ANNOTATION': {
                storeName = 'annotations';
                const record = { id: _uid, createdAt: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.annotations.push(record);
                _notify(storeName);
                return record;
            }
            case 'DELETE_ANNOTATION': {
                storeName = 'annotations';
                await dbAPI.delete(storeName, payload.id);
                _state.annotations = _state.annotations.filter(a => a.id !== payload.id);
                _notify(storeName);
                break;
            }

            // ── Messages ──
            case 'ADD_MESSAGE': {
                storeName = 'messages';
                const record = { id: _uid, timestamp: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.messages.push(record);
                _notify(storeName);

                // Mentions Logic
                if (record.text && record.text.includes('@')) {
                    const matches = record.text.match(/@(\w+)/g);
                    if (matches) {
                        for (const match of matches) {
                            await dispatch('ADD_NOTIFICATION', {
                                type: 'mention',
                                title: `Mención de ${record.author}`,
                                text: record.text,
                                read: false,
                                projectId: record.projectId
                            });
                        }
                    }
                }
                return record;
            }
            case 'ADD_NOTIFICATION': {
                storeName = 'notifications';
                const record = { id: _uid, timestamp: Date.now(), ...payload };
                await dbAPI.put(storeName, record);
                _state.notifications.push(record);
                _notify(storeName);
                return record;
            }

            // ── Sync ──
            case 'HYDRATE_STORE': {
                // ── Step 0: Validate & sanitize remote payload (Pillar 3 — XSS Guard) ──
                let sanitizedPayload = payload;
                try {
                    const { validateSyncPayload } = await import('./utils/schema.js');
                    const { valid, rejected } = validateSyncPayload(payload);
                    if (rejected > 0) {
                        console.warn(`[Store] HYDRATE: ${rejected} invalid records dropped by schema validator.`);
                    }
                    sanitizedPayload = valid;
                } catch (schemaErr) {
                    console.error('[Store] Schema validation failed, aborting HYDRATE:', schemaErr);
                    break;
                }

                // Step 1: update memory immediately (safe & instant)
                const validKeys = Object.keys(_state);
                for (const key of validKeys) {
                    if (Array.isArray(sanitizedPayload[key])) {
                        _state[key] = sanitizedPayload[key];
                    }
                }
                // Step 2: sync IDB in parallel using Promise.allSettled
                // This way, a single store failure does NOT corrupt others
                const ops = validKeys
                    .filter(k => Array.isArray(sanitizedPayload[k]))
                    .map(async (key) => {
                        await dbAPI.clear(key);
                        for (const r of sanitizedPayload[key]) await dbAPI.put(key, r);
                    });
                const results = await Promise.allSettled(ops);
                const failed = results.filter(r => r.status === 'rejected');
                if (failed.length) {
                    console.error('[HYDRATE] Partial IDB sync failure:', failed);
                    if (window.showToast) showToast('Sincronización parcial: algunos datos no se persistieron localmente.', 'warning');
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
        documentById: (id) => _state.documents.find(d => d.id === id),
        getBacklinks: (docId) => {
            const doc = _state.documents.find(d => d.id === docId);
            if (!doc) return [];
            // Find other docs that explicitly link to this one (if we had a link syntax)
            // For now, we search for docs that contain the title of this doc
            return _state.documents.filter(d =>
                d.id !== docId &&
                d.content && d.content.includes(`[[${doc.title}]]`)
            );
        },
        getUnlinkedMentions: (docId) => {
            const doc = _state.documents.find(d => d.id === docId);
            if (!doc || !doc.title) return [];
            return _state.documents.filter(d =>
                d.id !== docId &&
                d.content &&
                d.content.includes(doc.title) &&
                !d.content.includes(`[[${doc.title}]]`)
            );
        },
        members: () => _state.members,
        query: (collection, filterFn) => {
            if (!_state[collection]) return [];
            return _state[collection].filter(filterFn);
        },
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
        interconsultations: () => _state.interconsultations,
        interconsultationsByProject: (id) => _state.interconsultations.filter(i => i.projectId === id),
        sessions: () => _state.sessions,
        sessionsByProject: (id) => _state.sessions.filter(s => s.projectId === id),
        sessionsByDate: (date) => _state.sessions.filter(s => s.date === date),
        timeLogs: () => _state.timeLogs,
        timeLogsByTask: (taskId) => _state.timeLogs.filter(t => t.taskId === taskId),
        messages: () => _state.messages,
        annotations: () => _state.annotations,
        snapshots: () => _state.snapshots,
        totalTimeByTask: (taskId) => _state.timeLogs
            .filter(t => t.taskId === taskId)
            .reduce((sum, log) => sum + (log.minutes || 0), 0),
        snapshotsByProject: (projectId) => _state.snapshots.filter(s => s.projectId === projectId),
        annotationsByProject: (projectId) => _state.annotations.filter(a => a.projectId === projectId),
        messagesByProject: (projectId) => _state.messages.filter(m => m.projectId === projectId),
        notifications: () => _state.notifications,
        unreadNotifications: () => _state.notifications.filter(n => !n.read),
        // Recursive tree helpers
        getChildProjects: (parentId) => _state.projects.filter(p => p.parentId === parentId),
        getChildTasks: (parentId) => _state.tasks.filter(t => t.parentId === parentId),
    };

    return { load, seedIfEmpty, dispatch, subscribe, get };
})();

export { store };
window.store = store;
