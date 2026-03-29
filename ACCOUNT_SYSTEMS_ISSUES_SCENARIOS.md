# ESCENARIOS DE FALLA DETALLADOS

## Tabla de Contenidos
1. [PROBLEMA 1: Email PRIMARY KEY Inconsistencia](#problema-1)
2. [PROBLEMA 2: Cross-Session Hijacking](#problema-2)
3. [PROBLEMA 3: BroadcastChannel Race Condition](#problema-3)
4. [PROBLEMA 4: First-Time Admin Setup](#problema-4)
5. [PROBLEMA 5: Soft Delete Inconsistencia](#problema-5)
6. [PROBLEMA 6: Sync Queue Amplificación](#problema-6)
7. [PROBLEMA 7: Create Ownership Bypass](#problema-7)

---

## PROBLEMA 1: Email PRIMARY KEY Inconsistencia

### Escenario de Falla

```
HORA    TAB A (alice@example.com)      TAB B (alice@example.com)      BACKEND
────────────────────────────────────────────────────────────────────────────
0:00    Usuario espera
        ↓
0:01    Google emite nuevo token:
        alice.work@example.com (alias del mismo account)
        Token tiene: sub="google-sub-123" (MISMO)
        ↓
        AccountChangeDetector.compareWithStored()
        → Detecta: email_updated, sameSub=true
        ↓
        SessionManager.switchSession() con email actualizado
        StorageManager.set('workspace_user_email', 'alice.work@example.com')
        ↓
                                        TAB B RECIBE BroadcastChannel
                                        session:switched event
                                        ↓
                                        Pero TAB B no actualiza email
                                        (o actualiza tarde)
                                        ↓
0:02    Sync debounce dispara
        markDirty() en TAB A
        ↓
        Frontend envía:
        POST /api/sync/push
        Authorization: Bearer <JWT>
        (JWT contiene email=alice.work@example.com)
        ↓                               TAB B envía:
                                        POST /api/sync/push
                                        Authorization: Bearer <JWT>
                                        (JWT aún tiene email=alice@example.com)
                                        ↓
0:03                                                            UserService.upsertUser()
                                                                Recibe: email=alice.work@example.com
                                                                ↓
                                                                Busca por google_sub
                                                                Encuentra usuario
                                                                ↓
                                                                UPDATE users SET email = 'alice.work@example.com'
                                                                UPDATE sessions SET email = 'alice.work@example.com'
                                                                ↓
                                        Backend también procesa TAB B's push
                                        Pero JWT tiene userId de alice@example.com
                                        Pero ahora users.email = alice.work@example.com
                                        ↓
                                        Sync no encuentra el proyecto (email mismatch)
                                        ↓
        IndexedDB: workspace_user_email = 'alice.work@example.com'
        Browser: localStorage esperaría alice.work@example.com
        ↓
        Sync de TAB A es EXITOSO

                                        IndexedDB: workspace_user_email = 'alice@example.com' (viejo)
                                        ↓
                                        Sync de TAB B FALLA (silenciosa)
                                        El push fue aceptado pero no aplicado
                                        ↓
```

### Resultado
- Tab A: Datos sincronizados correctamente
- Tab B: Datos "sincronizados" pero no en realidad
- User percibe: "Los cambios en Tab B desaparecieron"

### Código Problemático

```javascript
// session-manager.js: switchSession() NO sincroniza con Tab B
async function switchSession(sessionId) {
    const targetSession = await getSession(sessionId);
    // ... (sin validación de propiedad)

    // ❌ Solo actualiza sessionStorage, NO notifica a Tab B
    StorageManager.set('workspace_user_email', targetSession.email, 'session');

    // BroadcastChannel envia sessionId, pero no email actualizado
    if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('session-sync');
        channel.postMessage({
            type: 'session:switched',
            data: { sessionId, email: targetSession.email }  // ← Email incluido pero...
        });
    }
}
```

```javascript
// account-detector.js: Email update NO sincroniza con Session Manager
if (comparison.reason === 'email_updated') {
    // ✅ Actualiza stored_sub
    StorageManager.set('nexus_stored_google_sub', decoded.sub, 'session');
    // ✅ Actualiza stored_aud
    StorageManager.set('nexus_stored_google_aud', decoded.aud, 'session');

    // ❌ NO actualiza workspace_user_email si ya existe
    // SessionManager debería ser notificado, pero no lo es
}
```

### Fix Requerido

```javascript
// account-detector.js: Notificar a SessionManager
function compareWithStored(idToken) {
    // ...
    if (storedEmail && storedSub && decoded.sub === storedSub && decoded.email !== storedEmail) {
        return {
            changed: true,
            reason: 'email_updated',
            oldEmail: storedEmail,
            newEmail: decoded.email,
            sameSub: true,

            // ✅ NUEVO: Pedir actualización atómica
            requiresSessionUpdate: true,
        };
    }
}

// session-manager.js: Manejar email_updated
if (event.requiresSessionUpdate) {
    // Actualizar email en sesión actual de forma atómica
    const currentSession = await getCurrentSession();
    if (currentSession) {
        StorageManager.set('workspace_user_email', event.newEmail, 'session');

        // Notificar a otras tabs con email nuevo
        const channel = new BroadcastChannel('email-update');
        channel.postMessage({
            type: 'email:updated',
            data: { oldEmail: event.oldEmail, newEmail: event.newEmail }
        });
    }
}
```

---

## PROBLEMA 2: Cross-Session Hijacking

### Escenario de Falla

```
CONTEXTO:
- Usuario X está logueado en Tab A (email: alice@example.com)
- Sistema usa IndexedDB local con sessions store
- Cada sesión tiene ID único: "session_alice_1711763200000_abc123"

ATAQUE:
1. Atacante abre Tab B (diferente usuario, o navegador diferente)
2. Atacante obtiene acceso a IndexedDB (ej: XSS, compartido en máquina)
3. Atacante lee sessions store de IndexedDB
4. Atacante ve sessionId: "session_alice_1711763200000_abc123"

EXPLOIT:
```

```javascript
// Atacante en su Tab (o máquina):
import { SessionManager } from './utils/session-manager.js';

// Espera a que Alice use la app
setTimeout(async () => {
    // Obtiene sesión de Alice de IndexedDB (si compartida)
    const aliceSessions = await db.transaction('sessions').objectStore('sessions').getAll();
    const aliceSessionId = aliceSessions[0].id;  // ← session_alice_...

    // ❌ NO HAY VALIDACIÓN DE PROPIEDAD
    // sessionManager.switchSession() acepta cualquier sessionId
    const switched = await SessionManager.switchSession(aliceSessionId);

    if (switched) {
        // Ahora el atacante es "Alice" en su navegador/tab
        console.log(StorageManager.get('workspace_user_email'));  // → "alice@example.com"

        // Puede hacer:
        // 1. Leer todos los datos de Alice (IndexedDB está desencriptado)
        // 2. Modificar datos localmente
        // 3. Hacer push() como Alice al backend
        // 4. Acceso completo a workspace
    }
}, 5000);
```

### Código Vulnerable

```javascript
// session-manager.js: switchSession()
async function switchSession(sessionId) {
    const targetSession = await getSession(sessionId);

    // ❌ FALLA CRÍTICA: No valida que esta sesión pertenece al usuario actual
    if (!targetSession || targetSession.status !== 'active') {
        console.warn(`[SessionManager] Session ${sessionId} not found or inactive`);
        return false;
    }

    // Acepta cualquier sesión activa
    // Podría ser de otro usuario si IndexedDB está comprometida

    StorageManager.set('workspace_user_email', targetSession.email, 'session');
    StorageManager.set('google_id_token', targetSession.idToken, 'session');
    // ... etc ...

    return true;  // ← Éxito, atacante es ahora el usuario logueado
}
```

### Fix Requerido

```javascript
// session-manager.js: Validar contexto de seguridad
async function switchSession(sessionId) {
    const targetSession = await getSession(sessionId);
    if (!targetSession || targetSession.status !== 'active') {
        return false;
    }

    // ✅ NUEVO: Validar que targetSession pertenece a usuario actual
    // Opción 1: Guardar user_id en IndexedDB
    // Opción 2: Validar against parent frame (si iframe)
    // Opción 3: Validar contra workspace_owner en localStorage

    const workspaceOwner = StorageManager.get('workspace_owner_id', 'local');
    if (targetSession.workspace_owner !== workspaceOwner) {
        console.error('[SessionManager] Session belongs to different workspace owner');
        return false;
    }

    // ... resto del código ...
}
```

---

## PROBLEMA 3: BroadcastChannel Race Condition

### Escenario Temporal

```
TIEMPO    TAB A                           TAB B                           STATE
─────────────────────────────────────────────────────────────────────────────
T0        User clicks "Switch to B"
          SessionManager.switchSession()
          ↓
          Envia: BroadcastChannel
          {type: 'session:switched', sessionId: B}
          ↓
                                          Recibe mensaje
                                          sessionStorage: {email: A}
                                          ↓
T1                                        if (!currentEmail && data.sessionId)
                                          → true (currentEmail es undefined)
                                          ↓
                                          Comienza switchSession(B)
                                          StorageManager.set('workspace_user_email', 'B', 'session')
                                          ↓
T2                                        A mitad de switchSession()
                                          (apenas actualizado email)
                                          ↓
          (User hace click "Otra cuenta")
          SessionManager.switchSession(C)
          ↓
          Envia BroadcastChannel {sessionId: C}
          ↓
                                          ← RACE: Recibe C mientras aún está switchando a B
                                          ↓
T3                                        Maneja evento C:
                                          currentEmail = StorageManager.get('workspace_user_email')
                                          → 'B' (parcialmente actualizado de T1)
                                          ↓
                                          Pero código esperaba 'A' o undefined
                                          ↓
                                          if (currentEmail && currentEmail !== data.email)
                                          → currentEmail='B', data.email='C'
                                          → Condición VERDADERA
                                          → "Different email, ignoring switch"
                                          ↓
T4                                        SwitchSession(C) se detiene

          (Completa SwitchSession(C) en Tab A)
          StorageManager ahora: email=C
          ↓
                                          ← Pero Tab B cree que está en 'B'
                                          IndexedDB usa 'B'
                                          sessionStorage usa 'C' (parcial)
                                          ↓
T5        Intenta sync de A
          POST /api/sync/push
          Authorization: JWT(email=C)
          ↓
                                          ← Intenta sync de B
                                          POST /api/sync/push
                                          Authorization: JWT(email=B)
                                          ↓
          Estado: INCONSISTENTE
          - Tab A cree que es C
          - Tab B cree que es B (parcialmente) o C (parcialmente)
          - Backend ve dos pushes de emails diferentes
```

### Código Problemático

```javascript
// session-manager.js: syncAcrossTabs()
async function syncAcrossTabs() {
    const channel = new BroadcastChannel('session-sync');

    channel.onmessage = async (event) => {
        const { type, data } = event.data;

        if (type === 'session:switched') {
            const currentEmail = StorageManager.get('workspace_user_email', 'session');

            // ❌ PROBLEM 1: Sin mutex, puede estar en mitad de switchSession()
            // ❌ PROBLEM 2: Múltiples mensajes pueden llegar en rápida sucesión

            if (currentEmail && currentEmail !== data.email && data.sessionId) {
                // Ignora
            } else if (!currentEmail && data.sessionId) {
                // ❌ Sin sincronización, dos handlers podrían ejecutar aquí
                const session = await getSession(data.sessionId);
                if (session) {
                    await switchSession(data.sessionId);  // ← Comienza PERO...
                }
            }
        }
    };

    return channel;
}
```

### Fix Requerido

```javascript
// session-manager.js: Agregar mutex simple
let _switchingSession = false;
let _switchQueue = [];

async function switchSession(sessionId) {
    // Encolar request si ya está en proceso
    if (_switchingSession) {
        await new Promise(resolve => {
            _switchQueue.push(resolve);
        });
    }

    _switchingSession = true;

    try {
        const targetSession = await getSession(sessionId);
        if (!targetSession) return false;

        // Actualizar atomicamente
        const updates = {
            'workspace_user_email': targetSession.email,
            'google_id_token': targetSession.idToken,
            'workspace_user_name': targetSession.metadata.name,
            'workspace_user_avatar': targetSession.metadata.avatar,
            'nexus_stored_google_sub': targetSession.metadata.sub,
            'nexus_stored_google_aud': targetSession.metadata.aud,
        };

        // ✅ Aplicar todos los cambios de una vez
        for (const [key, value] of Object.entries(updates)) {
            StorageManager.set(key, value, 'session');
        }

        // Actualizar IndexedDB
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        const store = tx.objectStore(SESSIONS_STORE);
        targetSession.lastActive = Date.now();
        await store.put(targetSession);

        StorageManager.set(CURRENT_SESSION_KEY, sessionId, 'session');

        // Notificar una vez (no múltiples veces)
        window.dispatchEvent(new CustomEvent('session:switched', {
            detail: { sessionId, email: targetSession.email }
        }));

        return true;
    } finally {
        _switchingSession = false;

        // Procesar siguiente en cola
        const next = _switchQueue.shift();
        if (next) next();
    }
}

async function syncAcrossTabs() {
    const channel = new BroadcastChannel('session-sync');

    channel.onmessage = async (event) => {
        const { type, data } = event.data;

        if (type === 'session:switched') {
            const currentEmail = StorageManager.get('workspace_user_email', 'session');

            if (currentEmail && currentEmail !== data.email) {
                // Ya tenemos sesión diferente activa, ignorar
                return;
            }

            if (!currentEmail && data.sessionId) {
                // ✅ Usa switchSession() que ahora tiene mutex
                await switchSession(data.sessionId);
            }
        }
    };
}
```

---

## PROBLEMA 4: First-Time Admin Setup

### Escenario de Falla

```
CONTEXTO:
- Servidor recién lanzado
- No hay clave admin configurada
- workspace_config.admin_key_hash = NULL

ATAQUE:
```

```javascript
// Atacante 1 (cualquier persona con acceso a URL):
fetch('https://app.example.com/api/admin/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'miClaveSecreta123' })
})
.then(r => r.json())
.then(data => {
    if (data.success) {
        console.log('✅ Ahora soy admin del workspace');
        // Puede:
        // 1. Deletear otros usuarios
        // 2. Cambiar sus roles
        // 3. Ver audit log
        // 4. Acceder a datos sensibles
    }
});
```

### Código Vulnerable

```javascript
// adminService.js: setAdminKey()
async setAdminKey(db, userId, newKey, currentKey = null) {
    if (!newKey || newKey.length < 8) {
        throw new Error('KEY_TOO_SHORT');
    }

    const stored = await this.#getStoredKey(db);
    if (stored) {
        if (!currentKey) throw new Error('CURRENT_KEY_REQUIRED');
        const valid = await this.verifyAdminKey({ DB: db }, currentKey);
        if (!valid) throw new Error('INVALID_CURRENT_KEY');
    }
    // ❌ Si !stored (primera vez):
    //    - NO hay validación
    //    - NO hay autenticación multi-factor
    //    - NO hay email confirmation
    //    - userId podría ser cualquiera

    const salt = this.#generateSalt();
    const hash = await this.#deriveKey(newKey, salt);

    await db.batch([
        // ... INSERT hash and salt ...
    ]);
}

// adminController.js: setKey()
async setKey(c) {
    const { key, currentKey } = await c.req.json();

    // ❌ ¿Hay autenticación?
    // const userId = c.req.userId;  ← ¿Definido?

    // ❌ ¿Hay validación de permiso?
    // const isAdmin = await checkIsAdmin(userId);  ← No se llama

    // ❌ ¿Hay rate limiting?
    // await rateLimiter.check(c.req.ip);  ← No se llama

    try {
        await adminService.setAdminKey(c.env.DB, userId, key, currentKey);
        return c.json({ success: true });
    } catch (error) {
        // ... error handling ...
    }
}
```

### Fix Requerido

```javascript
// adminController.js: Proteger first-time setup
async setKey(c) {
    const { key, currentKey } = await c.req.json();
    const userId = c.req.userId;

    // ✅ NUEVO: Verificar autenticación
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    // ✅ NUEVO: Verificar rate limiting
    const rateKey = `admin:setup:${c.req.ip}`;
    const attempts = await redis.incr(rateKey);
    if (attempts === 1) {
        await redis.expire(rateKey, 3600); // 1 hora
    }
    if (attempts > 3) {
        return c.json({ error: 'Too many attempts' }, 429);
    }

    // ✅ NUEVO: Primera configuración requiere email confirmation
    const hasAdminKey = await adminService.hasAdminKey(c.env.DB);
    if (!hasAdminKey) {
        // Primera vez: requiere MFA o email confirmation
        const user = await userService.getUserById(c.env.DB, userId);

        if (!user.email_verified) {
            // Enviar código de verificación
            const code = generateOTP();
            await redis.setex(`admin:setup:${userId}`, 600, code);

            // Enviar email
            await sendEmail(user.email, 'Confirm Admin Setup', `Code: ${code}`);

            return c.json({
                status: 'verification_required',
                message: 'Check your email for verification code'
            });
        }

        // Email verificado, pero aún requiere confirmación
        if (!c.req.body.verification_code) {
            return c.json({
                error: 'verification_code_required',
                message: 'Please provide the code sent to your email'
            });
        }

        // Validar código
        const storedCode = await redis.get(`admin:setup:${userId}`);
        if (storedCode !== c.req.body.verification_code) {
            return c.json({ error: 'Invalid verification code' }, 400);
        }
    }

    // Proceder con setAdminKey()
    try {
        await adminService.setAdminKey(c.env.DB, userId, key, currentKey);

        // ✅ Registrar en audit log
        await adminService.addAuditLog(c.env.DB, {
            userId,
            action: hasAdminKey ? 'CHANGE_ADMIN_KEY' : 'INIT_ADMIN_KEY',
            entityType: 'workspace_config',
            ipAddress: c.req.ip,
            userAgent: c.req.headers.get('user-agent'),
        });

        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: error.message }, 400);
    }
}
```

---

## PROBLEMA 5: Soft Delete Inconsistencia

### Escenario de Falla

```
PROYECTO DELETED:
- Frontend (IndexedDB): proyecto borrado (hard delete)
- Backend (D1): proyecto borrado (soft delete con _deleted=1)
- Inconsistencia: Frontend espera hard delete, Backend espera soft

CASCADA INCOMPLETA:
```

```
Usuario borra proyecto P que contiene tarea T:

Frontend (sync.js):
    1. Mutation: {action: 'DELETE', entityType: 'project', entityId: 'P'}
    2. Envia al backend
    3. Espera que todas las tareas de P sean borradas también

Backend (syncService.js):
    1. Recibe DELETE project
    2. Executa: UPDATE projects SET _deleted=1 WHERE id='P'
    3. ❌ NO ejecuta cascada automática
    4. Tareas de P quedan con project_id='P' (referencia huérfana)

Resultado cuando otra device hace pull():
    - Ve tareas de proyecto con _deleted=1
    - ¿Mostrar tareas? ¿Esconder tareas?
    - Ambos dispositivos podrían tener comportamiento diferente
```

### Código Problemático

```sql
-- schema.sql: Inconsistencia
projects: _deleted BOOLEAN
tasks: _deleted BOOLEAN
sessions: is_active BOOLEAN (no es _deleted!)
refresh_tokens: revoked_at DATETIME (no es _deleted!)
audit_log: [ninguno]

-- ❌ Convenciones contradictorias
```

```javascript
// syncService.js: DELETE sin cascada
if (change.action === 'DELETE') {
    if (!schema.hasDeleted) return null;

    // Soft delete
    const stmt = db.prepare(`
        UPDATE ${tableName} SET _deleted = 1, updated_at = ?
        WHERE id = ?
    `).bind(Date.now(), entityId);

    // ❌ No hay: cascada a child entities
    // Si es project, debería:
    // - UPDATE tasks SET _deleted=1 WHERE project_id=?
    // - UPDATE cycles SET _deleted=1 WHERE project_id=?
    // - Etc.
```

### Fix Requerido

```javascript
// syncService.js: Agregar cascada
async prepareApplyStatement(db, userId, tableName, change) {
    if (change.action === 'DELETE') {
        const statements = [];

        // ✅ Soft delete principal
        statements.push(db.prepare(`
            UPDATE ${tableName}
            SET _deleted = 1, updated_at = ?, deleted_by = ?
            WHERE id = ?
        `).bind(Date.now(), userId, entityId));

        // ✅ Cascada automática
        if (tableName === 'projects') {
            statements.push(db.prepare(`
                UPDATE tasks SET _deleted = 1, updated_at = ?, deleted_by = ?
                WHERE project_id = ? AND _deleted = 0
            `).bind(Date.now(), userId, entityId));

            statements.push(db.prepare(`
                UPDATE cycles SET _deleted = 1, updated_at = ?, deleted_by = ?
                WHERE project_id = ? AND _deleted = 0
            `).bind(Date.now(), userId, entityId));

            // ... similar para decisions, documents, members, etc.
        }

        return statements;  // Retorna array para batch
    }
}

// En processPush():
const statements = [];
for (const change of changes) {
    const applyStmt = await this.prepareApplyStatement(...);

    if (Array.isArray(applyStmt)) {
        statements.push(...applyStmt);  // Spread array
    } else if (applyStmt) {
        statements.push(applyStmt);
    }
}

// Batch todo atomicamente
await db.batch(statements);
```

---

## PROBLEMA 6: Sync Queue Amplificación

### Escenario de Carga

```
USUARIO EDITA TAREA 100 VECES EN 5 SEGUNDOS:

T0      User edits task → mutation → markDirty() → _dirtyLocalChanges=true
T1      edits...
T2      edits...
...
T4.9    edits...
T5      Debounce fires → sync.push()

Frontend envia:
{
  changes: [
    {entityId: 'task-1', action: 'UPDATE', payload: {title: 'v1'}},
    {entityId: 'task-1', action: 'UPDATE', payload: {title: 'v2'}},
    {entityId: 'task-1', action: 'UPDATE', payload: {title: 'v3'}},
    ...
    {entityId: 'task-1', action: 'UPDATE', payload: {title: 'v100'}},
  ]
}

Backend (syncService.processPush):
  Para cada cambio:
    INSERT INTO sync_queue (...)  ← 100 inserts
    INSERT INTO tasks (...)        ← 100 updates (pero solo última es relevante)

Resultado en sync_queue:
```

```sql
SELECT * FROM sync_queue WHERE entity_id='task-1' AND user_id='alice';
-- 100 filas
-- id    | user_id | action | entity_id | payload
-- ------|---------|--------|-----------|---
-- uuid1 | alice   | UPDATE | task-1    | {title: 'v1'}
-- uuid2 | alice   | UPDATE | task-1    | {title: 'v2'}
-- ...
-- uuid100 | alice | UPDATE | task-1    | {title: 'v100'}

-- Otros dispositivos descargando:
SELECT * FROM sync_queue
WHERE user_id='alice' AND device_id != 'device-B' AND created_at > ?
LIMIT 1000;

-- Descarga 100 actualizaciones del MISMO task
-- Procesa 100 veces
-- Rendimiento degradado
```

### Código Problemático

```javascript
// syncService.js: processPush()
for (const change of changes) {
    try {
        const tableName = this.entityTables[change.entityType];

        // Prepara INSERT (ya existente)
        const applyStmt = await this.prepareApplyStatement(db, userId, tableName, change);

        // ❌ PROBLEMA: Siempre inserta nuevo UUID en sync_queue
        // No deduplicado por (user_id, device_id, entity_id)
        statements.push(db.prepare(`
            INSERT INTO sync_queue (id, user_id, device_id, action, entity_type, entity_id, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
            crypto.randomUUID(),  // ← Siempre único
            userId,
            deviceId,
            change.action,
            change.entityType,
            change.entityId,       // ← Podría ser mismo
            JSON.stringify(change.payload || {}),
            Date.now()
        ));

        statements.push(applyStmt);
        batchedEntities.push(change.entityId);
    } catch (error) { ... }
}
```

### Fix Requerido

```javascript
// syncService.js: Deduplicación en sync_queue
async processPush(db, userId, deviceId, changes) {
    if (!changes || !Array.isArray(changes)) return [];

    // ✅ NUEVO: Agrupar por entityId, mantener último cambio
    const deduped = new Map();
    for (const change of changes) {
        const key = change.entityId;
        deduped.set(key, change);  // Sobrescribe con última versión
    }

    const results = [];
    const statements = [];
    const batchedEntities = [];

    // Procesar solo cambios únicos
    for (const change of deduped.values()) {
        try {
            const tableName = this.entityTables[change.entityType];
            const applyStmt = await this.prepareApplyStatement(db, userId, tableName, change);

            if (!applyStmt) {
                results.push({ entityId: change.entityId, status: 'success', note: 'No-op' });
                continue;
            }

            // ✅ Upsert en lugar de insert
            const syncQueueStmt = db.prepare(`
                INSERT INTO sync_queue (id, user_id, device_id, action, entity_type, entity_id, payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, device_id, entity_id) DO UPDATE SET
                    action = EXCLUDED.action,
                    payload = EXCLUDED.payload,
                    created_at = EXCLUDED.created_at
            `).bind(
                crypto.randomUUID(),
                userId,
                deviceId,
                change.action,
                change.entityType,
                change.entityId,
                JSON.stringify(change.payload || {}),
                Date.now()
            );

            statements.push(syncQueueStmt);
            statements.push(applyStmt);
            batchedEntities.push(change.entityId);
        } catch (error) { ... }
    }

    // ... resto del código ...
}

-- schema.sql: Agregar constraint único
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_dedup
ON sync_queue(user_id, device_id, entity_id);
```

---

## PROBLEMA 7: Create Ownership Bypass

### Escenario de Falla

```
USUARIO A CREA TAREA EN PROYECTO DE USUARIO B:
```

```javascript
// Usuario A hace:
const change = {
    action: 'CREATE',
    entityType: 'task',
    entityId: uuid(),
    payload: {
        title: 'Malicious task',
        project_id: 'proyecto-de-usuario-b',  // ← No pertenece a usuario A
        status: 'todo'
    }
};

BackendClient.fetch('/api/sync/push', {
    changes: [change]
});
```

### Código Vulnerable

```javascript
// syncService.js: prepareApplyStatement()
async prepareApplyStatement(db, userId, tableName, change) {
    const payload = change.payload || {};
    const schema = this.tableSchema[tableName];

    // ❌ DELETE: valida ownership
    if (change.action === 'DELETE') {
        const hasOwnership = await this.validateEntityOwnership(db, userId, tableName, entityId);
        if (!hasOwnership) throw new Error(...);
    }

    // ❌ UPDATE: valida ownership (presuntamente)
    else if (change.action === 'UPDATE') {
        // ...
    }

    // ❌ CREATE: NO valida ownership
    else if (change.action === 'CREATE') {
        // Simplemente inserta
        return db.prepare(`
            INSERT INTO ${tableName} (id, user_id, ${columns.join(',')})
            VALUES (${placeholders.join(',')})
        `).bind(entityId, userId, ...values);

        // ❌ No valida que project_id en payload pertenece a usuario
        // ❌ No valida que parent_id pertenece a usuario
        // ❌ No valida que cycle_id pertenece a usuario
    }
}
```

### Fix Requerido

```javascript
// syncService.js: Validar ownership en CREATE
async prepareApplyStatement(db, userId, tableName, change) {
    const payload = change.payload || {};

    // ✅ NUEVO: Validar en CREATE
    if (change.action === 'CREATE') {
        // Validar IDs foráneos según tabla
        if (tableName === 'tasks') {
            // Tasks deben pertenecer a proyecto del usuario
            if (payload.project_id) {
                const isOwner = await this.validateProjectOwnership(db, userId, payload.project_id);
                if (!isOwner) {
                    throw new Error(`User ${userId} cannot create task in project ${payload.project_id}`);
                }
            }

            // Si hay parent_id (subtask), validar que pertenece a proyecto
            if (payload.parent_id) {
                const hasParentOwnership = await this.validateEntityOwnership(db, userId, 'tasks', payload.parent_id);
                if (!hasParentOwnership) {
                    throw new Error(`User ${userId} cannot reference parent task ${payload.parent_id}`);
                }
            }
        }

        // Cycles, decisions, documents, etc. — validar project_id
        if (['cycles', 'decisions', 'documents', 'members'].includes(tableName)) {
            if (payload.project_id) {
                const isOwner = await this.validateProjectOwnership(db, userId, payload.project_id);
                if (!isOwner) {
                    throw new Error(`User ${userId} cannot create ${tableName} in project ${payload.project_id}`);
                }
            }
        }

        // Library items, notifications pertenecen a usuario
        if (['library_items', 'notifications'].includes(tableName)) {
            // ✅ Validación implícita: INSERT siempre con user_id = userId
            const stmt = db.prepare(`
                INSERT INTO ${tableName} (id, user_id, ...columns)
                VALUES (?, ?, ...values)
            `).bind(entityId, userId, ...payload_values);

            return stmt;
        }
    }

    // ... resto del código ...
}
```

---

## CONCLUSIÓN

Estos 7 problemas interactúan entre sí:
1. Email inconsistente → Sync falla silenciosamente
2. Cross-session hijacking → Atacante modifica datos de otro
3. BroadcastChannel race → Estado inconsistente en múltiples tabs
4. Admin setup → Primer usuario se convierte en admin no autorizado
5. Soft delete → Cascada incompleta, datos huérfanos
6. Sync amplificación → Performance degradado
7. Create bypass → Datos modificados sin autorización

El fix de Prioridad 1 (2-3 items) mitiga la mayoría de estos problemas.
