import { dbAPI } from './db.js';
import { createDelta, applyDelta } from './utils/versioning.js';
import { generateUID as uid, esc, getCurrentWorkspaceActor } from './utils.js';
import { RoleManager } from '../scripts/roles.js';

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
    /**
     * Carga de forma asíncrona todos los datos almacenados en IndexedDB hacia la
     * memoria RAM interna (_state), permitiendo lecturas síncronas rápidas (Selectors).
     */
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
    /**
     * Ya no inyecta datos locales "dummy". Solo se asegura de inicializar
     * si es que falta algo vital de estructura, actualmente no usado por diseño
     * off-grid cloud-first, dejando que la BD inicie en blanco puro.
     */
    async function seedIfEmpty() {
        if (_state.projects.length > 0) return;
        console.log('Skip seeding: starting with pure blank state.');
    }

    // ── Subscription ──────────────────────────────────────────────────────────
    /**
     * Registra un callback que se llamará automáticamente cada vez que los datos
     * en el `key` especificado cambien. Devuelve una función para de-suscribirse.
     * @param {string} key - Clave del estado (ej. 'tasks', 'projects', o '*' para todo).
     * @param {Function} fn - Función a ejecutar con el nuevo estado.
     * @returns {Function} Función para cancelar la suscripción.
     */
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

    /**
     * Función centralizadora para despachar ('dispatch') mutaciones de estado.
     * Gestiona 3 pasos para toda acción:
     * 1) Modificación en IndexedDB
     * 2) Mutación del _state en memoria
     * 3) Disparo de la notificación a suscriptores UI y sincronización con Drive.
     *
     * @param {string} action - Nombre del tipo de evento (ADD_TASK, UPDATE_PROJECT...).
     * @param {Object} payload - Datos de la entidad asociados al tipo de evento.
     * @returns {Promise<any>}
     */

    // CLOCK SKEW FIX: Monotonic timestamp — each call returns a value strictly
    // greater than the previous one on this device. Prevents a device with a
    // lagging system clock from producing timestamps that compare as "older"
    // than records it created earlier, which would cause LWW to silently discard
    // the newer edit during merge. The guarantee only applies within this session,
    // but that covers the most common self-overwrite scenario (device editing
    // offline with a slow clock then syncing).
    let _lastKnownTs = Date.now();
    function monotonicNow() {
        _lastKnownTs = Math.max(Date.now(), _lastKnownTs + 1);
        return _lastKnownTs;
    }

    // Fields that must never appear in the per-field _timestamps map because they
    // are record-level identifiers or control metadata, not user-editable content.
    const _ATOMIC_FIELDS = new Set([
        'id', 'user_id', 'created_at', 'createdAt', 'createdBy', 'createdById',
        '_deleted', '_timestamps', 'updatedAt', 'updatedBy', 'updatedById',
    ]);

    /**
     * Builds (or updates) the _timestamps map for a record mutation.
     * Uses a single monotonicNow() call so every field changed in the same
     * dispatch action shares the same timestamp — avoiding needless counter
     * increments and keeping the map consistent with `updatedAt`.
     *
     * @param {Object} existing - The current record (may have an existing _timestamps map).
     * @param {Object} payload  - The incoming mutation payload.
     * @param {number} now      - The monotonic timestamp already captured for updatedAt.
     * @returns {Object}          Updated _timestamps map.
     */
    function stampFields(existing, payload, now) {
        const ts = { ...(existing._timestamps || {}) };
        Object.keys(payload).forEach(key => {
            if (!_ATOMIC_FIELDS.has(key)) ts[key] = now;
        });
        return ts;
    }

    // Debounced push: agrupa ráfagas de acciones en 1 solo push a Drive (evita saturar la red)
    let _syncPushTimer = null;
    function _schedulePush() {
        if (!window.syncManager) return;
        // Mark IDB as dirty immediately so beforeunload/pagehide can warn the user
        // even if the 5-second debounce timer has not fired yet or a prior push failed.
        if (window.syncManager.markDirty) window.syncManager.markDirty();
        if (_syncPushTimer) clearTimeout(_syncPushTimer);
        _syncPushTimer = setTimeout(() => {
            syncManager.push();
        }, 5000); // espera 5s antes de confirmar el push
    }

    async function dispatch(action, payload) {
        // ID COLLISION FIX: Use crypto.randomUUID() (122 bits, RFC 4122 v4) instead of
        // Date.now() + 4-byte random (32 bits per millisecond). Two offline devices
        // creating records simultaneously with the old scheme had a 1-in-4B chance of
        // collision per shared millisecond — astronomically low but non-zero. With
        // randomUUID() the probability is effectively zero for any realistic team size.
        const _uid = crypto.randomUUID();
        let storeName;
        let result = null;

        switch (action) {
            // ── Projects ──
            case 'ADD_PROJECT': {
                storeName = 'projects';
                const actor = getCurrentWorkspaceActor();
                const record = {
                    id: _uid,
                    createdAt: monotonicNow(),
                    createdBy: actor.label,
                    createdById: actor.id,
                    ownerId: actor.memberId,
                    visibility: payload.visibility || 'shared',
                    ...payload
                };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'project', record.id, record);
                _state.projects.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Proyecto "${record.name}" creado.`, 'success');

                // Automated Activity Log
                if (!payload._sync) {
                    await dispatch('ADD_LOG', {
                        type: 'create',
                        message: `Proyecto creado: ${record.name}`,
                        action: 'CREATE',
                        entityType: 'project',
                        entityId: record.id,
                        payload: { name: record.name }
                    });
                }

                result = record;
                break;
            }
            case 'UPDATE_PROJECT': {
                storeName = 'projects';
                const idx = _state.projects.findIndex(p => p.id === payload.id);
                if (idx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const project = _state.projects[idx];

                    // Permission check: only Lead or Author can edit content
                    if (!RoleManager.canEditContent(project, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to edit project ${project.id}`);
                        if (window.showToast) showToast('No tienes permiso para editar este proyecto.', 'error');
                        return;
                    }

                    const _now = monotonicNow();
                    const updated = {
                        ..._state.projects[idx],
                        ...payload,
                        updatedAt: _now,
                        updatedBy: actor.label,
                        updatedById: actor.id,
                        _timestamps: stampFields(_state.projects[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'project', updated.id, payload);
                    _state.projects[idx] = updated;
                    _notify(storeName);
                    if (window.showToast) showToast('Proyecto actualizado.', 'success');

                    // Automated Activity Log
                    if (!payload._sync) {
                        await dispatch('ADD_LOG', {
                            type: 'update',
                            message: `Proyecto actualizado: ${updated.name}`,
                            action: 'UPDATE',
                            entityType: 'project',
                            entityId: updated.id,
                            payload: { name: updated.name }
                        });
                    }
                }
                break;
            }
            case 'UPDATE_PROJECT_ORDERS': {
                storeName = 'projects';
                // payload: array of {id, order}
                for (const update of payload) {
                    const idx = _state.projects.findIndex(p => p.id === update.id);
                    if (idx !== -1) {
                        const _now = monotonicNow();
                        _state.projects[idx].order = update.order;
                        _state.projects[idx]._timestamps = {
                            ...(_state.projects[idx]._timestamps || {}),
                            order: _now,
                        };
                        await dbAPI.put(storeName, _state.projects[idx]);
                        if (!payload._sync) await dbAPI.queueSync('UPDATE', 'project', update.id, { order: update.order });
                    }
                }
                _notify(storeName);
                break;
            }
            case 'DELETE_PROJECT': {
                storeName = 'projects';
                const pIdx = _state.projects.findIndex(p => p.id === payload.id);
                if (pIdx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const project = _state.projects[pIdx];

                    // Permission check
                    if (!RoleManager.canEditContent(project, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to delete project ${project.id}`);
                        if (window.showToast) showToast('No tienes permiso para eliminar este proyecto.', 'error');
                        return;
                    }

                    const tombstone = {
                        ..._state.projects[pIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'project', tombstone.id, null);
                    
                    // Automated Activity Log
                    if (!payload._sync) {
                        await dispatch('ADD_LOG', {
                            type: 'delete',
                            message: `Proyecto eliminado: ${tombstone.name}`,
                            action: 'DELETE',
                            entityType: 'project',
                            entityId: tombstone.id
                        });
                    }

                    _state.projects[pIdx] = tombstone;
                }

                // CASCADING DELETES

                const cascadeDeletes = async (collectionName, filterFn) => {
                    const itemsToDelete = _state[collectionName].filter(filterFn);
                    for (const item of itemsToDelete) {
                        const tomb = { ...item, _deleted: true, updatedAt: monotonicNow() };
                        await dbAPI.put(collectionName, tomb);
                        const idx = _state[collectionName].findIndex(x => x.id === item.id);
                        if (idx !== -1) _state[collectionName][idx] = tomb;
                    }
                    if (itemsToDelete.length > 0) _notify(collectionName);
                };

                await cascadeDeletes('tasks', t => t.projectId === payload.id);
                await cascadeDeletes('cycles', c => c.projectId === payload.id);
                await cascadeDeletes('decisions', d => d.projectId === payload.id);
                await cascadeDeletes('documents', d => d.projectId === payload.id);
                await cascadeDeletes('snapshots', s => s.projectId === payload.id);
                await cascadeDeletes('annotations', a => a.projectId === payload.id);
                await cascadeDeletes('messages', m => m.projectId === payload.id);
                await cascadeDeletes('interconsultations', i => i.projectId === payload.id);

                _notify(storeName);
                if (window.showToast) showToast('Proyecto y dependencias eliminados.', 'info');
                break;
            }

            // ── Tasks ──
            case 'ADD_TASK': {
                storeName = 'tasks';
                const actor = getCurrentWorkspaceActor();
                const _taskNow = monotonicNow();
                const record = {
                    id: _uid,
                    cycleId: null,
                    subtasks: [],
                    tags: [],
                    visibility: 'shared',
                    ...payload,
                    // These must not be overridden by payload on creation
                    createdAt: _taskNow,
                    createdBy: actor.label,
                    createdById: actor.id,
                    updatedAt: _taskNow,
                    updatedBy: actor.label,
                    updatedById: actor.id,
                };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'task', record.id, record);
                _state.tasks.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Tarea "${record.title}" creada.`, 'success');

                // Automated Activity Log
                if (!payload._sync) {
                    await dispatch('ADD_LOG', {
                        type: 'create',
                        message: `Tarea creada: ${record.title}`,
                        action: 'CREATE',
                        entityType: 'task',
                        entityId: record.id,
                        payload: { title: record.title, projectId: record.projectId }
                    });
                }

                result = record;
                break;
            }
            case 'UPDATE_TASK': {
                storeName = 'tasks';
                const actor = getCurrentWorkspaceActor();
                const idx = _state.tasks.findIndex(t => t.id === payload.id);
                if (idx !== -1) {
                    const task = _state.tasks[idx];
                    // Permission check: only Lead or Author can edit content
                    if (!RoleManager.canEditContent(task, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to edit task ${task.id}`);
                        if (window.showToast) showToast('No tienes permiso para editar esta tarea.', 'error');
                        return;
                    }

                    const _now = monotonicNow();
                    const updated = {
                        ..._state.tasks[idx],
                        ...payload,
                        updatedBy: actor.label,
                        updatedById: actor.id,
                        updatedAt: _now,
                        dependencies: payload.dependencies || _state.tasks[idx].dependencies || [],
                        _timestamps: stampFields(_state.tasks[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'task', updated.id, payload);
                    _state.tasks[idx] = updated;
                    _notify(storeName);
                    if (window.showToast) showToast('Tarea actualizada.', 'success');

                    // Automated Activity Log
                    if (!payload._sync) {
                        await dispatch('ADD_LOG', {
                            type: payload.status === 'completada' ? 'complete' : 'update',
                            message: `${payload.status === 'completada' ? 'Tarea completada' : 'Tarea actualizada'}: ${updated.title}`,
                            action: 'UPDATE',
                            entityType: 'task',
                            entityId: updated.id,
                            payload: { title: updated.title, status: updated.status }
                        });
                    }
                }
                break;
            }
            case 'DELETE_TASK': {
                storeName = 'tasks';
                const tIdx = _state.tasks.findIndex(t => t.id === payload.id);
                if (tIdx !== -1) {
                    const tombstone = {
                        ..._state.tasks[tIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'task', tombstone.id, null);

                    // Automated Activity Log
                    if (!payload._sync) {
                        await dispatch('ADD_LOG', {
                            type: 'delete',
                            message: `Tarea eliminada: ${tombstone.title}`,
                            action: 'DELETE',
                            entityType: 'task',
                            entityId: tombstone.id
                        });
                    }

                    _state.tasks[tIdx] = tombstone;
                    _notify(storeName);
                    if (window.showToast) showToast('Tarea eliminada.', 'info');
                }
                break;
            }

            // ── Cycles ──
            case 'ADD_CYCLE': {
                storeName = 'cycles';
                const actor = getCurrentWorkspaceActor();
                const record = {
                    id: _uid,
                    createdAt: monotonicNow(),
                    createdBy: actor.label,
                    createdById: actor.id,
                    status: 'activo',
                    ...payload
                };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'cycle', record.id, record);
                _state.cycles.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Ciclo "${record.name}" creado.`, 'success');
                result = record;
                break;
            }
            case 'UPDATE_CYCLE': {
                storeName = 'cycles';
                const idx = _state.cycles.findIndex(c => c.id === payload.id);
                if (idx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const cycle = _state.cycles[idx];

                    // Permission check
                    if (!RoleManager.canEditContent(cycle, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to edit cycle ${cycle.id}`);
                        if (window.showToast) showToast('No tienes permiso para editar este ciclo.', 'error');
                        return;
                    }

                    const _now = monotonicNow();
                    const updated = {
                        ..._state.cycles[idx],
                        ...payload,
                        updatedAt: _now,
                        updatedBy: actor.label,
                        updatedById: actor.id,
                        _timestamps: stampFields(_state.cycles[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'cycle', updated.id, payload);
                    _state.cycles[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_CYCLE': {
                storeName = 'cycles';
                const cIdx = _state.cycles.findIndex(c => c.id === payload.id);
                if (cIdx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const cycle = _state.cycles[cIdx];

                    // Permission check
                    if (!RoleManager.canEditContent(cycle, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to delete cycle ${cycle.id}`);
                        if (window.showToast) showToast('No tienes permiso para eliminar este ciclo.', 'error');
                        return;
                    }

                    const tombstone = {
                        ..._state.cycles[cIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'cycle', tombstone.id, null);
                    _state.cycles[cIdx] = tombstone;
                    _notify(storeName);
                    if (window.showToast) showToast('Ciclo eliminado.', 'info');
                }
                break;
            }

            // ── Decisions ──
            case 'ADD_DECISION': {
                storeName = 'decisions';
                const actor = getCurrentWorkspaceActor();
                const record = {
                    id: _uid,
                    createdAt: monotonicNow(),
                    createdBy: actor.label,
                    createdById: actor.id,
                    relatedTaskIds: [],
                    ...payload
                };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'decision', record.id, record);
                _state.decisions.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Decisión "${record.title}" registrada.`, 'success');
                result = record;
                break;
            }
            case 'UPDATE_DECISION': {
                storeName = 'decisions';
                const idx = _state.decisions.findIndex(d => d.id === payload.id);
                if (idx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const decision = _state.decisions[idx];

                    // Permission check
                    if (!RoleManager.canEditContent(decision, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to edit decision ${decision.id}`);
                        if (window.showToast) showToast('No tienes permiso para editar esta decisión.', 'error');
                        return;
                    }

                    const _now = monotonicNow();
                    const updated = {
                        ..._state.decisions[idx],
                        ...payload,
                        updatedAt: _now,
                        updatedBy: actor.label,
                        updatedById: actor.id,
                        _timestamps: stampFields(_state.decisions[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'decision', updated.id, payload);
                    _state.decisions[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_DECISION': {
                storeName = 'decisions';
                const dIdx = _state.decisions.findIndex(d => d.id === payload.id);
                if (dIdx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const decision = _state.decisions[dIdx];

                    // Permission check
                    if (!RoleManager.canEditContent(decision, actor.label)) {
                        console.warn(`[Permissions] User ${actor.label} unauthorized to delete decision ${decision.id}`);
                        if (window.showToast) showToast('No tienes permiso para eliminar esta decisión.', 'error');
                        return;
                    }

                    const tombstone = {
                        ..._state.decisions[dIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'decision', tombstone.id, null);
                    _state.decisions[dIdx] = tombstone;
                    _notify(storeName);
                    if (window.showToast) showToast('Decisión eliminada.', 'info');
                }
                break;
            }

            // ── Documents ──
            case 'SAVE_DOCUMENT': {
                storeName = 'documents';
                const actor = getCurrentWorkspaceActor();
                const existing = _state.documents.find(d => d.projectId === payload.projectId);

                // Permission check for documents (associated with projects)
                // If the document doesn't exist yet, we check the project permissions
                const project = _state.projects.find(p => p.id === payload.projectId);
                if (project && !RoleManager.canEditContent(project, actor.label)) {
                    console.warn(`[Permissions] User ${actor.label} unauthorized to save document for project ${project.id}`);
                    if (window.showToast) showToast('No tienes permiso para editar este documento.', 'error');
                    return;
                }

                const record = { id: `doc-${payload.projectId}`, updatedAt: monotonicNow(), ...existing, ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('UPDATE', 'document', record.id, record);
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
                // Support new columns from migration 0005
                const record = { 
                    id: _uid, 
                    timestamp: monotonicNow(), 
                    action: payload.action || 'CREATE',
                    entity_type: payload.entityType || null,
                    entity_id: payload.entityId || null,
                    payload: payload.payload ? JSON.stringify(payload.payload) : null,
                    ...payload 
                };
                await dbAPI.put(storeName, record);
                // We don't sync 'logs' themselves back and forth normally to avoid loops,
                // but the sync_queue WILL track them so other devices get the activity history.
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'log', record.id, record);
                _state.logs.push(record);
                _notify(storeName);
                result = record;
                break;
            }


            // ── Members ──
            case 'ADD_MEMBER': {
                storeName = 'members';
                const avatar = payload.avatar || (payload.name ? payload.name.charAt(0).toUpperCase() : '?');
                const record = { id: _uid, createdAt: monotonicNow(), avatar, ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'member', record.id, record);
                _state.members.push(record);
                _notify(storeName);
                result = record;
                break;
            }

            case 'UPDATE_MEMBER': {
                storeName = 'members';
                const existing = _state.members.find(m => m.id === payload.id);
                if (!existing) throw new Error(`Member ${payload.id} not found`);
                const updated = { ...existing, ...payload, updatedAt: monotonicNow() };
                await dbAPI.put(storeName, updated);
                if (!payload._sync) await dbAPI.queueSync('UPDATE', 'member', updated.id, payload);
                Object.assign(existing, updated);
                _notify(storeName);
                result = updated;
                break;
            }

            case 'DELETE_MEMBER': {
                storeName = 'members';
                const index = _state.members.findIndex(m => m.id === payload.id);
                if (index === -1) throw new Error(`Member ${payload.id} not found`);
                const tombstone = {
                    ..._state.members[index],
                    _deleted: true,
                    updatedAt: monotonicNow()
                };
                await dbAPI.put(storeName, tombstone);
                if (!payload._sync) await dbAPI.queueSync('DELETE', 'member', tombstone.id, null);
                _state.members[index] = tombstone;
                _notify(storeName);
                result = tombstone;
                break;
            }

            // ── Library / Zotero ──
            case 'IMPORT_LIBRARY': {
                storeName = 'library';
                const items = payload.items; // Array of items from Zotero
                let count = 0;

                for (const item of items) {
                    await dbAPI.put(storeName, item);
                    if (!payload._sync) await dbAPI.queueSync('CREATE', 'library_item', item.id, item);
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
                    if (!payload._sync) await dbAPI.queueSync('CREATE', 'library_item', item.id, item);
                }

                _state.library = await dbAPI.getAll(storeName);
                _notify(storeName);
                break;
            }
            case 'UPDATE_LIBRARY_ITEM': {
                storeName = 'library';
                const idx = _state.library.findIndex(i => i.id === payload.id);
                if (idx !== -1) {
                    const _now = monotonicNow();
                    const updated = {
                        ..._state.library[idx],
                        ...payload,
                        updatedAt: _now,
                        _timestamps: stampFields(_state.library[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'library_item', updated.id, payload);
                    _state.library[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'ADD_LIBRARY_ITEM': {
                storeName = 'library';
                const record = { id: _uid, createdAt: monotonicNow(), ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'library_item', record.id, record);
                _state.library.push(record);
                _notify(storeName);
                break;
            }
            case 'DELETE_LIBRARY_ITEM': {
                storeName = 'library';
                const libIdx = _state.library.findIndex(i => i.id === payload.id);
                if (libIdx !== -1) {
                    const tombstone = {
                        ..._state.library[libIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'library_item', tombstone.id, null);
                    _state.library[libIdx] = tombstone;
                    _notify(storeName);
                }
                break;
            }

            // ── Interconsultations ──
            case 'ADD_INTERCONSULTATION': {
                storeName = 'interconsultations';
                const actor = getCurrentWorkspaceActor();
                const record = {
                    id: _uid,
                    createdAt: monotonicNow(),
                    createdBy: actor.label,
                    createdById: actor.id,
                    ownerId: actor.memberId,
                    status: 'Solicitada',
                    visibility: payload.visibility || 'shared',
                    ...payload
                };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'interconsultation', record.id, record);
                _state.interconsultations.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`Interconsulta creada.`, 'success');
                result = record;
                break;
            }
            case 'UPDATE_INTERCONSULTATION': {
                storeName = 'interconsultations';
                const idx = _state.interconsultations.findIndex(i => i.id === payload.id);
                if (idx !== -1) {
                    const actor = getCurrentWorkspaceActor();
                    const _now = monotonicNow();
                    const updated = {
                        ..._state.interconsultations[idx],
                        ...payload,
                        updatedAt: _now,
                        updatedBy: actor.label,
                        updatedById: actor.id,
                        _timestamps: stampFields(_state.interconsultations[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'interconsultation', updated.id, payload);
                    _state.interconsultations[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_INTERCONSULTATION': {
                storeName = 'interconsultations';
                const iIdx = _state.interconsultations.findIndex(i => i.id === payload.id);
                if (iIdx !== -1) {
                    const tombstone = {
                        ..._state.interconsultations[iIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'interconsultation', tombstone.id, null);
                    _state.interconsultations[iIdx] = tombstone;
                    _notify(storeName);
                }
                break;
            }

            // ── Sessions ──
            case 'ADD_SESSION': {
                storeName = 'sessions';
                const actor = getCurrentWorkspaceActor();
                const record = {
                    id: _uid,
                    createdAt: monotonicNow(),
                    createdBy: actor.label,
                    createdById: actor.id,
                    ownerId: actor.memberId,
                    ...payload
                };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'calendar_event', record.id, record);
                _state.sessions.push(record);
                _notify(storeName);
                if (window.showToast) showToast(`${payload.type} registrada.`, 'success');
                result = record;
                break;
            }
            case 'UPDATE_SESSION': {
                storeName = 'sessions';
                const idx = _state.sessions.findIndex(s => s.id === payload.id);
                if (idx !== -1) {
                    const _now = monotonicNow();
                    const updated = {
                        ..._state.sessions[idx],
                        ...payload,
                        updatedAt: _now,
                        _timestamps: stampFields(_state.sessions[idx], payload, _now),
                    };
                    await dbAPI.put(storeName, updated);
                    if (!payload._sync) await dbAPI.queueSync('UPDATE', 'calendar_event', updated.id, payload);
                    _state.sessions[idx] = updated;
                    _notify(storeName);
                }
                break;
            }
            case 'DELETE_SESSION': {
                storeName = 'sessions';
                const sIdx = _state.sessions.findIndex(s => s.id === payload.id);
                if (sIdx !== -1) {
                    const tombstone = {
                        ..._state.sessions[sIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'calendar_event', tombstone.id, null);
                    _state.sessions[sIdx] = tombstone;
                    _notify(storeName);
                }
                break;
            }

            // ── Time Logs ──
            case 'ADD_TIME_LOG': {
                storeName = 'timeLogs';
                const record = { id: _uid, createdAt: monotonicNow(), ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'time_log', record.id, record);
                _state.timeLogs.push(record);
                _notify(storeName);
                result = record;
                break;
            }
            case 'DELETE_TIME_LOG': {
                storeName = 'timeLogs';
                const tlIdx = _state.timeLogs.findIndex(t => t.id === payload.id);
                if (tlIdx !== -1) {
                    const tombstone = {
                        ..._state.timeLogs[tlIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'time_log', tombstone.id, null);
                    _state.timeLogs[tlIdx] = tombstone;
                    _notify(storeName);
                }
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
                    timestamp: monotonicNow(),
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
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'snapshot', snapshotRecord.id, snapshotRecord);
                _state.snapshots.push(snapshotRecord);
                _notify(storeName);
                if (window.showToast) showToast('Versión guardada (delta).', 'success');
                result = snapshotRecord;
                break;
            }
            case 'DELETE_SNAPSHOT': {
                storeName = 'snapshots';
                const snIdx = _state.snapshots.findIndex(s => s.id === payload.id);
                if (snIdx !== -1) {
                    const tombstone = {
                        ..._state.snapshots[snIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'snapshot', tombstone.id, null);
                    _state.snapshots[snIdx] = tombstone;
                    _notify(storeName);
                }
                break;
            }

            // ── Annotations ──
            case 'ADD_ANNOTATION': {
                storeName = 'annotations';
                const record = { id: _uid, createdAt: monotonicNow(), ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'annotation', record.id, record);
                _state.annotations.push(record);
                _notify(storeName);
                result = record;
                break;
            }
            case 'DELETE_ANNOTATION': {
                storeName = 'annotations';
                const aIdx = _state.annotations.findIndex(a => a.id === payload.id);
                if (aIdx !== -1) {
                    const tombstone = {
                        ..._state.annotations[aIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'annotation', tombstone.id, null);
                    _state.annotations[aIdx] = tombstone;
                    _notify(storeName);
                }
                break;
            }

            // ── Messages ──
            case 'ADD_MESSAGE': {
                storeName = 'messages';
                const record = { id: _uid, timestamp: monotonicNow(), ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'message', record.id, record);
                _state.messages.push(record);
                _notify(storeName);

                // Mentions Logic
                if (record.text && record.text.includes('@')) {
                    const matches = record.text.match(/@(\w+)/g);
                    if (matches) {
                        for (const match of matches) {
                            await dispatch('ADD_NOTIFICATION', {
                                type: 'mention',
                                // BUG FIX: the message field is `sender`, not `author`.
                                // Using `record.author` always yielded "Mención de undefined".
                                title: `Mención de ${record.sender || record.author || 'Usuario'}`,
                                text: record.text,
                                read: false,
                                projectId: record.projectId
                            });
                        }
                    }
                }
                result = record;
                break;
            }
            case 'DELETE_MESSAGE': {
                storeName = 'messages';
                const msgIdx = _state.messages.findIndex(m => m.id === payload.id);
                if (msgIdx !== -1) {
                    const tombstone = {
                        ..._state.messages[msgIdx],
                        _deleted: true,
                        updatedAt: monotonicNow()
                    };
                    await dbAPI.put(storeName, tombstone);
                    if (!payload._sync) await dbAPI.queueSync('DELETE', 'message', tombstone.id, null);
                    _state.messages[msgIdx] = tombstone;
                    _notify(storeName);
                }
                break;
            }
            case 'CLEAR_MESSAGES': {
                storeName = 'messages';
                const toDelete = _state.messages.filter(m => (!m.visibility || m.visibility !== 'protected') && !m._deleted);
                for (const m of toDelete) {
                    const idx = _state.messages.findIndex(x => x.id === m.id);
                    if (idx !== -1) {
                        const tombstone = { ...m, _deleted: true, updatedAt: monotonicNow() };
                        await dbAPI.put(storeName, tombstone);
                        if (!payload._sync) await dbAPI.queueSync('DELETE', 'message', tombstone.id, null);
                        _state.messages[idx] = tombstone;
                    }
                }
                _notify(storeName);
                break;
            }
            case 'ADD_NOTIFICATION': {
                storeName = 'notifications';
                const record = { id: _uid, timestamp: monotonicNow(), ...payload };
                await dbAPI.put(storeName, record);
                if (!payload._sync) await dbAPI.queueSync('CREATE', 'notification', record.id, record);
                _state.notifications.push(record);
                _notify(storeName);
                result = record;
                break;
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

                // ── Step 0.5: Record-level merge ──
                // Rules (per collection, per record):
                //  • local-only (visibility='local'): always kept, remote version ignored.
                //  • remote record newer or same age (updatedAt): remote wins.
                //  • local record strictly newer (updatedAt): keep local (user edited offline).
                //  • record exists only in remote: add it (new from another account).
                //  • record exists only in local (not in remote): keep it locally.
                //    EXCEPTION (BUG 24 / Zombie-30-day): see post-merge cleanup below.
                // This prevents one account from silently overwriting another account's
                // concurrent changes when both push within the same sync window.

                // BUG 24 FIX: Detect stale devices (offline > tombstone TTL).
                // When a device was offline for longer than TOMBSTONE_MAX_AGE_MS (30 days),
                // tombstones for items deleted during that window have already been pruned
                // from Drive. The device can't distinguish "was deleted remotely, tombstone
                // pruned" from "was never pushed remotely". We handle this after the merge:
                // - local tombstones not in remote → pruned (deletion was already processed)
                // - non-deleted local-only records → kept (might be new; safest default)
                // - a stale-device warning is shown so users can manually check.
                const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
                const _lastSyncLocal = Number(localStorage.getItem('last_sync_local') || 0);
                const _isStaleBeyondTTL = _lastSyncLocal > 0 && (Date.now() - _lastSyncLocal) > TOMBSTONE_MAX_AGE_MS;

                const validKeys = Object.keys(_state);
                for (const key of validKeys) {
                    if (!Array.isArray(_state[key]) || !Array.isArray(sanitizedPayload[key])) continue;
                    const merged = new Map(
                        _state[key].map(item => item?.id ? [item.id, item] : null).filter(Boolean)
                    );
                    const remoteIds = new Set(sanitizedPayload[key].map(r => r?.id).filter(Boolean));
                    for (const remote of sanitizedPayload[key]) {
                        if (!remote?.id) continue;
                        const local = merged.get(remote.id);
                        if (!local) {
                            merged.set(remote.id, remote); // new record from remote
                        } else if (local.visibility === 'local') {
                            // local-only: never overwrite with remote version
                        } else if ((remote.updatedAt || 0) >= (local.updatedAt || 0)) {
                            merged.set(remote.id, remote); // remote is same age or newer
                        }
                        // else local is strictly newer — keep it (offline edit wins)
                    }

                    // BUG 24: If device is stale beyond TTL, drop local tombstones that
                    // are not present in the remote — those deletions were already
                    // propagated; the tombstone was simply pruned after 30 days.
                    // We cannot safely drop non-deleted local-only records (they might
                    // be new offline records), so those are kept with a warning.
                    if (_isStaleBeyondTTL) {
                        for (const [id, record] of merged) {
                            if (record._deleted && !remoteIds.has(id)) {
                                merged.delete(id); // Deletion was already processed remotely
                            }
                        }
                    }

                    sanitizedPayload[key] = [...merged.values()];
                }

                if (_isStaleBeyondTTL) {
                    console.warn('[Store] Device was offline for more than 30 days. Some remotely-deleted records may have been resurrected.');
                    if (window.showToast) showToast('Dispositivo sin sincronizar por más de 30 días. Verifica si hay registros que deberían estar eliminados.', 'warning', true);
                }

                // TOMBSTONE GC: prune tombstones older than 30 days from the merged
                // result before writing to memory and IDB. Keeps local storage bounded
                // and prevents the Drive JSON from growing indefinitely.
                // (Must run after merge so a fresh tombstone from a remote device is
                // still applied before potentially being eligible for pruning — in
                // practice a just-deleted record is < 30 days old and will pass.)
                const _tombstoneCutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
                for (const key of validKeys) {
                    if (Array.isArray(sanitizedPayload[key])) {
                        sanitizedPayload[key] = sanitizedPayload[key].filter(
                            r => !r._deleted || (r.updatedAt || 0) > _tombstoneCutoff
                        );
                    }
                }

                // Step 1: update memory immediately (safe & instant)
                for (const key of validKeys) {
                    if (Array.isArray(sanitizedPayload[key])) {
                        _state[key] = sanitizedPayload[key];
                    }
                }

                // Step 2: ATOMICITY FIX — write ALL stores in a single IDB transaction.
                // Previous approach used individual dbAPI.put() calls per store, meaning
                // a power-loss or OOM kill mid-loop left the DB in a corrupted hybrid
                // state (some stores new, others old). dbAPI.bulkHydrate() pre-encrypts
                // all records then opens ONE multi-store readwrite transaction, guaranteeing
                // IDB rolls back everything automatically if the write is interrupted.
                const storeMap = {};
                for (const key of validKeys) {
                    if (Array.isArray(sanitizedPayload[key])) storeMap[key] = sanitizedPayload[key];
                }
                try {
                    await dbAPI.bulkHydrate(storeMap);
                } catch (e) {
                    console.error('[HYDRATE] Atomic IDB write failed — memory state is up to date but IDB may be stale:', e);
                    if (window.showToast) showToast('Sincronización parcial: algunos datos no se persistieron localmente.', 'warning');
                }
                _notify('*');
                break;
            }

            default:
                console.warn('Unknown action:', action);
        }

        // Pillar 2: Reactive Sync Push (debounced 5s — previene ráfagas de peticiones)
        // Si el usuario hace varias acciones seguidas, sólo se ejecuta 1 push.
        if (action !== 'HYDRATE_STORE') {
            _schedulePush();
        }

        return result;
    }

    // ── Selectors ──
    const get = {
        projects: () => [..._state.projects].filter(p => !p._deleted).sort((a, b) => (a.order || 0) - (b.order || 0)),
        activeTasks: () => _state.tasks.filter(t => !t._deleted && t.status !== 'Archivado' && t.status !== 'Terminado'),
        tasksByProject: (id) => _state.tasks.filter(t => !t._deleted && t.projectId === id),
        tasksByCycle: (id) => _state.tasks.filter(t => !t._deleted && t.cycleId === id),
        tasksByStatus: (s) => _state.tasks.filter(t => !t._deleted && t.status === s),
        cyclesByProject: (id) => _state.cycles.filter(c => !c._deleted && c.projectId === id),
        activeCycles: () => _state.cycles.filter(c => !c._deleted && c.status === 'activo'),
        decisionsByProject: (id) => _state.decisions.filter(d => !d._deleted && d.projectId === id),
        allDecisions: () => _state.decisions.filter(d => !d._deleted),
        decisions: () => _state.decisions.filter(d => !d._deleted),
        documentByProject: (id) => _state.documents.find(d => !d._deleted && d.projectId === id) || null,
        documents: () => _state.documents.filter(d => !d._deleted),
        documentById: (id) => _state.documents.find(d => !d._deleted && d.id === id),
        getBacklinks: (docId) => {
            const doc = _state.documents.find(d => !d._deleted && d.id === docId);
            if (!doc) return [];
            // Find other docs that explicitly link to this one (if we had a link syntax)
            // For now, we search for docs that contain the title of this doc
            return _state.documents.filter(d =>
                !d._deleted && d.id !== docId &&
                d.content && d.content.includes(`[[${doc.title}]]`)
            );
        },
        getUnlinkedMentions: (docId) => {
            const doc = _state.documents.find(d => !d._deleted && d.id === docId);
            if (!doc || !doc.title) return [];
            return _state.documents.filter(d =>
                !d._deleted && d.id !== docId &&
                d.content &&
                d.content.includes(doc.title) &&
                !d.content.includes(`[[${doc.title}]]`)
            );
        },
        members: () => _state.members.filter(m => !m._deleted),
        query: (collection, filterFn) => {
            if (!_state[collection]) return [];
            return _state[collection].filter(x => !x._deleted).filter(filterFn);
        },
        memberById: (id) => _state.members.find(m => !m._deleted && m.id === id),
        projectById: (id) => _state.projects.find(p => !p._deleted && p.id === id),
        allTasks: () => _state.tasks.filter(t => !t._deleted),
        blockedTasks: () => _state.tasks.filter(t => !t._deleted && t.status === 'En espera'),
        upcomingDeliverables: (days = 7) => {
            const cutoff = Date.now() + days * 86400000;
            return _state.tasks.filter(t => !t._deleted && t.dueDate && new Date(t.dueDate).getTime() <= cutoff && t.status !== 'Terminado' && t.status !== 'Archivado');
        },
        allCycles: () => _state.cycles.filter(c => !c._deleted),
        cycles: () => _state.cycles.filter(c => !c._deleted),
        cycleProgress: (cycleId) => {
            const tasks = _state.tasks.filter(t => !t._deleted && t.cycleId === cycleId);
            if (!tasks.length) return 0;
            const done = tasks.filter(t => t.status === 'Terminado' || t.status === 'Archivado').length;
            return Math.round((done / tasks.length) * 100);
        },
        logs: () => _state.logs.filter(l => !l._deleted),
        library: () => _state.library.filter(l => !l._deleted),
        interconsultations: () => _state.interconsultations.filter(i => !i._deleted),
        interconsultationsByProject: (id) => _state.interconsultations.filter(i => !i._deleted && i.projectId === id),
        sessions: () => _state.sessions.filter(s => !s._deleted),
        sessionsByProject: (id) => _state.sessions.filter(s => !s._deleted && s.projectId === id),
        sessionsByDate: (date) => _state.sessions.filter(s => !s._deleted && s.date === date),
        timeLogs: () => _state.timeLogs.filter(t => !t._deleted),
        timeLogsByTask: (taskId) => _state.timeLogs.filter(t => !t._deleted && t.taskId === taskId),
        messages: () => _state.messages.filter(m => !m._deleted),
        annotations: () => _state.annotations.filter(a => !a._deleted),
        snapshots: () => _state.snapshots.filter(s => !s._deleted),
        totalTimeByTask: (taskId) => _state.timeLogs
            .filter(t => !t._deleted && t.taskId === taskId)
            .reduce((sum, log) => sum + (log.minutes || 0), 0),
        snapshotsByProject: (projectId) => _state.snapshots.filter(s => !s._deleted && s.projectId === projectId),
        annotationsByProject: (projectId) => _state.annotations.filter(a => !a._deleted && a.projectId === projectId),
        messagesByProject: (projectId) => _state.messages.filter(m => !m._deleted && m.projectId === projectId),
        notifications: () => _state.notifications.filter(n => !n._deleted),
        unreadNotifications: () => _state.notifications.filter(n => !n._deleted && !n.read),
        // Recursive tree helpers
        getChildProjects: (parentId) => _state.projects.filter(p => !p._deleted && p.parentId === parentId),
        getChildTasks: (parentId) => _state.tasks.filter(t => !t._deleted && t.parentId === parentId),
        exportState: () => _state, // Raw state for network sync (includes tombstones)
    };

    // BUG 31 FIX: Memory Drift — cross-tab state consistency.
    // After a pull(), the pulling tab updates its own _state via HYDRATE_STORE.
    // But sibling tabs still have the pre-pull version of _state in RAM.
    // If a sibling tab makes an edit and calls push(), it will send the stale
    // snapshot to Drive, overwriting the fresh data the pulling tab just persisted.
    // Fix: listen for 'data-updated' on BroadcastChannel('nexus-sync'). When
    // another tab broadcasts this (after its seedFromRemote completes), reload
    // _state from IDB — which now holds the merged, up-to-date records.
    // BroadcastChannel only delivers messages to OTHER tabs, so the broadcasting
    // tab never receives its own message (no duplicate reload).
    if (typeof BroadcastChannel !== 'undefined') {
        const _syncChannel = new BroadcastChannel('nexus-sync');
        _syncChannel.addEventListener('message', (event) => {
            if (event.data?.type === 'data-updated') {
                console.log('[Store] Sibling tab updated IDB — reloading _state from IndexedDB.');
                load();
            }
        });
    }

    return { load, seedIfEmpty, dispatch, subscribe, get };
})();

export { store };
window.store = store;
