# Revisión Técnica: Plan de Implementación Backend

**Para revisión con antigravity**

---

## RESUMEN EJECUTIVO

### Objetivo
Crear un backend Node.js/Express que:
1. **Valide autenticación de Google** en el servidor (no confiar en cliente)
2. **Gestione sesiones multi-dispositivo** con refresh tokens seguros
3. **Sincronice datos** entre dispositivos con detección de conflictos
4. **Escale a colaboración** en tiempo real (Firestore + WebSocket)

### Stack Propuesto

```
Frontend (Workspace PWA)
  ├─ IndexedDB (datos locales)
  ├─ Google Identity (OAuth)
  └─ Service Worker (sync offline)
          ↓
Backend (Node.js/Express)
  ├─ SQLite en dev / PostgreSQL en prod
  ├─ JWT + Refresh Tokens
  ├─ Google OAuth validation
  └─ Sync bidireccional
          ↓
Firestore (Fase 3)
  ├─ Colaboración real-time
  ├─ CRDT (Automerge)
  └─ WebSocket
```

---

## ANÁLISIS DE DECISIONES

### 1. Node.js + Express vs Alternativas

**Opciones consideradas**:
- ✅ **Node.js/Express**: Ligero, ecosistema npm, mismo lenguaje que frontend
- ❌ Python/Django: Overhead innecesario
- ❌ Go: Más complejo para equipo de JS
- ❌ .NET: Demasiado pesado

**Justificación**:
- Frontend ya es JS (fácil mantener mismo lenguaje)
- Arquitectura simple (no necesita todo un framework)
- Escalable con Node clusters

### 2. SQLite vs PostgreSQL

**Fase 1-2**: SQLite en desarrollo
- ✅ Zero config
- ✅ Archivos para debugging
- ✅ Perfecto para MVP

**Fase 3+**: PostgreSQL en producción
- ✅ Multi-cliente
- ✅ Replication
- ✅ JSON/JSONB nativo
- ✅ Mejor concurrencia

**Plan de migración**:
```javascript
// SQLite (dev)
sqlite3://workspace.db

// PostgreSQL (prod)
postgres://user:pass@host/workspace
```

### 3. JWT + Refresh Tokens vs Sessions

**Propuesta**:
```
┌─────────────────────────────┐
│  Access Token (JWT 15 min)  │
├─────────────────────────────┤
│  - Claims: sub, email, sid  │
│  - Almacenado: Memory       │
│  - Validación: HMAC         │
└─────────────────────────────┘
           ↓ expirado
┌─────────────────────────────┐
│  Refresh Token (7 días)     │
├─────────────────────────────┤
│  - Aleatorio 64 bytes       │
│  - Almacenado: localStorage │
│  - Hash: bcrypt en BD       │
└─────────────────────────────┘
```

**Ventajas**:
- Stateless (fácil de escalar)
- Seguro (nunca confiar en cliente)
- Revocable (en BD)
- Multi-dispositivo (session ID)

### 4. Sincronización: Cursor-based vs Timestamp-based

**Propuesta**: Hybrid

```javascript
// Pull (obtener cambios)
GET /api/sync/pull
{
  lastSyncTime: "2026-03-23T10:00:00Z",  // Timestamp
  lastCursor: "note-uuid-xyz",            // Cursor para paginación
  limit: 100
}
↓
Response: { changes[], nextCursor, hasMore }

// Ventajas:
✅ Eficiente (solo cambios desde último sync)
✅ Resiliente (si pierde conexión, sigue desde cursor)
✅ Soporta paginación (no sobrecargar cliente)
```

### 5. Detección de Conflictos

**3 estrategias**:

**a) Last-Write-Wins (LWW)**
```javascript
if (local.timestamp > remote.timestamp) {
  use(local);
} else {
  use(remote);
}
// Rápido pero pierde datos en ediciones simultáneas
```

**b) Version-based**
```javascript
if (local.version === server.lastKnownVersion) {
  apply();  // No hay conflicto
} else {
  conflict();  // Usuario debe resolver
}
// Nuestro approach: RECOMENDADO
```

**c) CRDT (Automerge)**
```javascript
const merged = Automerge.merge(local, remote);
// Merge automático, ideal para Fase 3
```

**Decisión**: Version-based + fallback a manual si es necesario

---

## FLUJO DE AUTENTICACIÓN DETALLADO

### Paso 1: Login Inicial

