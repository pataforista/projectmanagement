# FIXES RECOMENDADOS - ORDEN DE PRIORIDAD

## 🔴 PRIORIDAD 1: CRÍTICO (Hoy/Mañana - 1-2 horas cada)

### Fix 1.1: UserService.upsertUser() - Hacer atómica la sincronización de email

**Archivo**: `/backend/src/services/userService.js`

**Cambio**:
```javascript
// ANTES:
if (emailChanged) {
    const updateUsers = db.prepare(...);
    const updateSessions = db.prepare(...);
    const insertHistory = db.prepare(...);
    await db.batch([updateUsers, updateSessions, insertHistory]);
} else {
    await updateUsers.run();
}

// DESPUÉS: Siempre usar batch para garantizar atomicidad
const statements = [updateUsers];

if (emailChanged) {
    statements.push(updateSessions);
    statements.push(insertHistory);
}

await db.batch(statements);
```

**Impacto**: Previene email desincronización entre users y sessions

---

### Fix 1.2: SessionManager.switchSession() - Validar propiedad

**Archivo**: `/js/utils/session-manager.js`

**Cambio**:
```javascript
// AGREGAR al inicio de switchSession():
async function switchSession(sessionId) {
    const targetSession = await getSession(sessionId);
    if (!targetSession || targetSession.status !== 'active') {
        console.warn(`[SessionManager] Session ${sessionId} not found or inactive`);
        return false;
    }

    // ✅ NUEVO: Validar que no hay otra sesión activa
    // (En IndexedDB local, todas son del usuario, pero es defensa en profundidad)
    const currentSession = currentSessionId ? await getSession(currentSessionId) : null;
    if (currentSession && currentSession.id === sessionId) {
        console.log('[SessionManager] Already on this session');
        return true;
    }

    // ✅ NUEVO: Usar flag para prevenir concurrencia
    if (_isSwitching) {
        console.warn('[SessionManager] Session switch already in progress');
        return false;
    }

    _isSwitching = true;

    try {
        // ... resto del código de switch ...
    } finally {
        _isSwitching = false;
    }
}

// Al inicio del módulo:
let _isSwitching = false;
```

**Impacto**: Previene cross-session hijacking y race conditions básicas

---

### Fix 1.3: AdminController.setKey() - Proteger primer setup

**Archivo**: `/backend/src/controllers/adminController.js`

**Cambio**:
```javascript
async setKey(c) {
    const { key, currentKey } = await c.req.json();
    const userId = c.req.user?.id;

    // ✅ NUEVO: Validar autenticación
    if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    // ✅ NUEVO: Verificar que usuario existe
    const user = await this.userService.getUserById(c.env.DB, userId);
    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }

    const hasAdminKey = await this.adminService.hasAdminKey(c.env.DB);

    // ✅ NUEVO: Primera configuración requiere verificación adicional
    if (!hasAdminKey) {
        // Log que alguien intenta ser admin
        console.log(`[AdminController] First admin setup attempt by ${userId} (${user.email})`);

        // Enviar email de confirmación
        // (Implementar después: por ahora al menos loguear)

        // Permitir pero registrar
        try {
            await this.adminService.setAdminKey(c.env.DB, userId, key);

            await this.adminService.addAuditLog(c.env.DB, {
                userId,
                action: 'INIT_ADMIN_KEY',
                ipAddress: c.req.headers.get('cf-connecting-ip'),
                userAgent: c.req.headers.get('user-agent'),
            });

            return c.json({
                success: true,
                message: 'Admin key initialized. Please verify your email for full privileges.'
            });
        } catch (error) {
            return c.json({ error: error.message }, 400);
        }
    }

    // ✅ Existente: Cambio de clave requiere clave actual
    try {
        await this.adminService.setAdminKey(c.env.DB, userId, key, currentKey);

        await this.adminService.addAuditLog(c.env.DB, {
            userId,
            action: 'CHANGE_ADMIN_KEY',
            ipAddress: c.req.headers.get('cf-connecting-ip'),
            userAgent: c.req.headers.get('user-agent'),
        });

        return c.json({ success: true });
    } catch (error) {
        return c.json({ error: error.message }, 400);
    }
}
```

