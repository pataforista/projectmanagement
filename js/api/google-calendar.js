/**
 * js/api/google-calendar.js
 * Google Calendar API Integration
 *
 * Proporciona funcionalidad para sincronizar eventos entre la app y Google Calendar.
 */

const googleCalendarApi = (() => {
    const CALENDAR_API_KEY_STORAGE = 'google_calendar_api_key';
    const CALENDAR_ID_STORAGE = 'google_calendar_id';
    const CALENDAR_SYNC_ENABLED = 'sync_gcal';
    const CALENDAR_LAST_SYNC = 'google_calendar_last_sync';

    let isInitialized = false;
    let accessToken = null;

    /**
     * Inicializa el token de acceso desde la sesión
     */
    function initialize(token) {
        if (!token) {
            console.warn('[GoogleCalendar] No access token provided');
            return false;
        }
        accessToken = token;
        isInitialized = true;
        return true;
    }

    /**
     * Obtiene el ID del calendario (por defecto 'primary')
     */
    function getCalendarId() {
        return localStorage.getItem(CALENDAR_ID_STORAGE) || 'primary';
    }

    /**
     * Establece el ID del calendario
     */
    function setCalendarId(calendarId) {
        localStorage.setItem(CALENDAR_ID_STORAGE, calendarId);
    }

    /**
     * Verifica si la sincronización de calendario está habilitada
     */
    function isSyncEnabled() {
        return localStorage.getItem(CALENDAR_SYNC_ENABLED) === 'true';
    }

    /**
     * Habilita/deshabilita la sincronización de calendario
     */
    function setSyncEnabled(enabled) {
        localStorage.setItem(CALENDAR_SYNC_ENABLED, enabled ? 'true' : 'false');
    }

    /**
     * Obtiene eventos del calendario para un rango de fechas
     * @param {Date} startDate - Fecha de inicio
     * @param {Date} endDate - Fecha de fin
     * @returns {Promise<Array>} Lista de eventos
     */
    async function getEvents(startDate, endDate) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Calendar API not initialized');
        }

        const timeMin = startDate.toISOString();
        const timeMax = endDate.toISOString();
        const calendarId = getCalendarId();

        try {
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
                `timeMin=${encodeURIComponent(timeMin)}&` +
                `timeMax=${encodeURIComponent(timeMax)}&` +
                `singleEvents=true&` +
                `orderBy=startTime`,
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
                    throw new Error('Google Calendar access token expired');
                }
                throw new Error(`Google Calendar API error: ${response.statusText}`);
            }

            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('[GoogleCalendar] Error fetching events:', error);
            throw error;
        }
    }

    /**
     * Crea un evento en Google Calendar
     * @param {Object} event - Evento a crear
     * @returns {Promise<Object>} Evento creado
     */
    async function createEvent(event) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Calendar API not initialized');
        }

        const calendarId = getCalendarId();

        // Normalizar estructura del evento
        const normalizedEvent = {
            summary: event.title || event.summary || '',
            description: event.description || '',
            start: {
                dateTime: event.startDate ? new Date(event.startDate).toISOString() : new Date().toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
            },
            end: {
                dateTime: event.endDate ? new Date(event.endDate).toISOString() : new Date(Date.now() + 3600000).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
            },
            attendees: event.attendees || [],
            transparency: event.busy !== false ? 'opaque' : 'transparent'
        };

        try {
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(normalizedEvent)
                }
            );

            if (!response.ok) {
                if (response.status === 401) {
                    accessToken = null;
                    throw new Error('Google Calendar access token expired');
                }
                throw new Error(`Failed to create event: ${response.statusText}`);
            }

            const created = await response.json();
            console.log('[GoogleCalendar] Event created:', created.id);
            return created;
        } catch (error) {
            console.error('[GoogleCalendar] Error creating event:', error);
            throw error;
        }
    }

    /**
     * Actualiza un evento en Google Calendar
     * @param {string} eventId - ID del evento
     * @param {Object} updates - Campos a actualizar
     * @returns {Promise<Object>} Evento actualizado
     */
    async function updateEvent(eventId, updates) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Calendar API not initialized');
        }

        const calendarId = getCalendarId();

        try {
            // Primero obtener el evento actual
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to fetch event: ${response.statusText}`);
            }

            const event = await response.json();

            // Aplicar actualizaciones
            if (updates.title) event.summary = updates.title;
            if (updates.description) event.description = updates.description;
            if (updates.startDate) {
                event.start = {
                    dateTime: new Date(updates.startDate).toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                };
            }
            if (updates.endDate) {
                event.end = {
                    dateTime: new Date(updates.endDate).toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                };
            }

            // Actualizar evento
            const updateResponse = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(event)
                }
            );

            if (!updateResponse.ok) {
                if (updateResponse.status === 401) {
                    accessToken = null;
                    throw new Error('Google Calendar access token expired');
                }
                throw new Error(`Failed to update event: ${updateResponse.statusText}`);
            }

            const updated = await updateResponse.json();
            console.log('[GoogleCalendar] Event updated:', eventId);
            return updated;
        } catch (error) {
            console.error('[GoogleCalendar] Error updating event:', error);
            throw error;
        }
    }

    /**
     * Elimina un evento de Google Calendar
     * @param {string} eventId - ID del evento
     * @returns {Promise<void>}
     */
    async function deleteEvent(eventId) {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Calendar API not initialized');
        }

        const calendarId = getCalendarId();

        try {
            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
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
                    throw new Error('Google Calendar access token expired');
                }
                throw new Error(`Failed to delete event: ${response.statusText}`);
            }

            console.log('[GoogleCalendar] Event deleted:', eventId);
        } catch (error) {
            console.error('[GoogleCalendar] Error deleting event:', error);
            throw error;
        }
    }

    /**
     * Sincroniza eventos desde Google Calendar a la app
     * @param {Function} onSync - Callback cuando se importa un evento
     * @returns {Promise<Object>} Resultado de la sincronización
     */
    async function syncFromGoogle(onSync) {
        if (!isSyncEnabled()) {
            return { imported: 0, updated: 0, errors: [] };
        }

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        try {
            const events = await getEvents(thirtyDaysAgo, ninetyDaysFromNow);
            let imported = 0, updated = 0, errors = [];

            for (const event of events) {
                try {
                    if (onSync) {
                        const result = await onSync(event);
                        if (result.isNew) imported++;
                        else if (result.isUpdated) updated++;
                    }
                } catch (error) {
                    console.error('[GoogleCalendar] Error syncing event:', error);
                    errors.push(error.message);
                }
            }

            localStorage.setItem(CALENDAR_LAST_SYNC, Date.now().toString());
            return { imported, updated, errors, total: events.length };
        } catch (error) {
            console.error('[GoogleCalendar] Sync failed:', error);
            throw error;
        }
    }

    /**
     * Obtiene los calendarios disponibles del usuario
     * @returns {Promise<Array>} Lista de calendarios
     */
    async function listCalendars() {
        if (!isInitialized || !accessToken) {
            throw new Error('Google Calendar API not initialized');
        }

        try {
            const response = await fetch(
                'https://www.googleapis.com/calendar/v3/users/me/calendarList',
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
                    throw new Error('Google Calendar access token expired');
                }
                throw new Error(`Failed to list calendars: ${response.statusText}`);
            }

            const data = await response.json();
            return data.items || [];
        } catch (error) {
            console.error('[GoogleCalendar] Error listing calendars:', error);
            throw error;
        }
    }

    return {
        initialize,
        getCalendarId,
        setCalendarId,
        isSyncEnabled,
        setSyncEnabled,
        getEvents,
        createEvent,
        updateEvent,
        deleteEvent,
        syncFromGoogle,
        listCalendars
    };
})();