```
Frontend:
  1. Usuario hace click "Login with Google"
  2. Google Identity abre popup
  3. Retorna idToken JWT firmado por Google

     {
       "iss": "https://accounts.google.com",
       "sub": "google-id-opaco",
       "email": "user@example.com",
       "aud": "nuestro-CLIENT_ID"
     }

  4. Frontend → Backend
     POST /auth/google
     { "idToken": "eyJh..." }

Backend:
  1. Validar con google-auth-library:
     ✓ Firma (RSA con keys públicas de Google)
     ✓ Audience = nuestro CLIENT_ID
     ✓ No expirado (exp > ahora)

  2. Extraer claims: sub, email, name

  3. Buscar user en BD por google_sub:
     a) Si existe → actualizar login_count, last_login
     b) Si NO existe → crear user nuevo

  4. Crear sesión:
     INSERT INTO sessions (
       id, user_id, email, google_sub, device_name, ip_address
     )

  5. Generar tokens:
     a) JWT (15 min):
        {
          "sub": "user-uuid",
          "email": "user@example.com",
          "sid": "session-uuid",
          "jti": "unique-id"
        }
        Firmado con JWT_SECRET

     b) Refresh Token:
        token_raw = generar 64 bytes aleatorios
        token_hash = bcrypt.hash(token_raw)
        INSERT INTO refresh_tokens (token_hash, expires_at)

  6. Response:
     {
       "accessToken": "eyJ...",
       "refreshToken": "a1b2c3d4...",
       "expiresIn": 900,
       "user": {...}
     }

Frontend:
  1. Guardar JWT en window.appState (memory)
  2. Guardar refreshToken en localStorage
  3. Iniciar sincronización
```

### Paso 2: Refresh Automático

```
Frontend (15 min después):
  1. JWT expirado
  2. POST /auth/refresh
     {
       "refreshToken": "a1b2c3d4..."
     }

Backend:
  1. Buscar refresh_token en BD por hash:
     SELECT * FROM refresh_tokens
     WHERE token_hash = hash(a1b2c3d4...)
     AND revoked_at IS NULL
     AND expires_at > NOW()

  2. Generar nuevo JWT (15 min)

  3. OPCIONAL: Rotar refresh token
     a) Generar nuevo refresh token
     b) Marcar anterior como replaced_by

  4. Response:
     {
       "accessToken": "new-eyJ...",
       "expiresIn": 900,
       "newRefreshToken": null  // o nuevo si rotamos
     }

Frontend:
  1. Usar nuevo JWT
  2. Reintentar solicitud que falló
  3. Guardar nuevo refresh token si fue rotado
```

### Paso 3: Logout

```
Frontend:
  POST /auth/logout
  Authorization: Bearer <jwt>
  {
    "refreshToken": "a1b2c3d4...",
    "allSessions": false  // true = logout everywhere
  }

Backend (allSessions=false):
  1. Revocar solo este refresh token:
     UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE token_hash = hash(a1b2c3d4...)

  2. Marcar sesión como revoked:
     UPDATE sessions SET is_revoked = 1, revoked_at = NOW()
     WHERE id = req.sessionId

Backend (allSessions=true):
  1. Revocar TODOS los refresh tokens del usuario:
     UPDATE refresh_tokens
     SET revoked_at = NOW()
     WHERE user_id = ? AND revoked_at IS NULL

  2. Revocar TODAS las sesiones:
     UPDATE sessions
     SET is_revoked = 1, revoked_at = NOW()
     WHERE user_id = ? AND is_revoked = 0

Frontend:
  1. Limpiar localStorage (refreshToken)
  2. Limpiar memoria (JWT)
  3. Redirigir a login
```

---

## FLUJO DE SINCRONIZACIÓN

### Pull (Obtener cambios)