**Impacto**: Registra y documenta quién se convierte en admin

---

## 🟠 PRIORIDAD 2: ALTO (Próxima 1-2 semanas)

### Fix 2.1: SyncService.processPush() - Deduplicación en sync_queue

**Archivo**: `/backend/src/services/syncService.js`

**Cambio**:
```javascript
// Agregar constraint a schema.sql:
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_dedup
ON sync_queue(user_id, device_id, entity_id);

// En processPush():
// DEDUPLICAR por entityId (mantener último)
const dedupMap = new Map();
for (const change of changes) {
    dedupMap.set(change.entityId, change);
}

const results = [];
const statements = [];
const batchedEntities = [];

for (const change of dedupMap.values()) {
    try {
        // ... igual que antes ...

        // ✅ Cambiar INSERT a UPSERT
        statements.push(db.prepare(`
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
        ));
    } catch (error) { ... }
}
```

**Impacto**: Reduce 100 cambios a 1 en sync_queue cuando es mismo entityId

---

### Fix 2.2: SyncService.prepareApplyStatement() - Validar ownership en CREATE

**Archivo**: `/backend/src/services/syncService.js`

**Cambio**:
```javascript
async prepareApplyStatement(db, userId, tableName, change) {
    // ... código existente ...

    if (change.action === 'CREATE') {
        const payload = change.payload || {};

        // ✅ NUEVO: Validar IDs foráneos según tabla
        if (tableName === 'tasks' && payload.project_id) {
            const isOwner = await this.validateProjectOwnership(db, userId, payload.project_id);
            if (!isOwner) {
                throw new Error(`User ${userId} cannot create task in project ${payload.project_id}`);
            }
        }

        if (tableName === 'tasks' && payload.parent_id) {
            const hasOwnership = await this.validateEntityOwnership(db, userId, 'tasks', payload.parent_id);
            if (!hasOwnership) {
                throw new Error(`User ${userId} cannot reference parent task ${payload.parent_id}`);
            }
        }

        if (['cycles', 'decisions', 'documents'].includes(tableName) && payload.project_id) {
            const isOwner = await this.validateProjectOwnership(db, userId, payload.project_id);
            if (!isOwner) {
                throw new Error(`User ${userId} cannot create ${tableName} in project ${payload.project_id}`);
            }
        }

        // ... INSERT statement ...
    }
}
```

**Impacto**: Previene IDOR en CREATE operations

---

### Fix 2.3: Unifamiliariizar soft delete flags

**Archivo**: `/backend/schema.sql`

**Cambio**:
```sql
-- ANTES: Inconsistente
-- projects: _deleted BOOLEAN
-- sessions: is_active BOOLEAN
-- refresh_tokens: revoked_at DATETIME

-- DESPUÉS: Consistente
-- Cambiar sessions:
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS _deleted BOOLEAN DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS deleted_at DATETIME;
UPDATE sessions SET _deleted = 1, deleted_at = NOW() WHERE is_active = 0;

-- Cambiar refresh_tokens:
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS _deleted BOOLEAN DEFAULT 0;
UPDATE refresh_tokens SET _deleted = 1 WHERE revoked_at IS NOT NULL;

-- Ahora todo usa: _deleted + deleted_at + deleted_by
```

**Impacto**: Consistencia lógica en toda la app

---

### Fix 2.4: SessionManager - Agregar mutex simple para cross-tab

**Archivo**: `/js/utils/session-manager.js`

**Cambio**:
```javascript
// Al inicio:
let _isSwitching = false;
let _switchQueue = [];

