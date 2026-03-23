/**
 * js/api/google-sync-orchestrator.js
 * Google Services Synchronization Orchestrator
 *
 * Coordina la sincronización bidireccional entre:
 * - Google Drive (workspace data)
 * - Google Calendar (eventos, sesiones)
 * - Google Tasks (tareas del proyecto)
 */

const googleSyncOrchestrator = (() => {
    const SYNC_STATUS_KEY = 'google_sync_status';
    const SYNC_LAST_RUN = 'google_sync_last_run';

    let isRunning = false;
    let lastError = null;
    let syncListeners = [];

    /**
     * Registra un listener para cambios de estado de sincronización
     * @param {Function} callback - Función a ejecutar con cambios
     */
    function onSyncStatusChange(callback) {
        if (typeof callback === 'function') {
            syncListeners.push(callback);
        }
    }

    /**
     * Notifica a los listeners sobre cambios de estado
     */
    function notifySyncStatusChange(status) {
        syncListeners.forEach(listener => {
            try {
                listener(status);
            } catch (error) {
                console.error('[GoogleSyncOrchestrator] Listener error:', error);
            }
        });
    }

    /**
     * Obtiene el estado actual de sincronización
     */
    function getStatus() {
        const raw = localStorage.getItem(SYNC_STATUS_KEY);
        try {
            return JSON.parse(raw) || getDefaultStatus();
        } catch {
            return getDefaultStatus();
        }
    }

    /**
     * Estado por defecto de sincronización
     */
    function getDefaultStatus() {
        return {
            drive: { synced: false, lastSync: null, itemCount: 0 },
            calendar: { synced: false, lastSync: null, eventCount: 0, enabled: false },
            tasks: { synced: false, lastSync: null, taskCount: 0, enabled: false },
            isRunning: false,
            lastError: null,
            lastFullSync: null
        };
    }

    /**
     * Actualiza el estado de sincronización
     */
    function updateStatus(updates) {
        const current = getStatus();
        const next = { ...current, ...updates, lastFullSync: Date.now() };
        localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(next));
        notifySyncStatusChange(next);
        return next;
    }

    /**
     * Sincroniza eventos de Google Calendar con la app
     * @param {Object} store - Reference al store de la app
     * @returns {Promise<Object>} Resultado de la sincronización
     */
    async function syncCalendarToApp(store) {
        if (!window.googleCalendarApi?.isSyncEnabled?.()) {
            return { imported: 0, updated: 0, skipped: 'disabled' };
        }

        try {
            const sessionSessions = store?.state?.sessions || [];
            let imported = 0, updated = 0;

            const result = await window.googleCalendarApi?.syncFromGoogle?.(async (googleEvent) => {
                // Buscar si ya existe sesión local
                const existing = sessionSessions.find(s =>
                    s.googleCalendarId === googleEvent.id
                );

                if (existing) {
                    // Actualizar sesión existente
                    await store?.dispatch?.({
                        type: 'UPDATE_SESSION',
                        payload: {
                            id: existing.id,
                            startTime: googleEvent.start?.dateTime || googleEvent.start?.date,
                            endTime: googleEvent.end?.dateTime || googleEvent.end?.date,
                            title: googleEvent.summary,
                            description: googleEvent.description,
                            googleCalendarId: googleEvent.id
                        }
                    });
                    return { isUpdated: true };
                } else {
                    // Crear nueva sesión
                    await store?.dispatch?.({
                        type: 'ADD_SESSION',
                        payload: {
                            title: googleEvent.summary || 'Sin título',
                            description: googleEvent.description || '',
                            startTime: googleEvent.start?.dateTime || googleEvent.start?.date,
                            endTime: googleEvent.end?.dateTime || googleEvent.end?.date,
                            googleCalendarId: googleEvent.id,
                            source: 'google_calendar'
                        }
                    });
                    return { isNew: true };
                }
            });

            return result || { imported: 0, updated: 0, errors: [] };
        } catch (error) {
            console.error('[GoogleSyncOrchestrator] Calendar sync failed:', error);
            throw error;
        }
    }

    /**
     * Sincroniza tareas de Google Tasks con la app
     * @param {Object} store - Reference al store de la app
     * @returns {Promise<Object>} Resultado de la sincronización
     */
    async function syncTasksToApp(store) {
        if (!window.googleTasksApi?.isSyncEnabled?.()) {
            return { imported: 0, updated: 0, skipped: 'disabled' };
        }

        try {
            const localTasks = store?.state?.tasks || [];
            let imported = 0, updated = 0;

            const result = await window.googleTasksApi?.syncFromGoogle?.(async (googleTask) => {
                // Buscar si ya existe tarea local
                const existing = localTasks.find(t =>
                    t.googleTasksId === googleTask.id
                );

                if (existing) {
                    // Actualizar tarea existente
                    await store?.dispatch?.({
                        type: 'UPDATE_TASK',
                        payload: {
                            id: existing.id,
                            title: googleTask.title,
                            description: googleTask.notes,
                            dueDate: googleTask.due,
                            completed: googleTask.status === 'completed',
                            googleTasksId: googleTask.id
                        }
                    });
                    return { isUpdated: true };
                } else {
                    // Crear nueva tarea
                    await store?.dispatch?.({
                        type: 'ADD_TASK',
                        payload: {
                            title: googleTask.title || 'Sin título',
                            description: googleTask.notes || '',
                            dueDate: googleTask.due,
                            completed: googleTask.status === 'completed',
                            googleTasksId: googleTask.id,
                            source: 'google_tasks'
                        }
                    });
                    return { isNew: true };
                }
            });

            return result || { imported: 0, updated: 0, errors: [] };
        } catch (error) {
            console.error('[GoogleSyncOrchestrator] Tasks sync failed:', error);
            throw error;
        }
    }

    /**
     * Sincroniza eventos locales a Google Calendar
     * @param {Array} sessions - Sesiones a sincronizar
     * @returns {Promise<Object>} Resultado de la sincronización
     */
    async function syncAppCalendarToGoogle(sessions = []) {
        if (!window.googleCalendarApi?.isSyncEnabled?.()) {
            return { synced: 0, skipped: 0 };
        }

        let synced = 0, skipped = 0, errors = [];

        for (const session of sessions) {
            try {
                if (session.googleCalendarId) {
                    // Actualizar evento existente
                    await window.googleCalendarApi?.updateEvent?.(
                        session.googleCalendarId,
                        {
                            title: session.title,
                            description: session.description,
                            startDate: session.startTime,
                            endDate: session.endTime
                        }
                    );
                    synced++;
                } else {
                    // Crear nuevo evento
                    const created = await window.googleCalendarApi?.createEvent?.({
                        title: session.title,
                        description: session.description,
                        startDate: session.startTime,
                        endDate: session.endTime
                    });
                    synced++;
                }
            } catch (error) {
                console.error('[GoogleSyncOrchestrator] Session sync failed:', error);
                errors.push({ id: session.id, error: error.message });
                skipped++;
            }
        }

        return { synced, skipped, errors };
    }

    /**
     * Sincroniza tareas locales a Google Tasks
     * @param {Array} tasks - Tareas a sincronizar
     * @returns {Promise<Object>} Resultado de la sincronización
     */
    async function syncAppTasksToGoogle(tasks = []) {
        if (!window.googleTasksApi?.isSyncEnabled?.()) {
            return { synced: 0, skipped: 0 };
        }

        let synced = 0, skipped = 0, errors = [];

        for (const task of tasks) {
            try {
                if (task.googleTasksId) {
                    // Actualizar tarea existente
                    await window.googleTasksApi?.updateTask?.(
                        null, // usa getTaskListId()
                        task.googleTasksId,
                        {
                            title: task.title,
                            description: task.description,
                            dueDate: task.dueDate,
                            completed: task.completed
                        }
                    );
                    synced++;
                } else {
                    // Crear nueva tarea
                    const created = await window.googleTasksApi?.createTask?.({
                        title: task.title,
                        description: task.description,
                        dueDate: task.dueDate,
                        completed: task.completed
                    });
                    synced++;
                }
            } catch (error) {
                console.error('[GoogleSyncOrchestrator] Task sync failed:', error);
                errors.push({ id: task.id, error: error.message });
                skipped++;
            }
        }

        return { synced, skipped, errors };
    }

    /**
     * Ejecuta un ciclo completo de sincronización
     * @param {Object} store - Reference al store de la app
     * @param {Object} options - Opciones de sincronización
     * @returns {Promise<Object>} Resultado completo de la sincronización
     */
    async function executeFullSync(store, options = {}) {
        if (isRunning) {
            console.warn('[GoogleSyncOrchestrator] Sync already running');
            return getStatus();
        }

        isRunning = true;
        updateStatus({ isRunning: true });

        try {
            const results = {
                calendar: { imported: 0, updated: 0, synced: 0, skipped: 0, errors: [] },
                tasks: { imported: 0, updated: 0, synced: 0, skipped: 0, errors: [] }
            };

            // Sincronizar DE Google
            if (options.pullCalendar !== false) {
                const calResult = await syncCalendarToApp(store);
                results.calendar.imported = calResult.imported || 0;
                results.calendar.updated = calResult.updated || 0;
                results.calendar.errors = calResult.errors || [];
            }

            if (options.pullTasks !== false) {
                const taskResult = await syncTasksToApp(store);
                results.tasks.imported = taskResult.imported || 0;
                results.tasks.updated = taskResult.updated || 0;
                results.tasks.errors = taskResult.errors || [];
            }

            // Sincronizar HACIA Google
            if (options.pushCalendar !== false && store?.state?.sessions) {
                const calSyncResult = await syncAppCalendarToGoogle(store.state.sessions);
                results.calendar.synced = calSyncResult.synced || 0;
                results.calendar.skipped = calSyncResult.skipped || 0;
            }

            if (options.pushTasks !== false && store?.state?.tasks) {
                const taskSyncResult = await syncAppTasksToGoogle(store.state.tasks);
                results.tasks.synced = taskSyncResult.synced || 0;
                results.tasks.skipped = taskSyncResult.skipped || 0;
            }

            lastError = null;
            updateStatus({
                isRunning: false,
                calendar: {
                    synced: true,
                    lastSync: Date.now(),
                    eventCount: results.calendar.imported + results.calendar.updated,
                    enabled: window.googleCalendarApi?.isSyncEnabled?.() || false
                },
                tasks: {
                    synced: true,
                    lastSync: Date.now(),
                    taskCount: results.tasks.imported + results.tasks.updated,
                    enabled: window.googleTasksApi?.isSyncEnabled?.() || false
                }
            });

            console.log('[GoogleSyncOrchestrator] Sync completed:', results);
            return results;
        } catch (error) {
            lastError = error;
            console.error('[GoogleSyncOrchestrator] Sync failed:', error);
            updateStatus({
                isRunning: false,
                lastError: error.message
            });
            throw error;
        } finally {
            isRunning = false;
        }
    }

    /**
     * Inicializa el orquestador con un token de acceso
     * @param {string} accessToken - Token de acceso a Google
     */
    function initialize(accessToken) {
        if (window.googleCalendarApi?.initialize) {
            window.googleCalendarApi.initialize(accessToken);
        }
        if (window.googleTasksApi?.initialize) {
            window.googleTasksApi.initialize(accessToken);
        }
        console.log('[GoogleSyncOrchestrator] Initialized');
    }

    return {
        initialize,
        executeFullSync,
        syncCalendarToApp,
        syncTasksToApp,
        syncAppCalendarToGoogle,
        syncAppTasksToGoogle,
        getStatus,
        updateStatus,
        onSyncStatusChange,
        isRunning: () => isRunning,
        getLastError: () => lastError
    };
})();