```
Frontend (cada 30 segundos):
  POST /api/sync/pull
  Authorization: Bearer <jwt>
  {
    "lastSyncTime": "2026-03-23T10:00:00Z",
    "lastCursor": null,
    "limit": 100
  }

Backend:
  1. Validar JWT (middleware)
  2. Extraer userId = req.userId

  3. Obtener cambios desde lastSyncTime:
     SELECT * FROM notes
     WHERE user_id = ?
     AND updated_at > lastSyncTime
     ORDER BY updated_at
     LIMIT 100

  4. Para cada nota, incluir:
     - id, title, content, contentHash
     - action: 'CREATE' o 'UPDATE'
     - remoteVersion (versión en servidor)
     - updatedAt, updatedBy

  5. Incluir notas eliminadas:
     SELECT * FROM deleted_notes
     WHERE user_id = ?
     AND deleted_at > lastSyncTime

  6. Response:
     {
       "changes": [
         {
           "id": "note-uuid",
           "title": "...",
           "action": "UPDATE",
           "remoteVersion": 5,
           "updatedAt": "...",
           "updatedBy": "user-id"
         },
         {
           "id": "note-uuid-2",
           "action": "DELETE",
           "deletedAt": "..."
         }
       ],
       "nextCursor": "2026-03-23T10:30:00Z",
       "hasMore": false,
       "syncToken": "token-xyz"
     }

Frontend:
  1. Para cada cambio:
     a) Si local.version == remote.lastKnownVersion:
        - Aplicar a IndexedDB
        - Actualizar remoteVersion
     b) Si versión no coincide:
        - Marcar como conflicto
        - Mostrar resolver conflicto

  2. Guardar nextCursor para próxima llamada
```

### Push (Enviar cambios)

```
Frontend:
  POST /api/sync/push
  Authorization: Bearer <jwt>
  {
    "changes": [
      {
        "id": "note-uuid",
        "action": "UPDATE",
        "localVersion": 3,  // Versión que tengo
        "data": {
          "title": "New title",
          "content": "...",
          "contentHash": "abc123"
        }
      },
      {
        "id": "note-uuid-2",
        "action": "DELETE",
        "localVersion": 2
      }
    ]
  }

Backend:
  1. Validar JWT (middleware)

  2. Para CADA cambio:
     a) Obtener nota actual:
        SELECT * FROM notes WHERE id = ? AND user_id = ?

     b) Verificar versión:
        if (change.localVersion !== note.remote_version) {
          // CONFLICTO: versiones no coinciden
          conflicts.push({
            id: change.id,
            localVersion: change.localVersion,
            remoteVersion: note.remote_version,
            remoteData: note,
            suggestion: "KEEP_LOCAL" o "KEEP_REMOTE"
          });
          continue;
        }

     c) Aplicar cambio:
        if (change.action === 'UPDATE') {
          UPDATE notes SET
            title = change.data.title,
            content = change.data.content,
            remote_version = remote_version + 1,
            synced_at = NOW(),
            updated_by = user_id
          WHERE id = ?;
        }

        if (change.action === 'DELETE') {
          DELETE FROM notes WHERE id = ?;
          // O: soft delete (add deleted_at)
        }

  3. Response:
     {
       "applied": [
         { "id": "note-uuid", "remoteVersion": 4 }
       ],
       "conflicts": [
         {
           "id": "note-uuid-2",
           "reason": "VERSION_MISMATCH",
           "localVersion": 2,
           "remoteVersion": 4,
           "remoteData": { "title": "..." },
           "suggestion": "KEEP_REMOTE"
         }
       ],
       "errors": []
     }

Frontend:
  1. Actualizar notas aplicadas con remoteVersion
  2. Mostrar dialogo de conflictos
  3. Usuario elige resolución
```

---

## ESTRUCTURA DE DATOS: COMPARATIVA

### Actual (Frontend only)
```javascript
workspace-notes (IndexedDB)
{
  projects: [],
  tasks: [],
  notes: [],
  cycles: [],
  decisions: [],
  members: [],
  // TODO: Sincronizar con Google Drive monolíticamente
}
```

**Problemas**:
- ❌ No hay versionamiento
- ❌ No hay auditoría
- ❌ No hay multi-dispositivo
- ❌ Conflictos manuales

### Propuesta (Backend)

```sql
users
├─ id (UUID)
├─ google_sub (Google ID)
├─ email (Primary key for login)
└─ metadata (name, picture, locale)

sessions (multi-device)
├─ id
├─ user_id
├─ device_name
├─ ip_address
├─ last_activity
└─ is_active

refresh_tokens
├─ id
├─ session_id
├─ token_hash (never plaintext)
├─ expires_at
└─ revoked_at

notes (con versionamiento)
├─ id
├─ user_id
├─ title, content, contentHash
├─ local_version (cliente)
├─ remote_version (servidor)
├─ synced_at
├─ conflict_state
└─ created_by, updated_by (auditoría)

sync_queue (garantizar delivery)
├─ id
├─ user_id
├─ action (CREATE/UPDATE/DELETE)
├─ entity_id
├─ status (PENDING/SYNCED/FAILED)
└─ retry_count

account_history (multi-account detection)
├─ user_id
├─ old_email, new_email
├─ old_google_sub, new_google_sub
├─ reason (account_switched / email_updated)
└─ same_sub
```

