/**
 * js/api/google-tasks.js
 * Google Tasks API Integration
 *
 * Proporciona funcionalidad para sincronizar tareas entre la app y Google Tasks.
 */

const googleTasksApi = (() => {
    const TASKS_API_KEY_STORAGE = 'google_tasks_api_key';
    const TASKS_LIST_ID_STORAGE = 'google_tasks_list_id';
    const TASKS_SYNC_ENABLED = 'sync_gtasks';
    const TASKS_LAST_SYNC = 'google_tasks_last_sync';

    let isInitialized = false;
    let accessToken = null;

    /**
     * Inicializa el token de acceso desde la sesión
     */
    function initialize(token) {
        if (!token) {
            console.warn('[GoogleTasks] No access token provided');
            return false;
        }
        accessToken = token;
        isInitialized = true;
        return true;
    }

    /**
     * Obtiene el ID de la lista de tareas
     */
    function getTaskListId() {
        return localStorage.getItem(TASKS_LIST_ID_STORAGE) || '@default';
    }

    /**
     * Establece el ID de la lista de tareas
     */
    function setTaskListId(taskListId) {
        localStorage.setItem(TASKS_LIST_ID_STORAGE, taskListId);
    }

    /**
     * Verifica si la sincronización de tareas está habilitada
     */
    function isSyncEnabled() {
        return localStorage.getItem(TASKS_SYNC_ENABLED) === 'true';
    }

    /**
     * Habilita/deshabilita la sincronización de tareas
     */
    function setSyncEnabled(enabled) {
        localStorage.setItem(TASKS_SYNC_ENABLED, enabled ? 'true' : 'false');
    }

    /**
     * Obtiene las listas de tareas disponibles
     * @returns {Promise<Array>} Lista de listas de tareas
     */
    async function getTaskLists() {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Tasks API not initialized');
        }

        try {
            const response = await fetch(
                'https://www.googleapis.com/tasks/v1/users/@me/lists',
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    accessToken = null;
                    throw new Error('Google Tasks access token expired');
                }
                throw new Error(`Failed to fetch task lists: ${response.statusText}`);
            }

            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('[GoogleTasks] Error fetching task lists:', error);
            throw error;
        }
    }

    /**
     * Obtiene todas las tareas de una lista
     * @param {string} taskListId - ID de la lista
     * @param {Object} options - Opciones de filtrado (showCompleted, showDeleted, etc.)
     * @returns {Promise<Array>} Lista de tareas
     */
    async function getTasks(taskListId = null, options = {}) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Tasks API not initialized');
        }

        taskListId = taskListId || getTaskListId();
        const query = new URLSearchParams({
            showCompleted: options.showCompleted !== false,
            showHidden: options.showHidden !== false,
            ...options
        });

        try {
            const response = await fetch(
                `https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?${query}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    accessToken = null;
                    throw new Error('Google Tasks access token expired');
                }
                throw new Error(`Failed to fetch tasks: ${response.statusText}`);
            }

            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('[GoogleTasks] Error fetching tasks:', error);
            throw error;
        }
    }

    /**
     * Crea una tarea en Google Tasks
     * @param {Object} task - Tarea a crear
     * @param {string} taskListId - ID de la lista (opcional)
     * @returns {Promise<Object>} Tarea creada
     */
    async function createTask(task, taskListId = null) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Tasks API not initialized');
        }

        taskListId = taskListId || getTaskListId();

        const normalizedTask = {
            title: task.title || task.summary || '',
            notes: task.description || task.notes || '',
            due: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : undefined,
            status: task.completed ? 'completed' : 'needsAction'
        };

        // Remover campos undefined
        Object.keys(normalizedTask).forEach(key =>
            normalizedTask[key] === undefined && delete normalizedTask[key]
        );

        try {
            const response = await fetch(
                `https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(normalizedTask)
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    accessToken = null;
                    throw new Error('Google Tasks access token expired');
                }
                throw new Error(`Failed to create task: ${response.statusText}`);
            }

            const created = await response.json();
            console.log('[GoogleTasks] Task created:', created.id);
            return created;
        } catch (error) {
            console.error('[GoogleTasks] Error creating task:', error);
            throw error;
        }
    }

    /**
     * Actualiza una tarea en Google Tasks
     * @param {string} taskListId - ID de la lista
     * @param {string} taskId - ID de la tarea
     * @param {Object} updates - Campos a actualizar
     * @returns {Promise<Object>} Tarea actualizada
     */
    async function updateTask(taskListId, taskId, updates) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Tasks API not initialized');
        }

        taskListId = taskListId || getTaskListId();

        try {
            // Obtener tarea actual
            const response = await fetch(
                `https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch task: ${response.statusText}`);
            }

            const task = await response.json();

            // Aplicar actualizaciones
            if (updates.title) task.title = updates.title;
            if (updates.description) task.notes = updates.description;
            if (updates.dueDate) task.due = new Date(updates.dueDate).toISOString().split('T')[0];
            if (updates.completed !== undefined) {
                task.status = updates.completed ? 'completed' : 'needsAction';
            }

            // Actualizar tarea
            const updateResponse = await fetch(
                `https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(task)
                }
            );

            if (!updateResponse.ok) {
                if (updateResponse.status === 401) {
                    accessToken = null;
                    throw new Error('Google Tasks access token expired');
                }
                throw new Error(`Failed to update task: ${updateResponse.statusText}`);
            }

            const updated = await updateResponse.json();
            console.log('[GoogleTasks] Task updated:', taskId);
            return updated;
        } catch (error) {
            console.error('[GoogleTasks] Error updating task:', error);
            throw error;
        }
    }

    /**
     * Elimina una tarea de Google Tasks
     * @param {string} taskListId - ID de la lista
     * @param {string} taskId - ID de la tarea
     * @returns {Promise<void>}
     */
    async function deleteTask(taskListId, taskId) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Tasks API not initialized');
        }

        taskListId = taskListId || getTaskListId();

        try {
            const response = await fetch(
                `https://www.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    accessToken = null;
                    throw new Error('Google Tasks access token expired');
                }
                throw new Error(`Failed to delete task: ${response.statusText}`);
            }

            console.log('[GoogleTasks] Task deleted:', taskId);
        } catch (error) {
            console.error('[GoogleTasks] Error deleting task:', error);
            throw error;
        }
    }

    /**
     * Sincroniza tareas desde Google Tasks a la app
     * @param {Function} onSync - Callback cuando se importa una tarea
     * @returns {Promise<Object>} Resultado de la sincronización
     */
    async function syncFromGoogle(onSync) {
        if (!isSyncEnabled()) {
            return { imported: 0, updated: 0, errors: [] };
        }

        try {
            const tasks = await getTasks(null, { showCompleted: true });
            let imported = 0, updated = 0, errors = [];

            for (const task of tasks) {
                try {
                    if (onSync) {
                        const result = await onSync(task);
                        if (result.isNew) imported++;
                        else if (result.isUpdated) updated++;
                    }
                } catch (error) {
                    console.error('[GoogleTasks] Error syncing task:', error);
                    errors.push(error.message);
                }
            }

            localStorage.setItem(TASKS_LAST_SYNC, Date.now().toString());
            return { imported, updated, errors, total: tasks.length };
        } catch (error) {
            console.error('[GoogleTasks] Sync failed:', error);
            throw error;
        }
    }

    /**
     * Marca una tarea como completada
     * @param {string} taskListId - ID de la lista
     * @param {string} taskId - ID de la tarea
     * @returns {Promise<Object>} Tarea actualizada
     */
    async function completeTask(taskListId, taskId) {
        return updateTask(taskListId, taskId, { completed: true });
    }

    /**
     * Marca una tarea como no completada
     * @param {string} taskListId - ID de la lista
     * @param {string} taskId - ID de la tarea
     * @returns {Promise<Object>} Tarea actualizada
     */
    async function uncompleteTask(taskListId, taskId) {
        return updateTask(taskListId, taskId, { completed: false });
    }

    return {
        initialize,
        getTaskListId,
        setTaskListId,
        isSyncEnabled,
        setSyncEnabled,
        getTaskLists,
        getTasks,
        createTask,
        updateTask,
        deleteTask,
        syncFromGoogle,
        completeTask,
        uncompleteTask
    };
})();
