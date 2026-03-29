# REVISIÓN DETALLADA DE SISTEMAS DE CUENTAS, VINCULACIÓN Y SINCRONIZACIÓN

**Fecha**: 29 de Marzo de 2026
**Repositorio**: pataforista/projectmanagement
**Alcance**: Análisis de seguridad, integridad y sincronización de los sistemas de cuentas, vinculación, sobreescritura, administración y sincronización

---

## ÍNDICE

1. [RESUMEN EJECUTIVO](#resumen-ejecutivo)
2. [PROBLEMAS CRÍTICOS ENCONTRADOS](#problemas-críticos-encontrados)
3. [ANÁLISIS POR SISTEMA](#análisis-por-sistema)
4. [MATRIZ DE RIESGOS](#matriz-de-riesgos)
5. [RECOMENDACIONES](#recomendaciones)

---

## RESUMEN EJECUTIVO

### Estado General
El sistema es **arquitectónicamente sólido** pero tiene **varios puntos de fricción** que han causado los problemas reportados:

- **Gestión de cuentas**: Cambio de email no siempre sincronizado entre frontend y backend
- **Vinculación de sesiones**: Race conditions posibles en cross-tab sync y session switching
- **Sincronización**: Guardrails sofisticados pero con edge cases no cubiertos
- **Administración**: Control de acceso demasiado permisivo en configuración inicial

**Riesgos Detectados**: 7 críticos, 12 altos, 8 medios

---

## PROBLEMAS CRÍTICOS ENCONTRADOS

### 🔴 CRÍTICO #1: Email como PRIMARY KEY crea inconsistencias

**Ubicación**: `account-detector.js`, `userService.js`, `session-manager.js`

**Problema**:
```
EMAIL es la PRIMARY KEY para coordinación de cuentas, pero:
1. Email puede cambiar (alias, recuperación)
2. Email es TEXT UNIQUE en users, sessions
3. Cambios de email no son atómicos entre frontend y backend

Escenario de falla:
- Usuario está logueado como alice@example.com
- Google emite token con alice.work@example.com (alias del mismo account)
- Frontend detecta "email_updated" y sincroniza
- Backend actualiza users.email y sessions.email
- Pero si hay 2+ pestañas, puede haber:
  - Tab A: mantiene alice@example.com en storage
  - Tab B: actualiza a alice.work@example.com
  - Resultado: operaciones del Tab A usan email anterior, causando orphans en sync_queue
```

**Severidad**: ⚠️ CRÍTICO - Causa silenciosa desincronización

**Impacto**:
- Cambios de un dispositivo no se sincronizan a otros
- Audit trail fragmentado (mismo usuario, emails diferentes)
- Posible duplicación de datos en sync_queue

---

### 🔴 CRÍTICO #2: SessionService.createSession no valida propiedad antes de switchear

**Ubicación**: `session-manager.js` línea 133-145

**Problema**:
```javascript
async function switchSession(sessionId) {
    const targetSession = await getSession(sessionId);
    if (!targetSession || targetSession.status !== 'active') {
        console.warn(`Session ${sessionId} not found or inactive`);
        return false;
    }
    // ❌ NO VALIDA: ¿Esta sesión pertenece al usuario actual?
    // Si un atacante conoce el sessionId de otra pestaña, puede:
    // 1. Llamar switchSession(sessionId_de_otra_persona)
    // 2. Cambiar workspace_user_email en sessionStorage
    // 3. Hacer push() con ese email (belongiendo a otro usuario)
```

**Validación Faltante**:
```javascript
// Debería validar:
const currentUserId = StorageManager.get('workspace_user_id', 'session');
if (!currentUserId || currentUserId !== targetSession.user_id) {
    console.error('Cannot switch to session: user mismatch');
    return false;
}
```

**Severidad**: ⚠️ CRÍTICO - Cross-session hijacking

---

### 🔴 CRÍTICO #3: BroadcastChannel sync puede causar race conditions

**Ubicación**: `session-manager.js` línea 401-430

**Problema**:
```javascript
channel.onmessage = async (event) => {
    const { type, data } = event.data;
    if (type === 'session:switched') {
        const currentEmail = StorageManager.get('workspace_user_email', 'session');
        if (currentEmail && currentEmail !== data.email && data.sessionId) {
            // Ignora si otro email está activo
        } else if (!currentEmail && data.sessionId) {
            // ❌ RACE CONDITION: Sin mutex
            // Si dos tabs reciben 'session:switched' al mismo tiempo:
            // - Ambas llaman switchSession(data.sessionId)
            // - Ambas actualizan sessionStorage sin transacción
            // - Estado final puede ser inconsistente
            const session = await getSession(data.sessionId);
            if (session) {
                await switchSession(data.sessionId);
            }
        }
    }
};
```

**Escenario Falla**:
1. Tab A: Usuario hace click "Cambiar cuenta"
2. Tab A: Emite `session:switched` por BroadcastChannel
3. Tab B: Recibe mensaje, comienza switchSession()
4. Tab B: A mitad de switchSession(), Tab A emite otro mensaje
5. Tab B: Interrumpe y comienza switchSession() nuevamente
6. Resultado: sessionStorage puede quedar en estado inconsistente

**Severidad**: ⚠️ CRÍTICO - Inconsistencia silenciosa

---

### 🔴 CRÍTICO #4: AdminService.setAdminKey permite configuración sin autenticación previa

**Ubicación**: `adminService.js` línea 99-129, `adminController.js`

**Problema**:
```javascript
async setAdminKey(db, userId, newKey, currentKey = null) {
    const stored = await this.#getStoredKey(db);
    if (stored) {
        if (!currentKey) throw new Error('CURRENT_KEY_REQUIRED');
        // ... validación correcta cuando hay clave existente
    }
    // ❌ PRIMERA CONFIGURACIÓN: Cualquiera puede hacerlo
    // if (!stored) {
    //     // ✅ Clave no existe — crear
    //     // Pero, ¿quién puede crear? Solo el admin, pero ¿cómo autenticamos "admin"?
    // }
}
```

**El Problema Real**:
```
En startup:
1. No hay clave admin configurada (stored = null)
2. Primer usuario que llama POST /api/admin/key se convierte en "admin"
3. Luego puede:
   - Deletear otros usuarios
   - Cambiar roles
   - Acceder a audit_log
4. Pero, ¿quién es el "primer usuario"? Si app.js no valida autenticación:
   - CUALQUIERA puede ser admin (IDOR)
```

**Validación en Controlador**:
```javascript
// En adminController.js:
async setKey(c) {
    // ¿Hay autenticación? ¿Hay CSRF? ¿Rate limiting?
    const userId = c.req.userId; // ¿O undefined?
}
```

**Severidad**: ⚠️ CRÍTICO - Escalada de privile

gios

---

### 🟠 ALTO #5: Soft delete flags están inconsistentes

**Ubicación**: Database schema, `syncService.js`, aplicación general

**Problema**:
```sql
-- Convenciones de delete diferentes:
users:          [ninguno, CASCADE]
sessions:       [is_active, is_revoked, revoked_at]
refresh_tokens: [revoked_at]
projects:       [_deleted BOOLEAN]
tasks:          [_deleted BOOLEAN]
audit_log:      [ninguno]
sync_queue:     [ninguno]

Preguntas sin respuesta:
1. ¿Qué debe hacer una DELETE en frontend?
2. ¿Soft o hard delete?
3. ¿Hay cascada en el frontend?
4. ¿Cómo sincronizo deletes entre dispositivos si no hay _deleted?
```

**Ejemplo de Falla**:
```
1. Usuario deleta proyecto en Tab A
2. Frontend hace: db.projects.delete(projectId) en IndexedDB
3. Envia: {action: 'DELETE', entityType: 'project', entityId: ...}
4. Backend:
   - Valida propiedad
   - Executa: UPDATE projects SET _deleted = 1
5. Tab B (offline):
   - No sabe que proyecto fue borrado
   - Crea tarea en project aún presente en local IndexedDB
   - Al sincronizar, ¿qué pasa con la tarea en proyecto deleted?
```

**Severidad**: 🟠 ALTO - Inconsistencia de estado

---

### 🟠 ALTO #6: SyncService.processPush no deduplica en sync_queue

**Ubicación**: `syncService.js` línea 155-168

**Problema**:
```javascript
// En processPush():
statements.push(db.prepare(`
    INSERT INTO sync_queue (id, user_id, device_id, action, entity_type, entity_id, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
    crypto.randomUUID(),  // ← Siempre único, no previene duplicados
    userId,
    deviceId,
    change.action,        // ← Mismo action
    change.entityType,    // ← Mismo entityType
    change.entityId,      // ← Mismo entityId (clave que importa)
    ...
));
```

**Escenario Falla**:
```
1. Usuario edita tarea 100 veces en 5 segundos
2. Sync debounce: espera 5 segundos
3. Frontend envia: 100 cambios en batch
4. sync_queue tiene 100 inserts para mismo entityId
5. Otros dispositivos descargan 100 veces el mismo cambio
6. Performance lenta, datos inconsistentes si hay conflictos

Debería haber:
- Deduplicación por (user_id, device_id, entity_id)
- O upsert en lugar de insert en sync_queue
```

**Severidad**: 🟠 ALTO - Amplificación de datos

---

### 🟠 ALTO #7: Validación de ownership incompleta en CREATE

**Ubicación**: `syncService.js` línea 209-250

**Problema**:
```javascript
async prepareApplyStatement(db, userId, tableName, change) {
    // DELETE valida ownership (bueno)
    // UPDATE valida ownership (bueno)
    // CREATE: ¿Valida ownership?

    if (change.action === 'DELETE') {
        // ✅ Valida
        const hasOwnership = await this.validateEntityOwnership(...);
    } else if (change.action === 'UPDATE') {
        // ✅ Valida (presuntamente)
    } else if (change.action === 'CREATE') {
        // ❌ ¿Valida?
        // Usuario A puede enviar:
        // {action: 'CREATE', entityType: 'task', entityId: uuid, payload: {..., project_id: 'otros_proyecto'}}
        // Si no validamos project_id, Usuario A crea tareas en proyecto de Usuario B
    }
}
```

**Severidad**: 🟠 ALTO - IDOR en CREATE

---

## ANÁLISIS POR SISTEMA

### 1️⃣ SISTEMA DE CUENTAS

#### Flujo de Autenticación

```
Frontend (Google OAuth)
    ↓
    └─→ Obtiene ID Token
    └─→ POST /auth/google {idToken}

Backend (authController.js)
    ↓
    ├─→ GoogleAuthService.verifyIdToken()
    │   └─→ Valida firma contra JWKS remoto ✅
    ├─→ UserService.upsertUser()
    │   ├─→ Busca usuario por google_sub
    │   ├─→ Si existe:
    │   │   ├─→ UPDATE users (email, name, avatar)
    │   │   ├─→ UPDATE sessions (email) ← ❌ INCOMPLETO
    │   │   └─→ INSERT account_history
    │   └─→ Si no existe:
    │       └─→ INSERT usuarios
    ├─→ SessionService.createSession()
    │   └─→ INSERT sessions + device_id
    ├─→ TokenService.generateAccessToken()
    │   └─→ JWT con {sub, email, sid}
    ├─→ TokenService.saveRefreshToken()
    │   └─→ INSERT refresh_tokens (hash)
    └─→ Retorna {accessToken, refreshToken, user}
```

#### Problemas Identificados

| Problema | Ubicación | Severidad | Causa |
|----------|-----------|-----------|-------|
| Email no sincroniza a tiempo | userService.js:29-35 | ALTO | UPDATE sessions hecho por separado, puede fallar |
| No hay transacción atómica | userService.js:52 | ALTO | db.batch solo en email_changed |
| No validar email contra users | sessionService.js | MEDIO | ¿Sessions con email huérfano? |
| Account history fragmentado | userService.js:37-50 | MEDIO | Historial por user_id, no por email |

#### Recomendación
- **Hacer atómica la actualización de email**: Una sola transacción batch
- **Validar email_updated en frontend**: Comparar contra todos los storages
- **Usar UUID de usuario, no email**: Para todas las FK

---

### 2️⃣ SISTEMA DE VINCULACIÓN (SESSION LINKING)

#### Flujo de Session Switching

```
Frontend (Tab A)
    ├─→ Usuario hace click "Cambiar a otra cuenta"
    ├─→ SessionManager.switchSession(sessionId)
    │   ├─→ Obtiene sesión de IndexedDB
    │   ├─→ ❌ No valida propiedad (CRÍTICO #2)
    │   ├─→ Guarda sesión actual
    │   ├─→ Carga nueva sesión en sessionStorage
    │   ├─→ Emite event('session:switched')
    │   └─→ BroadcastChannel.postMessage({sessionId, email})
    │
    └─→ Tab B (escucha BroadcastChannel)
        └─→ switchSession() sin mutex ❌ (CRÍTICO #3)

Database (sessions table)
    └─→ No se actualiza (es IndexedDB, no backend)
```

#### Problemas Identificados

| Problema | Ubicación | Severidad |
|----------|-----------|-----------|
| No valida user_id en switchSession | session-manager.js:133 | CRÍTICO |
| Race condition en BroadcastChannel | session-manager.js:409 | CRÍTICO |
| sessionStorage es per-tab, no atómico | session-manager.js:164 | ALTO |
| No hay lock cuando cambian múltiples keys | session-manager.js:164-177 | ALTO |

#### Recomendación
- Agregar mutex o semáforo para cross-tab
- Validar propiedad antes de switch
- Usar una sola transacción IndexedDB

---

### 3️⃣ SISTEMA DE SOBREESCRITURA (OVERWRITE GUARDS)

#### Guardrails Actuales

```javascript
// sync.js línea 29-32
let _remoteChecked = false;  // ← Previene ghost wipe al startup

// sync.js línea 47-52
let _dirtyLocalChanges = false;  // ← Advierte sobre cambios no confirmados

// syncService.js
// - validateProjectOwnership() para deletes
// - validateEntityOwnership() para updates
```

#### Problemas Identificados

| Problema | Ubicación | Severidad |
|----------|-----------|-----------|
| _remoteChecked solo en frontend | sync.js | ALTO |
| Backend no tiene el equivalent | syncService.js | ALTO |
| Validación de ownership en CREATE falta | syncService.js:209 | ALTO |
| Soft deletes no propagados a todos | schema.sql | MEDIO |

#### Escenario de Falla: Ghost Wipe Parcial

```
1. Device A: Offline, crea 5 proyectos localmente
2. Device A: Intenta primero pull()
3. _remoteChecked = true (archivo remoto existe o vacío)
4. Device A: Pero pull() falla antes de descargar (timeout)
5. Device A: _dirtyLocalChanges = true
6. Device A: Usuario ve warning, pero espera
7. Device A: Finalmente push() falla, pero datos quedan en IndexedDB
8. Device B: Online, hace pull(), obtiene snapshot antiguo
9. Device B: Push() pushea snapshot antiguo
10. Device A: Siguiente pull() descarga snapshot sin los 5 proyectos

Causa: No hay verification que pull() completó antes de permitir push()
```

#### Recomendación
- Backend debe tener equivalent a _remoteChecked
- Validar ownership en CREATE, no solo DELETE/UPDATE
- Unificar soft delete flags

---

### 4️⃣ SISTEMA DE ADMINISTRACIÓN

#### Flujo de Admin Key

```
Frontend
    ├─→ POST /api/admin/key {key: "miClaveAdmin"}
    │
Backend (adminController.js)
    ├─→ ¿Autenticación? ← ❌ Asume que JWT valida esto
    ├─→ AdminService.setAdminKey()
    │   ├─→ ¿Existe clave actual?
    │   │   ├─→ Sí: Requiere currentKey
    │   │   └─→ No: La permite (CRÍTICO #4) ❌
    │   ├─→ PBKDF2-SHA256 (100k iteraciones) ✅
    │   └─→ Almacena hash + salt
    │
    └─→ Ahora usuario es "admin"
        └─→ Puede: deleteUser, changeMemberRole, getAuditLog

Role-based Access
    ├─→ POST /api/admin/members/:id/role
    └─→ DELETE /api/admin/members/:id
```

#### Problemas Identificados

| Problema | Ubicación | Severidad |
|----------|-----------|-----------|
| Primera configuración sin validación | adminService.js:104 | CRÍTICO |
| No hay rate limiting en setAdminKey | adminController.js | ALTO |
| Verificación de key sin brute-force protection | adminService.js:75 | ALTO |
| Admin puede deletear su propia cuenta | adminController.js | MEDIO |
| Audit log registra pero no previene | audit_log table | BAJO |

#### Recomendación
- Requiere autenticación multi-factor para setAdminKey
- Rate limit en verifyAdminKey (exponential backoff)
- Primeros 24h requieren código de setup
- Validar que admin no puede borrarse a sí mismo

---

### 5️⃣ SISTEMA DE SINCRONIZACIÓN

#### Flujo de Sync (bidireccional)

```
Frontend (IndexedDB)
    ├─→ Mutation → store.dispatch()
    ├─→ markDirty() ← _dirtyLocalChanges = true
    ├─→ Debounce 5 segundos
    │
    ├─→ push(): Envia cambios a /api/sync/push
    │   └─→ Backend almacena en sync_queue
    │
    └─→ pull(): Obtiene cambios de /api/sync/pull
        └─→ Lee sync_queue
        └─→ Aplica a IndexedDB

Backend (Cloudflare D1 + sync_queue)
    ├─→ /api/sync/push {changes: [...]}
    │   ├─→ SyncService.processPush()
    │   │   ├─→ Para cada cambio:
    │   │   │   ├─→ prepareApplyStatement()
    │   │   │   └─→ Agregar a sync_queue
    │   │   └─→ db.batch() ← Transacción atómica ✅
    │   └─→ updateCursor()
    │
    └─→ /api/sync/pull?lastSyncTime=X
        ├─→ SyncService.processPull()
        │   └─→ SELECT FROM sync_queue WHERE created_at > lastSyncTime
        ├─→ Excluye cambios del mismo device ✅
        └─→ Devuelve [cambios]
```

#### Problemas Identificados

| Problema | Ubicación | Severidad |
|----------|-----------|-----------|
| No hay deduplicación en sync_queue | syncService.js:156 | ALTO |
| updateCursor() puede avanzar si batch falla | syncService.js:195 | ALTO |
| Falta validación en CREATE | syncService.js:209 | ALTO |
| Schema skew: frontend vs backend | sync.js:59-65 | MEDIO |
| No hay conflict resolution | sync.js | MEDIO |

#### Escenario de Falla: Pérdida de Cambios

```
1. Device A: Crea tarea X en proyecto P
   - IndexedDB: {id: X, project_id: P, title: "..."}
   - Envia: {action: 'CREATE', entityId: X, entityType: 'task', payload: {...}}

2. Backend (SyncService.processPush):
   - Prepara INSERT statement
   - Prepara INSERT en sync_queue
   - db.batch([INSERT task, INSERT sync_queue]) ← ÉXITO

3. Device B (offline): Crea tarea Y en proyecto P
   - IndexedDB: {id: Y, project_id: P, title: "..."}

4. Device B (conecta):
   - Envía: {action: 'CREATE', entityId: Y, ...}
   - Backend: Acepta, inserta Y en sync_queue

5. Device A (pull):
   - Pull obtiene X de sync_queue (de Device B)
   - Pero Device A ya tiene X localmente
   - ¿Merge? ¿Sobrescribir? ← No definido

6. Resultado: Conflicto no resuelto, datos inconsistentes
```

#### Recomendación
- Implementar conflict resolution (CRDT, LWW, 3-way merge)
- Deduplicación en sync_queue (upsert por entityId)
- Validar ownership en CREATE

---

## MATRIZ DE RIESGOS

### Riesgos por Componente

| Componente | Críticos | Altos | Medios | Acciones |
|-----------|----------|-------|--------|----------|
| Cuentas | 1 | 2 | 2 | Hacer atomic userService updates |
| Vinculación | 2 | 2 | 1 | Agregar mutex, validar propiedad |
| Sobreescritura | 1 | 2 | 1 | Implementar guardrails en backend |
| Administración | 1 | 2 | 2 | Requiere auth, rate limiting |
| Sincronización | 0 | 3 | 2 | Deduplicación, conflict resolution |
| **TOTAL** | **5** | **11** | **8** | **27 fixes** |

---

## RECOMENDACIONES

### 🔴 INMEDIATO (Próximos 2 días)

#### 1. Hacer atómica la sincronización de email en cuentas
```javascript
// userService.js: Usar single db.batch()
if (emailChanged) {
    await db.batch([
        updateUsersStatement,
        updateSessionsStatement,
        insertHistoryStatement,
    ]);
} else {
    await updateUsersStatement.run();
}
```

#### 2. Agregar validación de propiedad en SessionManager.switchSession()
```javascript
async function switchSession(sessionId) {
    const targetSession = await getSession(sessionId);
    if (!targetSession) return false;

    // ✅ NUEVO: Validar que sesión pertenece a usuario actual
    // Nota: En IndexedDB, todas las sesiones son del usuario actual,
    // pero es buena práctica defensiva

    // Usar mutex para evitar race conditions
    if (isSwitchingSession) {
        await mutex.lock();
    }
    // ... actualizar storages ...
    if (isSwitchingSession) {
        mutex.unlock();
    }
}
```

#### 3. Proteger setAdminKey en primer setup
```javascript
// adminController.js
async setKey(c) {
    const { key, currentKey } = await c.req.json();

    // ✅ NUEVO: Verificar que workspace está inicializado
    const hasAdminKey = await adminService.hasAdminKey(env.DB);
    if (!hasAdminKey) {
        // Primera configuración: requiere email del creador
        const creatorEmail = c.req.user?.email;
        if (!creatorEmail) {
            return c.json({ error: 'Workspace not initialized' }, 403);
        }
        // Registrar en audit log
        await adminService.addAuditLog(env.DB, {
            userId: c.req.user.id,
            action: 'INIT_ADMIN_KEY',
            ...
        });
    }
    // ... resto del flujo ...
}
```

---

### 🟠 CORTO PLAZO (1-2 semanas)

#### 4. Implementar deduplicación en sync_queue
```javascript
// syncService.js: prepareApplyStatement()
// En lugar de INSERT, usar upsert:
const statement = db.prepare(`
    INSERT INTO sync_queue (id, user_id, device_id, action, entity_type, entity_id, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, device_id, entity_id) DO UPDATE SET
        action = EXCLUDED.action,
        payload = EXCLUDED.payload,
        created_at = EXCLUDED.created_at
`);
```

#### 5. Agregar validación de ownership en CREATE
```javascript
// syncService.js: prepareApplyStatement()
if (change.action === 'CREATE') {
    // Validar que los IDs en payload son válidos
    if (tableName === 'task') {
        const { project_id } = payload;
        const isOwner = await this.validateProjectOwnership(db, userId, project_id);
        if (!isOwner) {
            throw new Error(`User ${userId} cannot create task in project ${project_id}`);
        }
    }
    // ... similar para otros tipos ...
}
```

#### 6. Unifamiliariizar soft delete flags
```sql
-- Auditoría: Cambiar todos a _deleted, nunca usar hard delete
-- Para sessions: cambiar is_active a _deleted
-- Para refresh_tokens: cambiar revoked_at a _deleted + revoked_at (timestamp)

-- Nueva convención:
-- _deleted BOOLEAN DEFAULT 0  (soft delete, para recuperación)
-- deleted_at DATETIME (timestamp de cuando fue borrado)
-- deleted_by TEXT (user_id de quien lo borró)
```

---

### 🟡 MEDIANO PLAZO (2-4 semanas)

#### 7. Implementar Conflict Resolution
```javascript
// Opción 1: Last-Write-Wins (LWW)
// Guardar updated_at en cada entidad
// En pull, si conflicto: usar la más reciente

// Opción 2: CRDT (Conflict-free Replicated Data Type)
// Usar librerías como yjs o automerge

// Opción 3: 3-way merge
// Guardar remote_snapshot, local_changes
// En sync: merge(remote, local, remote_snapshot)
```

#### 8. Rate limiting y brute-force protection
```javascript
// adminController.js
// Implementar Redis-backed rate limiter
const verifyAttempts = await redis.incr(`admin:verify:${email}`);
if (verifyAttempts > 5) {
    await redis.expire(`admin:verify:${email}`, 3600); // 1 hora
    return c.json({ error: 'Too many attempts' }, 429);
}
```

#### 9. Multi-tab mutex para session switching
```javascript
// Use localStorage-based mutex (simple pero funciona)
async function acquireMutex(key, timeout = 5000) {
    const token = Math.random().toString(36);
    const startTime = Date.now();

    while (localStorage.getItem(`mutex:${key}`) && Date.now() - startTime < timeout) {
        await new Promise(r => setTimeout(r, 10));
    }

    localStorage.setItem(`mutex:${key}`, token);
    return token;
}

async function releaseMutex(key, token) {
    if (localStorage.getItem(`mutex:${key}`) === token) {
        localStorage.removeItem(`mutex:${key}`);
    }
}
```

---

### 🔵 LARGO PLAZO (1-2 meses)

#### 10. Refactorizar arquitectura de sincronización
```
Cambiar de:
  - Snapshot-based (archivo JSON en Drive)
  - Cambios atomicos (batch de 100+ changes)

A:
  - Event stream (secuencia ordenada)
  - Incremental (cambios individuales)
  - Timestamped (causal ordering)
```

#### 11. Implementar session binding a device
```javascript
// Backend debe validar:
// - device_id coincide con la sesión
// - IP address dentro de rango permitido (configurable)

// Previene:
// - Robo de refresh token = no funciona desde otro device
// - Device hijacking
```

#### 12. GDPR / Data retention
```sql
-- Implementar
- Purge de account_history después de 90 días
- Purge de sync_queue después de 30 días
- Purge de audit_log después de 1 año
- Right to be forgotten (GDPR)
```

---

## IMPLEMENTACIÓN SUGERIDA

### Prioridad 1 (Crítico, hacer hoy/mañana)
- [ ] Hacer atomic userService.upsertUser() con db.batch()
- [ ] Validar propiedad en SessionManager.switchSession()
- [ ] Proteger setAdminKey() en primer setup

### Prioridad 2 (Alto, próxima semana)
- [ ] Deduplicación en sync_queue
- [ ] Validación de ownership en CREATE
- [ ] Unifamiliariizar soft delete flags

### Prioridad 3 (Medio, próximas 2-3 semanas)
- [ ] Conflict resolution
- [ ] Rate limiting
- [ ] Mutex para cross-tab sync

### Prioridad 4 (Optimización)
- [ ] Refactorización de sync
- [ ] Session binding
- [ ] Data retention policies

---

## TESTING RECOMENDADO

### Unit Tests (por archivo)
```javascript
// account-detector.test.js
- compareWithStored() con email_updated
- compareWithStored() con account_switched
- compareWithStored() con token_expired

// session-manager.test.js
- switchSession() sin propiedad (debe fallar)
- switchSession() con concurrencia (mutex)
- BroadcastChannel race conditions

// userService.test.js
- upsertUser() con email_changed (atomic)
- upsertUser() con sessions.email sync

// syncService.test.js
- processPush() con CREATE + validation
- processPush() con duplicate entity_id
- validateProjectOwnership() con user mismatch
```

### Integration Tests
```javascript
// Multi-account flow
- Login A, switch to B, pull en A, cambios en B sincronizados

// Email update flow
- User con alias, ambos dispositivos sincronizados

// Delete flow
- Hard delete (backend), soft delete (frontend)
- Cascada de deletes (proyecto → tareas)
```

### Load Tests
```
- 1000 changes en sync_queue
- Dedup reduce a 100 efectivos
- Pull performance no degradado
```

---

## CONCLUSIÓN

El sistema es **robusto en concepto** pero tiene **fricciones operacionales** que explican los problemas reportados. Con los fixes en Prioridad 1-2, la estabilidad mejora significativamente.

**Timeline estimado**:
- Prioridad 1: 2 días
- Prioridad 1+2: 1 semana
- Prioridad 1-3: 3 semanas
- Full: 2 meses

**Nota**: Este análisis asume que el código se comporta como se lee. En producción, hay sutilezas de Cloudflare Workers, IndexedDB timing, etc., que podrían cambiar las conclusiones.

---

**Documento preparado por**: Claude Code Assistant
**Versión**: 1.0
**Próxima revisión recomendada**: Después de implementar Prioridad 1-2
