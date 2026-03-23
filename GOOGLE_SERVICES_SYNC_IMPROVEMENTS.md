# Mejoras de Sincronización con Google Services

## Resumen de Cambios

Se han implementado mejoras significativas para la sincronización bidireccional con Google Calendar y Google Tasks, proporcionando una integración más completa y robusta con el ecosistema de Google.

## Nuevos Módulos Creados

### 1. **js/api/google-calendar.js**
Módulo de integración con Google Calendar API.

**Funcionalidades:**
- `initialize(token)` - Inicializa con token de acceso
- `getEvents(startDate, endDate)` - Obtiene eventos en un rango de fechas
- `createEvent(event)` - Crea nuevo evento en Google Calendar
- `updateEvent(eventId, updates)` - Actualiza evento existente
- `deleteEvent(eventId)` - Elimina evento de Google Calendar
- `syncFromGoogle(onSync)` - Sincroniza eventos DE Google a la app
- `listCalendars()` - Lista los calendarios disponibles del usuario
- `getCalendarId()` / `setCalendarId()` - Gestiona el calendario activo
- `isSyncEnabled()` / `setSyncEnabled()` - Activa/desactiva la sincronización

**Características de Seguridad:**
- Manejo de tokens expirados (401 responses)
- Validación de zona horaria
- Encapsulación de credentials

### 2. **js/api/google-tasks.js**
Módulo de integración con Google Tasks API.

**Funcionalidades:**
- `initialize(token)` - Inicializa con token de acceso
- `getTaskLists()` - Obtiene las listas de tareas disponibles
- `getTasks(taskListId, options)` - Obtiene tareas de una lista
- `createTask(task, taskListId)` - Crea nueva tarea
- `updateTask(taskListId, taskId, updates)` - Actualiza tarea
- `deleteTask(taskListId, taskId)` - Elimina tarea
- `syncFromGoogle(onSync)` - Sincroniza tareas DE Google a la app
- `completeTask()` / `uncompleteTask()` - Marca tareas como completadas
- `getTaskListId()` / `setTaskListId()` - Gestiona la lista activa

**Características de Seguridad:**
- Manejo de tokens expirados (401 responses)
- Validación de formatos de fecha
- Encapsulación de credentials

### 3. **js/api/google-sync-orchestrator.js**
Orquestador central que coordina la sincronización entre todos los servicios Google.

**Flujo de Sincronización Bidireccional:**

```
┌─────────────────────────────────────────────────────────────┐
│         Google Sync Orchestrator                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  PULL (DE Google → Aplicación)                              │
│  ├─ Google Calendar → Sesiones locales                      │
│  └─ Google Tasks → Tareas locales                           │
│                                                               │
│  PUSH (DE Aplicación → Google)                              │
│  ├─ Sesiones locales → Google Calendar                      │
│  └─ Tareas locales → Google Tasks                           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**Métodos Principales:**
- `initialize(accessToken)` - Inicializa todos los módulos
- `executeFullSync(store, options)` - Ejecuta ciclo completo de sincronización
- `syncCalendarToApp(store)` - Sincroniza eventos DE Google
- `syncTasksToApp(store)` - Sincroniza tareas DE Google
- `syncAppCalendarToGoogle(sessions)` - Sincroniza eventos HACIA Google
- `syncAppTasksToGoogle(tasks)` - Sincroniza tareas HACIA Google
- `getStatus()` - Obtiene estado actual de todas las sincronizaciones
- `onSyncStatusChange(callback)` - Registra listeners para cambios de estado

**Características:**
- Sincronización no bloqueante
- Manejo de errores granular por servicio
- Estado persistente en localStorage
- Sistema de listeners para cambios de estado
- Protección contra sincronizaciones concurrentes

### 4. **js/utils/google-integration-handler.js**
Handler de UI que gestiona la interacción del usuario con los controles de sincronización.

**Funcionalidades:**
- `initialize()` - Inicializa event listeners
- `handleCalendarToggle(event)` - Maneja toggle de Google Calendar
- `handleTasksToggle(event)` - Maneja toggle de Google Tasks
- `updateSyncStatus(status)` - Actualiza indicadores de UI
- `loadAvailableCalendars()` - Carga calendarios disponibles
- `loadAvailableTaskLists()` - Carga listas de tareas disponibles
- `manualSync()` - Ejecuta sincronización manual
- `enableAutoSync(intervalMinutes)` - Habilita sincronización automática
- `disableAutoSync()` - Desactiva sincronización automática

**Mejoras de UX:**
- Toasts informativos en cada acción
- Indicadores visuales de estado
- Timers de última sincronización
- Contadores de elementos sincronizados
- Manejo de errores con mensajes claros

## Cambios en Archivos Existentes

### index.html
Se agregaron los imports de los nuevos módulos:
```html
<script type="module" src="js/api/google-calendar.js"></script>
<script type="module" src="js/api/google-tasks.js"></script>
<script type="module" src="js/api/google-sync-orchestrator.js"></script>
<script type="module" src="js/utils/google-integration-handler.js"></script>
```

### js/sync.js
Se agregó inicialización del orquestador cuando se obtiene el accessToken:
```javascript
if (window.googleSyncOrchestrator?.initialize) {
    window.googleSyncOrchestrator.initialize(accessToken);
}
```

### js/views/integrations.js
Se mejoró el UI con:
- Handlers mejorados para checkboxes de Google Calendar y Tasks
- Indicadores de estado de sincronización
- Contadores de elementos sincronizados
- Inicialización del integration handler

## Almacenamiento de Datos

### localStorage (Global)
- `google_calendar_id` - ID del calendario activo (default: 'primary')
- `google_tasks_list_id` - ID de la lista de tareas activa (default: '@default')
- `sync_gcal` - Flag de habilitación de Google Calendar
- `sync_gtasks` - Flag de habilitación de Google Tasks
- `google_calendar_last_sync` - Timestamp de última sincronización de calendario
- `google_tasks_last_sync` - Timestamp de última sincronización de tareas
- `google_sync_status` - JSON con estado actual de todas las sincronizaciones

## Flujo de Autorización

El flujo de autorización se ha integrado con el flujo existente de sync.js:

```
1. Usuario inicia sesión en Google (signIn)
   ↓