**Mejoras**:
- ✅ Versionamiento (no sobrescribir)
- ✅ Auditoría completa (quién cambió qué)
- ✅ Multi-dispositivo (sessiones separadas)
- ✅ Detección de conflictos automática
- ✅ Garantía de entrega (sync_queue)

---

## SEGURIDAD: MATRIZ DE RIESGOS

### Riesgo 1: Token Hijacking

**Amenaza**: Attacker obtiene JWT → acceso a cuenta

**Mitigación**:
```javascript
✓ JWT con expiración corta (15 min)
✓ Almacenar en memory, NO localStorage
✓ HTTPS obligatorio (no HTTP)
✓ CSRF token en POST
✓ Rate limiting en auth
✓ Session tracking (IP, device, user-agent)
✓ Logout remoto si se detecta anomalía
```

**Score**: BAJO riesgo con mitigaciones

---

### Riesgo 2: Replay Attack

**Amenaza**: Attacker captura request y lo repite

**Mitigación**:
```javascript
✓ Nonce (jti - JWT ID) en cada token
✓ Timestamp (iat) para validar antigüedad
✓ HTTPS (encriptación en tránsito)
✓ Refresh token hash (nunca igual)
```

**Score**: BAJO riesgo

---

### Riesgo 3: Conflicto de Datos (Data Loss)

**Amenaza**: User A y B editan simultáneamente, uno pierde

**Mitigación**:
```javascript
✓ Versionamiento (local_version vs remote_version)
✓ Detección automática de conflictos
✓ Auditoría completa (historial de cambios)
✓ Soft delete (nunca perder datos)
✓ Snapshot + delta (poder revertir)
```

**Score**: CRÍTICO → BAJO con solución

---

### Riesgo 4: Multi-User Authorization

**Amenaza**: User A accede a datos de User B

**Mitigación**:
```javascript
// Middleware en CADA endpoint
app.get('/api/notes/:id', auth, (req, res) => {
  const note = db.get(req.params.id);

  // VALIDACIÓN: ¿Es su nota?
  if (note.user_id !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ¿Es colaborador?
  if (!note.sharedWith.includes(req.userId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.json(note);
});

✓ Validación en CADA endpoint
✓ Row-level security (SQLite con triggers)
✓ Auditoría (quién accedió qué)
```

**Score**: BAJO riesgo con validaciones

---

## PERFORMANCE: BENCHMARKS ESPERADOS

### Base de Datos (SQLite)

```
Query: SELECT * FROM notes WHERE user_id = ? AND updated_at > ?
Index: (user_id, updated_at)

Usuarios: 1,000
Notas por usuario: 100
Notas desde last_sync: ~10

Esperado: < 50 ms
```

### API Endpoints

```
POST /auth/google (validar Google + crear user)
  └─ Google validation: ~200ms
  └─ DB queries: ~10ms
  └─ JWT generation: ~5ms
  └─ Total: ~215ms ✓

POST /api/sync/pull (obtener cambios)
  └─ Auth middleware: ~5ms
  └─ DB query (cursor): ~10ms
  └─ JSON serialization: ~20ms
  └─ Total: ~35ms ✓

POST /api/sync/push (aplicar cambios)
  └─ Auth + validation: ~10ms
  └─ Version checks: ~20ms per change
  └─ DB updates: ~10ms per change
  └─ Total (10 changes): ~120ms ✓
```

### Concurrencia

```
SQLite WAL mode:
  └─ Readers: unlimited (concurrent)
  └─ Writers: 1 (sequential)
  └─ Timeout: 5 segundos

Para > 100 usuarios:
  └─ Migrar a PostgreSQL
  └─ Connection pooling (pg-pool)
  └─ Replication (standby)
```

---

## ROADMAP DE IMPLEMENTACIÓN

### Week 1: Foundation
```
Day 1: Setup + DB
  [ ] Crear estructura de carpetas
  [ ] npm install
  [ ] Crear .env
  [ ] Implementar DatabaseInit
  [ ] Crear tablas

Day 2-3: Google Auth
  [ ] Implementar GoogleAuthService
  [ ] Validar Google JWT
  [ ] Crear User + Session models
  [ ] POST /auth/google endpoint

Day 4-5: JWT + Refresh
  [ ] TokenService (generar/validar JWT)
  [ ] Refresh token storage
  [ ] POST /auth/refresh endpoint
  [ ] Auth middleware
  [ ] POST /auth/logout endpoint

Day 6-7: Testing + Docs
  [ ] Tests básicos (supertest)
  [ ] Documentación de API (OpenAPI)
  [ ] Error handling
```

