/**
 * js/utils/google-integration-handler.js
 * Google Services Integration UI Handler
 *
 * Maneja la interacción del usuario con los checkboxes de sincronización
 * de Google Calendar y Google Tasks en la vista de integraciones.
 */

const googleIntegrationHandler = (() => {
    /**
     * Inicializa los event listeners para Google Calendar y Tasks
     */
    function initialize() {
        // Google Calendar toggle
        const calendarToggle = document.getElementById('sync-google-calendar');
        if (calendarToggle) {
            calendarToggle.addEventListener('change', handleCalendarToggle);
        }

        // Google Tasks toggle
        const tasksToggle = document.getElementById('sync-google-tasks');
        if (tasksToggle) {
            tasksToggle.addEventListener('change', handleTasksToggle);
        }

        // Monitorear cambios de sincronización
        if (window.googleSyncOrchestrator?.onSyncStatusChange) {
            window.googleSyncOrchestrator.onSyncStatusChange(updateSyncStatus);
        }

        updateSyncStatus(window.googleSyncOrchestrator?.getStatus?.());
    }

    /**
     * Maneja el toggle de Google Calendar
     */
    async function handleCalendarToggle(event) {
        const enabled = event.target.checked;

        try {
            if (window.googleCalendarApi?.setSyncEnabled) {
                window.googleCalendarApi.setSyncEnabled(enabled);

                if (enabled) {
                    showToast('Google Calendar sincronización habilitada', 'success');

                    // Iniciar sincronización si hay token disponible
                    if (window.googleSyncOrchestrator) {
                        try {
                            await window.googleSyncOrchestrator.syncCalendarToApp(window.store);
                            showToast('Eventos de Google Calendar importados', 'success');
                        } catch (error) {
                            console.error('Error syncing calendar:', error);
                            showToast('Error al sincronizar calendario: ' + error.message, 'error');
                        }
                    }
                } else {
                    showToast('Google Calendar sincronización deshabilitada', 'info');
                }
            }
        } catch (error) {
            console.error('[GoogleIntegrationHandler] Calendar toggle error:', error);
            event.target.checked = !enabled;
            showToast('Error al cambiar configuración de calendario', 'error');
        }
    }

    /**
     * Maneja el toggle de Google Tasks
     */
    async function handleTasksToggle(event) {
        const enabled = event.target.checked;

        try {
            if (window.googleTasksApi?.setSyncEnabled) {
                window.googleTasksApi.setSyncEnabled(enabled);

                if (enabled) {
                    showToast('Google Tasks sincronización habilitada', 'success');

                    // Iniciar sincronización si hay token disponible
                    if (window.googleSyncOrchestrator) {
                        try {
                            await window.googleSyncOrchestrator.syncTasksToApp(window.store);
                            showToast('Tareas de Google Tasks importadas', 'success');
                        } catch (error) {
                            console.error('Error syncing tasks:', error);
                            showToast('Error al sincronizar tareas: ' + error.message, 'error');
                        }
                    }
                } else {
                    showToast('Google Tasks sincronización deshabilitada', 'info');
                }
            }
        } catch (error) {
            console.error('[GoogleIntegrationHandler] Tasks toggle error:', error);
            event.target.checked = !enabled;
            showToast('Error al cambiar configuración de tareas', 'error');
        }
    }

    /**
     * Actualiza el UI con el estado de sincronización
     */
    function updateSyncStatus(status) {
        if (!status) return;

        // Actualizar indicadores de calendario
        if (status.calendar) {
            const calIndicator = document.querySelector('[data-sync-type="calendar"] .sync-status-indicator');
            if (calIndicator) {
                calIndicator.textContent = status.calendar.synced ? '✓ Sincronizado' : 'Pendiente';
                calIndicator.className = `sync-status-indicator ${status.calendar.synced ? 'synced' : 'pending'}`;
            }

            const calCount = document.querySelector('[data-sync-type="calendar"] .sync-item-count');
            if (calCount && status.calendar.eventCount) {
                calCount.textContent = `${status.calendar.eventCount} eventos`;
            }

            const calTime = document.querySelector('[data-sync-type="calendar"] .sync-last-time');
            if (calTime && status.calendar.lastSync) {
                calTime.textContent = `Última sincronización: ${formatTime(new Date(status.calendar.lastSync))}`;
            }
        }

        // Actualizar indicadores de tareas
        if (status.tasks) {
            const taskIndicator = document.querySelector('[data-sync-type="tasks"] .sync-status-indicator');
            if (taskIndicator) {
                taskIndicator.textContent = status.tasks.synced ? '✓ Sincronizado' : 'Pendiente';
                taskIndicator.className = `sync-status-indicator ${status.tasks.synced ? 'synced' : 'pending'}`;
            }

            const taskCount = document.querySelector('[data-sync-type="tasks"] .sync-item-count');
            if (taskCount && status.tasks.taskCount) {
                taskCount.textContent = `${status.tasks.taskCount} tareas`;
            }

            const taskTime = document.querySelector('[data-sync-type="tasks"] .sync-last-time');
            if (taskTime && status.tasks.lastSync) {
                taskTime.textContent = `Última sincronización: ${formatTime(new Date(status.tasks.lastSync))}`;
            }
        }

        // Mostrar errores si hay
        if (status.lastError) {
            showToast('Error de sincronización: ' + status.lastError, 'error');
        }
    }

    /**
     * Formatea una fecha para mostrar el tiempo relativo
     */
    function formatTime(date) {
        const now = Date.now();
        const diff = now - date.getTime();

        if (diff < 60000) return 'hace unos segundos';
        if (diff < 3600000) return `hace ${Math.floor(diff / 60000)} minutos`;
        if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)} horas`;
        if (diff < 604800000) return `hace ${Math.floor(diff / 86400000)} días`;

        return date.toLocaleDateString();
    }

    /**
     * Muestra un toast al usuario
     */
    function showToast(message, type = 'info') {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`[Toast ${type}] ${message}`);
        }
    }

    /**
     * Obtiene la lista de calendarios disponibles
     */
    async function loadAvailableCalendars() {
        try {
            const calendars = await window.googleCalendarApi?.listCalendars?.();
            return calendars || [];
        } catch (error) {
            console.error('[GoogleIntegrationHandler] Error loading calendars:', error);
            return [];
        }
    }

    /**
     * Obtiene la lista de listas de tareas disponibles
     */
    async function loadAvailableTaskLists() {
        try {
            const lists = await window.googleTasksApi?.getTaskLists?.();
            return lists || [];
        } catch (error) {
            console.error('[GoogleIntegrationHandler] Error loading task lists:', error);
            return [];
        }
    }

    /**
     * Sincroniza todo manualmente
     */
    async function manualSync() {
        try {
            if (!window.googleSyncOrchestrator) {
                throw new Error('Google Sync Orchestrator not initialized');
            }

            showToast('Iniciando sincronización...', 'info');
            const result = await window.googleSyncOrchestrator.executeFullSync(window.store);

            const summary = [];
            if (result.calendar?.imported) summary.push(`${result.calendar.imported} eventos importados`);
            if (result.calendar?.synced) summary.push(`${result.calendar.synced} eventos sincronizados`);
            if (result.tasks?.imported) summary.push(`${result.tasks.imported} tareas importadas`);
            if (result.tasks?.synced) summary.push(`${result.tasks.synced} tareas sincronizadas`);

            const message = summary.length > 0
                ? `Sincronización completada: ${summary.join(', ')}`
                : 'Sincronización completada';

            showToast(message, 'success');
            return result;
        } catch (error) {
            console.error('[GoogleIntegrationHandler] Manual sync error:', error);
            showToast('Error en sincronización: ' + error.message, 'error');
            throw error;
        }
    }

    /**
     * Configura sincronización automática periódica
     */
    function enableAutoSync(intervalMinutes = 30) {
        if (window._googleAutoSyncTimer) {
            clearInterval(window._googleAutoSyncTimer);
        }

        window._googleAutoSyncTimer = setInterval(() => {
            const calEnabled = window.googleCalendarApi?.isSyncEnabled?.();
            const tasksEnabled = window.googleTasksApi?.isSyncEnabled?.();

            if (calEnabled || tasksEnabled) {
                manualSync().catch(error => {
                    console.error('[GoogleIntegrationHandler] Auto-sync failed:', error);
                });
            }
        }, intervalMinutes * 60 * 1000);

        console.log(`[GoogleIntegrationHandler] Auto-sync enabled (${intervalMinutes}min)`);
    }

    /**
     * Desactiva sincronización automática
     */
    function disableAutoSync() {
        if (window._googleAutoSyncTimer) {
            clearInterval(window._googleAutoSyncTimer);
            window._googleAutoSyncTimer = null;
        }
        console.log('[GoogleIntegrationHandler] Auto-sync disabled');
    }

    return {
        initialize,
        handleCalendarToggle,
        handleTasksToggle,
        updateSyncStatus,
        loadAvailableCalendars,
        loadAvailableTaskLists,
        manualSync,
        enableAutoSync,
        disableAutoSync
    };
})();