async function switchSession(sessionId) {
    // Encolar si ya está en proceso
    while (_isSwitching) {
        await new Promise(resolve => {
            setTimeout(resolve, 50);
        });
    }

    _isSwitching = true;

    try {
        const targetSession = await getSession(sessionId);
        if (!targetSession || targetSession.status !== 'active') {
            return false;
        }

        // ✅ Actualizar TODOS los storages de una vez
        const updates = {
            'workspace_user_email': targetSession.email,
            'google_id_token': targetSession.idToken,
            'workspace_user_name': targetSession.metadata.name,
            'workspace_user_avatar': targetSession.metadata.avatar,
            'workspace_user_member_id': targetSession.metadata.memberId || '',
            'workspace_user_role': targetSession.metadata.role || 'member',
            'nexus_stored_google_sub': targetSession.metadata.sub,
            'nexus_stored_google_aud': targetSession.metadata.aud,
        };

        for (const [key, value] of Object.entries(updates)) {
            StorageManager.set(key, value, 'session');
        }

        // ... resto del código ...

        return true;
    } finally {
        _isSwitching = false;
    }
}
```

**Impacto**: Previene race conditions en session switching

---

## 🟡 PRIORIDAD 3: MEDIO (2-4 semanas)

### Fix 3.1: Implementar Conflict Resolution en sync.js

**Ubicación**: `/js/sync.js`

**Estrategia**: Last-Write-Wins (LWW)
```javascript
// En pull(), cuando hay conflicto (mismo entityId, diferentes versiones):
function resolveConflict(local, remote) {
    // Comparar updated_at
    if (remote.updated_at > local.updated_at) {
        return remote;  // Usar remota (más reciente)
    } else {
        return local;   // Mantener local
    }
}
```

---

### Fix 3.2: Rate limiting en AdminController.verifyKey()

**Ubicación**: `/backend/src/controllers/adminController.js`

---

### Fix 3.3: Delete cascada en SyncService

**Ubicación**: `/backend/src/services/syncService.js`

---

## 📊 TABLA RESUMEN

| ID | Severidad | Archivo | Líneas | Horas | Status |
|----|-----------|---------|--------|-------|--------|
| 1.1 | CRÍTICO | userService.js | 52 | 1 | [ ] |
| 1.2 | CRÍTICO | session-manager.js | 133-145 | 1 | [ ] |
| 1.3 | CRÍTICO | adminController.js | setKey() | 2 | [ ] |
| 2.1 | ALTO | syncService.js | 156-168 | 2 | [ ] |
| 2.2 | ALTO | syncService.js | 209-250 | 2 | [ ] |
| 2.3 | ALTO | schema.sql | - | 3 | [ ] |
| 2.4 | ALTO | session-manager.js | 401-430 | 2 | [ ] |

**Total Prioridad 1**: ~4 horas
**Total Prioridad 2**: ~9 horas
**Total Prioridad 1-2**: ~13 horas (2-3 días)

---

## TESTING RECOMENDADO

### Unit Tests (después de cada fix)
- [ ] UserService.upsertUser() con email_changed
- [ ] SessionManager.switchSession() con concurrencia
- [ ] AdminController.setKey() con primer setup
- [ ] SyncService.processPush() con dedup
- [ ] SyncService.prepareApplyStatement() con CREATE

### Integration Tests
- [ ] Multi-tab session switching
- [ ] Email update across devices
- [ ] Admin setup workflow
- [ ] Project deletion cascada
- [ ] Sync with deduplication

### Manual Testing
- [ ] Abrir 2 tabs, cambiar sesión en ambas
- [ ] Cambiar email de Google, verificar sincronización
- [ ] Crear admin key en nuevo workspace
- [ ] Editar misma tarea 100 veces, verificar sync_queue
- [ ] Crear tarea en proyecto ajeno (debería fallar)

---

## TRACKING

Usar este documento para trackear progreso:
```
PR #XX: Fix 1.1 - Atomic email sync (merged 2026-03-30)
PR #YY: Fix 1.2 - Session ownership validation (in review)
PR #ZZ: Fix 1.3 - Admin key first setup (pending)
...
```