### Week 2: Sync Phase
```
Day 1-2: Data Models
  [ ] Note model + schema
  [ ] SyncQueue model
  [ ] SyncCursor model

Day 3-4: Sync Endpoints
  [ ] POST /api/sync/pull (obtener cambios)
  [ ] POST /api/sync/push (enviar cambios)
  [ ] Conflict detection logic

Day 5-6: Testing
  [ ] Test sincronización bidireccional
  [ ] Test conflictos
  [ ] Test multi-dispositivo

Day 7: Polish
  [ ] Performance tuning
  [ ] Logging mejorado
```

### Week 3-4: Enhancement
```
[ ] Firestore integration (optional)
[ ] WebSocket para real-time
[ ] CRDT (Automerge)
[ ] Colaboración
```

---

## CHECKLIST DE REVISIÓN

### ✅ Arquitectura
- [ ] Frontend → Backend separados
- [ ] Stateless API (escalable)
- [ ] Multi-dispositivo soportado
- [ ] Fallback a IndexedDB si backend down

### ✅ Seguridad
- [ ] JWT validado en servidor (no confiar cliente)
- [ ] Refresh tokens hasheados (bcrypt)
- [ ] HTTPS en producción
- [ ] CORS restrictivo
- [ ] Rate limiting
- [ ] SQL injection prevenido (prepared statements)
- [ ] XSS prevenido (JSON, no HTML)

### ✅ Datos
- [ ] Versionamiento (evitar sobrescribir)
- [ ] Auditoría (quién cambió qué)
- [ ] Soft delete (nunca perder datos)
- [ ] Índices optimizados
- [ ] Transacciones ACID

### ✅ Reliabilidad
- [ ] Retry automático con backoff
- [ ] Health check endpoint
- [ ] Error handling centralizado
- [ ] Logging estructurado
- [ ] Graceful shutdown

### ✅ Testing
- [ ] Unit tests (auth, sync)
- [ ] Integration tests
- [ ] Performance tests
- [ ] Multi-device simulation

---

## PREGUNTAS FRECUENTES

### P: ¿Por qué no usar Firebase directamente?

**R**:
- Costo: Firebase Realtime Database es caro con muchos usuarios
- Control: Base de datos propia permite más customización
- Privacidad: Los datos quedan bajo tu control
- Migración: Más fácil escalar a PostgreSQL después

**Opción**: Firestore en Fase 3 para colaboración real-time

---

### P: ¿Y si alguien genera JWT falsos?

**R**:
```javascript
// Imposible sin JWT_SECRET
const jwt = require('jsonwebtoken');

// Attacker intenta generar JWT
const fake = jwt.sign({ sub: 'otro-user' }, 'wrong-secret');
// Falla en validación: "invalid signature"

// Verificación:
jwt.verify(fake, process.env.JWT_SECRET);
// → Error: "invalid signature"
```

---

### P: ¿Cómo manejar cambios offline?

**R**:
```javascript
// Frontend (Service Worker)
1. Cambio local → Agregar a IndexedDB
2. Intentar push a servidor
3. Si falla (offline):
   a) Guardar en sync_queue local
   b) Marcar como PENDING
4. Cuando reconecta:
   a) Reintentar push
   b) Resolver conflictos si es necesario
```

---

### P: ¿Escala a 10,000 usuarios?

**R**:
```
SQLite: NO (max ~1,000 concurrent)
PostgreSQL: SÍ con:
  - Connection pooling
  - Read replicas
  - Índices optimizados
  - Caché Redis para sesiones
  - Load balancer (nginx)

Timeline: Migración en Fase 3
```

---

## SIGUIENTE PASO

Después de esta revisión, preguntas para antigravity:

1. ¿Aprueba el stack (Node.js + Express + SQLite → PostgreSQL)?
2. ¿Algún cambio en el flujo de autenticación?
3. ¿Timeline realista para implementación?
4. ¿Prioridad: Fase 1, 2, o directamente a Firestore?
5. ¿Hosting: Self-hosted, AWS, Heroku, etc?

---

**Documento preparado para revisión técnica**
**Fecha: 2026-03-23**
**Status: Listo para implementación**