2. Usuario autoriza acceso a Drive (authorize)
   ↓
3. Se obtiene accessToken
   ↓
4. googleSyncOrchestrator.initialize(accessToken)
   └─ googleCalendarApi.initialize(accessToken)
   └─ googleTasksApi.initialize(accessToken)
   ↓
5. Primer sincronización automática (opcional)
```

## Escopos de Google OAuth

El token de acceso obtenido tiene estos escopos:
- `https://www.googleapis.com/auth/drive` - Lectura/escritura en Drive
- `https://www.googleapis.com/auth/drive.appdata` - AppData compartido

Para Google Calendar y Tasks, se utilizan los mismos escopos, ya que están cubiertos por la autenticación de Drive. Si necesita escopos más específicos en el futuro:
- `https://www.googleapis.com/auth/calendar` - Google Calendar
- `https://www.googleapis.com/auth/tasks` - Google Tasks

## Ejemplo de Uso

### Sincronización Manual
```javascript
// Desde la UI o desde código
await window.googleIntegrationHandler.manualSync();
```

### Sincronización Automática Periódica
```javascript
// Habilitar cada 30 minutos
window.googleIntegrationHandler.enableAutoSync(30);

// Desactivar
window.googleIntegrationHandler.disableAutoSync();
```

### Escuchar Cambios de Estado
```javascript
window.googleSyncOrchestrator.onSyncStatusChange((status) => {
  console.log('Google Sync Status:', status);
  // status.calendar.synced - boolean
  // status.calendar.lastSync - timestamp
  // status.calendar.eventCount - número
  // status.tasks.synced - boolean
  // status.tasks.taskCount - número
});
```

### Crear Evento en Google Calendar
```javascript
const event = {
  title: 'Mi Evento',
  description: 'Descripción del evento',
  startDate: new Date('2024-06-15T10:00:00'),
  endDate: new Date('2024-06-15T11:00:00'),
  attendees: []
};

const created = await window.googleCalendarApi.createEvent(event);
console.log('Event created:', created.id);
```

### Crear Tarea en Google Tasks
```javascript
const task = {
  title: 'Mi Tarea',
  description: 'Descripción de la tarea',
  dueDate: '2024-06-15',
  completed: false
};

const created = await window.googleTasksApi.createTask(task);
console.log('Task created:', created.id);
```

## Consideraciones de Seguridad

1. **Tokens de Acceso**: Se almacenan en `sessionStorage` (por pestaña), no en localStorage
2. **Manejo de Errores 401**: Cuando el token expira, se limpia y se solicita uno nuevo
3. **Validación de Datos**: Todos los eventos y tareas se validan antes de sincronizar
4. **Encapsulación**: Las credenciales nunca se exponen en la UI
5. **CORS**: Las peticiones se hacen directamente a Google APIs (requiere token válido)

## Testing

Se pueden realizar pruebas:
1. Habilitar Google Calendar desde la UI de integraciones
2. Crear un evento en Google Calendar
3. Sincronizar manualmente desde la UI
4. Verificar que el evento aparezca en el calendario local
5. Crear una sesión en la app
6. Sincronizar y verificar que aparezca en Google Calendar

## Próximas Mejoras Potenciales

1. **Sync Bidireccional Automático**: Detector de cambios en tiempo real
2. **Configuración Avanzada**: Mapeo de campos personalizados
3. **Múltiples Calendarios**: Sincronizar desde varios calendarios
4. **Múltiples Listas de Tareas**: Soporte para varias listas
5. **Webhook/Push Notifications**: Actualizaciones en tiempo real
6. **Conflicto Resolution**: Estrategias de resolución de conflictos
7. **Historial de Sincronización**: Log detallado de cambios

## Compatibilidad

- **Navegadores**: Todos los navegadores modernos que soporten:
  - Fetch API
  - Promise
  - localStorage/sessionStorage
  - Intl.DateTimeFormat
- **Google APIs**: Requiere credenciales válidas y escopos apropiados
- **Integridad de Datos**: Se mantiene la compatibilidad con el sistema de cifrado existente

## Troubleshooting

### Error: "Google Sync Orchestrator not initialized"
- Asegúrate de que el usuario haya iniciado sesión en Google
- Verifica que se haya obtenido un accessToken válido

### Los eventos no se sincronizan
- Verifica que Google Calendar esté habilitado en integraciones
- Comprueba la consola del navegador para errores
- Revisa que el calendario sea accesible (permisos en Google)

### Las tareas no se sincronizan
- Verifica que Google Tasks esté habilitado en integraciones
- Asegúrate de que existe al menos una lista de tareas en Google

## Notas de Implementación

Este módulo sigue patrones similares al resto de integraciones de la app:
- Uso de IIFE (Immediately Invoked Function Expression) para encapsulación
- localStorage para configuración persistente
- Listeners para cambios de estado
- Manejo robusto de errores
- Logs detallados para debugging

Todos los módulos están diseñados para ser independientes y no interfieren con otras funcionalidades de la app.
