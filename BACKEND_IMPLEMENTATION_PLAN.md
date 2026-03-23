# Plan Técnico: Backend Node.js para Sincronización Multi-Dispositivo

**Versión**: 1.0
**Fecha**: 2026-03-23
**Estado**: Pre-implementación
**Audience**: Revisión técnica para antigravity

---

## TABLA DE CONTENIDOS

1. [Situación Actual](#situación-actual)
2. [Requisitos Funcionales](#requisitos-funcionales)
3. [Requisitos No-Funcionales](#requisitos-no-funcionales)
4. [Arquitectura General](#arquitectura-general)
5. [Fase 1: Autenticación](#fase-1-autenticación)
6. [Fase 2: Almacenamiento Básico](#fase-2-almacenamiento-básico)
7. [Fase 3: Colaboración Real-Time](#fase-3-colaboración-real-time)
8. [Consideraciones de Seguridad](#consideraciones-de-seguridad)
9. [Integración Frontend-Backend](#integración-frontend-backend)
10. [Riesgos y Mitigaciones](#riesgos-y-mitigaciones)

---

## SITUACIÓN ACTUAL

### Frontend (PWA)
```
┌─────────────────────────────────────┐
│   Workspace PWA (Index.html)        │
├─────────────────────────────────────┤
│  • IndexedDB local (workspace-notes)│
│  • Service Workers (offline-first)  │
│  • Google Identity (OAuth 2.0)      │
│  • Google Drive sync (monolítico)   │
└─────────────────────────────────────┘
```

**Datos manejados**:
- 📝 Notas (con WikiLinks, frontmatter YAML)
- 📊 Proyectos y Tareas
- 👥 Miembros y permisos
- 📅 Ciclos y Decisiones
- 📄 Documentos
- 🔐 Sesiones multi-dispositivo

**Limitaciones actuales**:
- ❌ No hay sincronización entre dispositivos
- ❌ No hay colaboración en tiempo real
- ❌ Todos los datos en un archivo JSON en Google Drive
- ❌ Conflictos manuales cuando hay actualizaciones simultáneas
- ❌ No hay auditoría de cambios

### Contexto de Autenticación
```javascript
// Google OAuth flow actual
Frontend:
  1. Abrir Google Identity (gapi.auth2)
  2. Obtener ID Token (JWT firmado por Google)
  3. Access Token (para APIs de Google)
  4. Almacenar en localStorage (INSEGURO)

Problema: Sin validación backend, el frontend confía en Google ciegamente
```

---

## REQUISITOS FUNCIONALES

### RF1: Autenticación Multi-Dispositivo
```
Usuario A en Laptop → Login con Google
Usuario A en Móvil → Login con Google
→ Ambos dispositivos sincronizados
```

**Casos de uso**:
- [RF1.1] Login inicial con Google
- [RF1.2] Refresh de tokens sin revalidar identidad
- [RF1.3] Logout en un dispositivo (revoke token)
- [RF1.4] Logout en todos los dispositivos (revoke session)
- [RF1.5] Detectar cambio de cuenta (user@a.com → user@b.com)
- [RF1.6] Detectar cambio de email (user@a.com → user.alias@a.com)

### RF2: Sincronización Bidireccional
```
Dispositivo A: Crea nota N1
        ↓
Servidor: Almacena N1 en BD
        ↓
Dispositivo B: Pull recibe N1
```

**Casos de uso**:
- [RF2.1] Push de cambios locales (create/update/delete)
- [RF2.2] Pull de cambios remotos (con cursor de sincronización)
- [RF2.3] Resolver conflictos cuando hay cambios simultáneos
- [RF2.4] Persistencia de "última versión conocida"
- [RF2.5] Auditoría completa de cambios

### RF3: Colaboración en Tiempo Real (Fase 3)
```
Usuario A: Edita nota
        ↓
Servidor: Broadcast cambios en tiempo real
        ↓
Usuario B: Ve cambios en vivo
```

**Casos de uso**:
- [RF3.1] Compartir nota con otro usuario
- [RF3.2] Presencia de usuarios (quién está viendo qué)
- [RF3.3] Cursores colaborativos
- [RF3.4] Resolución automática de conflictos (CRDT)
- [RF3.5] Cambios granulares (OT - Operational Transform)

---

## REQUISITOS NO-FUNCIONALES

### RNF1: Seguridad

#### Autenticación
- [RNF1.1] Validar JWT de Google en backend (nunca confiar en cliente)
- [RNF1.2] Almacenar refresh tokens con hash (bcrypt)
- [RNF1.3] JWT propio con expiración corta (15 min)
- [RNF1.4] HTTPS obligatorio en producción
- [RNF1.5] CORS restrictivo (solo dominios conocidos)

#### Autorización
- [RNF1.6] User A NO puede acceder a datos de User B
- [RNF1.7] Colaboradores solo ven/editan lo compartido

#### Criptografía
- [RNF1.8] Encriptación de datos sensibles en BD (bcrypt para contraseñas, AES para datos)
- [RNF1.9] IV (Initialization Vector) aleatorio para cada encriptación

### RNF2: Rendimiento
- [RNF2.1] Sincronización debe completarse en <2s (red 4G)
- [RNF2.2] Índices de BD optimizados (by user_id, by updated_at)
- [RNF2.3] Cursor-based pagination (no offset-limit)
- [RNF2.4] Caché HTTP (ETag, Last-Modified)

### RNF3: Disponibilidad
- [RNF3.1] 99.9% uptime en producción
- [RNF3.2] Graceful degradation si backend está down
- [RNF3.3] Retry automático con backoff exponencial
- [RNF3.4] Health check endpoint (/health)

### RNF4: Observabilidad
- [RNF4.1] Logs estructurados (JSON)
- [RNF4.2] Métricas: latencia, errores, usuarios activos
- [RNF4.3] Trazas distribuidas (si hay múltiples servicios)
- [RNF4.4] Alertas en errores críticos

---

## ARQUITECTURA GENERAL

### Stack Tecnológico

```javascript
Backend:
  └─ Node.js (v18+)
     ├─ Express.js (web framework)
     ├─ sqlite3 / better-sqlite3 (persistencia)
     ├─ jsonwebtoken (JWT)
     ├─ google-auth-library (validación OAuth)
     ├─ bcryptjs (hashing)
     └─ ws / socket.io (real-time)

Datos:
  ├─ SQLite (desarrollo local)
  └─ PostgreSQL (producción, opcional)

Frontend:
  ├─ IndexedDB (datos locales)
  ├─ Service Worker (sync background)
  └─ WebSocket (real-time updates)
```

### Flujo de Solicitud

```
┌─ Cliente Mobile/Desktop ──┐
│                            │
│  1. POST /auth/google      │ (ID Token de Google)
│  ↓ Response: Access + Refresh Tokens
│
│  2. GET /api/notes         │ (Bearer: Access Token)
│  ↓ Response: Notas del usuario
│
│  3. POST /api/sync/push    │ (Bearer: Access Token)
│  ↓ Response: Cambios aplicados/conflictos
│
└────┬─────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│    Backend Express Server           │
├─────────────────────────────────────┤
│ 1. authMiddleware(token)            │
│    - Validar JWT nuestro            │
│    - Refresh si está vencido        │
│                                     │
│ 2. Validar permisos (¿es su dato?) │
│                                     │
│ 3. Ejecutar lógica (CRUD, sync)     │
│                                     │
│ 4. Retornar datos + metadata        │
└─────────────────────────────────────┘
     │
     ↓
┌─────────────────────────────────────┐
│    SQLite Database (Fase 2+)        │
│  - Usuarios                         │
│  - Sesiones                         │
│  - Notas                            │
│  - Historial de cambios             │
└─────────────────────────────────────┘
```

### Estructura de Carpetas

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js                  # Leer .env
│   │   ├── db-config.js            # Configuración SQLite
│   │   └── google-config.js        # Google OAuth settings
│   │
│   ├── middleware/
│   │   ├── auth.js                 # Validar JWT + Refresh
│   │   ├── errorHandler.js         # Centralizar errores
│   │   ├── corsHandler.js          # CORS
│   │   └── requestLogger.js        # Logging
│   │
│   ├── controllers/
│   │   ├── authController.js       # login, refresh, logout
│   │   ├── userController.js       # profile, sessions
│   │   ├── notesController.js      # CRUD notas
│   │   └── syncController.js       # push/pull
│   │
│   ├── services/
│   │   ├── googleAuthService.js    # Validar JWT Google
│   │   ├── tokenService.js         # Generar/revocar tokens
│   │   ├── sessionService.js       # Gestionar sesiones
│   │   ├── notesService.js         # Lógica de notas
│   │   ├── syncService.js          # Orquestación sync
│   │   └── conflictService.js      # Resolución de conflictos
│   │
│   ├── models/
│   │   ├── User.js                 # Esquema user
│   │   ├── Session.js              # Esquema session
│   │   ├── RefreshToken.js         # Esquema refresh_token
│   │   ├── Note.js                 # Esquema note (Fase 2)
│   │   └── SyncQueue.js            # Esquema sync_queue (Fase 2)
│   │
│   ├── routes/
│   │   ├── authRoutes.js           # /auth/*
│   │   ├── userRoutes.js           # /user/*
│   │   ├── notesRoutes.js          # /api/notes/*
│   │   ├── syncRoutes.js           # /api/sync/*
│   │   └── index.js                # Router principal
│   │
│   ├── utils/
│   │   ├── jwt.js                  # Crear/validar JWT nuestro
│   │   ├── crypto.js               # Encriptación
│   │   ├── validators.js           # Validar entrada
│   │   └── errorCodes.js           # Códigos de error estandarizados
│   │
│   ├── db/
│   │   ├── init.js                 # Crear tablas
│   │   ├── migrations.js           # Versionamiento de schema
│   │   └── queries.js              # Queries comunes
│   │
│   ├── app.js                      # Express app
│   └── server.js                   # HTTP server
│
├── tests/
│   ├── auth.test.js
│   ├── sync.test.js
│   └── integration.test.js
│
├── .env.example
├── .env.test
├── package.json
├── .gitignore
└── README.md
```

---

## FASE 1: AUTENTICACIÓN

### Objetivo
Implementar login seguro con Google y refresh de tokens sin que el usuario deba revalidar identidad.

### Flujo de Autenticación

#### 1.1 Login Inicial (Frontend → Backend)

```
Frontend:
  1. Usuario hace click "Login with Google"
  2. Google Identity abre popup
  3. Usuario consiente
  4. Google retorna: {
       idToken: "eyJhbGc...",      // JWT con sub, email, name
       accessToken: "ya29...",      // Para APIs de Google
       expiresIn: 3599
     }
  5. Frontend envía idToken al backend:
     POST /auth/google
     { "idToken": "eyJhbGc..." }

Backend:
  1. Validar idToken con Google:
     - Firmado por Google
     - Audience = nuestro CLIENT_ID
     - No expirado
  2. Extraer claims: sub (Google ID), email, name, picture
  3. Buscar user en BD:
     a. Si existe → actualizar last_login
     b. Si no existe → crear nuevo user
  4. Generar:
     - JWT nuestro (15 min): { sub, email, sid }
     - Refresh Token: token aleatorio de 64 bytes
  5. Guardar refresh token en BD (hasheado con bcrypt)
  6. Guardar sesión nueva
  7. Retornar tokens al frontend

Frontend:
  1. Guardar JWT en memory (nunca localStorage)
  2. Guardar refresh token en localStorage (de corta vida)
  3. Guardar en IndexedDB local: email, name, picture
```

**Request**:
```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ..."
}
```

**Response (200)**:
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "expiresIn": 900,
  "user": {
    "id": "uuid-12345",
    "email": "user@example.com",
    "name": "John Doe",
    "picture": "https://lh3.googleusercontent.com/...",
    "emailVerified": true
  },
  "session": {
    "id": "session-uuid",
    "createdAt": "2026-03-23T10:30:00Z"
  }
}
```

**Response (401 - Unauthorized)**:
```json
{
  "status": "error",
  "code": "INVALID_ID_TOKEN",
  "message": "ID token is invalid or expired",
  "details": "Failed to verify token signature"
}
```

#### 1.2 Refresh de Token (Automático)

Cuando el access token está a punto de vencer:

```
Frontend:
  1. Detecta JWT está a punto de expirar (o recibe 401)
  2. POST /auth/refresh { refreshToken: "..." }

Backend:
  1. Validar refresh token:
     - Existe en BD
     - No está revocado
     - No expirado (7 días)
  2. Generar nuevo JWT (15 min)
  3. OPCIONAL: Generar nuevo refresh token (rotate)
  4. Retornar nuevo JWT

Frontend:
  1. Actualizar JWT en memory
  2. Reintentar solicitud fallida
```

**Request**:
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response (200)**:
```json
{
  "status": "success",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "newRefreshToken": null  // null si no rotamos, nuevo token si rotamos
}
```

#### 1.3 Logout

**Single Device**:
```
Frontend: POST /auth/logout { refreshToken }
Backend:
  - Marcar refresh token como revoked
  - Marcar sesión como inactive
```

**All Devices**:
```
Frontend: POST /auth/logout { allSessions: true }
Backend:
  - Revocar TODOS los refresh tokens del usuario
  - Marcar TODAS las sesiones como inactive
```

**Request**:
```http
POST /auth/logout
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "allSessions": false
}
```

**Response (200)**:
```json
{
  "status": "success",
  "message": "Logged out successfully",
  "sessionsRevoked": 1
}
```

### 1.4 Estructura de Datos (SQLite)

#### users table
```sql
CREATE TABLE users (
  -- Identificadores
  id TEXT PRIMARY KEY,                          -- UUID único
  google_sub TEXT UNIQUE NOT NULL,              -- Google Subject (opaco pero único)
  google_aud TEXT NOT NULL,                     -- Google Audience (nuestro CLIENT_ID)

  -- Información
  email TEXT UNIQUE NOT NULL,                   -- Email primario
  name TEXT,
  picture TEXT,
  locale TEXT DEFAULT 'es-ES',

  -- Flags
  email_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,

  -- Encriptación end-to-end
  encryption_key_iv TEXT,                       -- IV para derivar clave
  encrypted_key_hash TEXT,                      -- Hash de clave privada encriptada

  -- Contadores y timestamps
  login_count INTEGER DEFAULT 0,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(google_sub),
  UNIQUE(email)
);

CREATE INDEX idx_users_google_sub ON users(google_sub);
CREATE INDEX idx_users_email ON users(email);
```

#### sessions table
```sql
CREATE TABLE sessions (
  -- Identificadores
  id TEXT PRIMARY KEY,                          -- UUID único
  user_id TEXT NOT NULL,

  -- Snapshot del usuario en este moment
  email TEXT NOT NULL,                          -- Email en el momento de login
  google_sub TEXT NOT NULL,                     -- Google sub en este moment

  -- Device info
  user_agent TEXT,                              -- "Mozilla/5.0 Chrome/..."
  ip_address TEXT,                              -- IP del cliente
  device_name TEXT,                             -- "iPhone", "Chrome Windows", etc

  -- Tokens
  access_token_hash TEXT,                       -- Hash del último access token
  access_token_expires_at DATETIME,             -- Cuándo expira

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_revoked BOOLEAN DEFAULT false,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_is_active ON sessions(is_active);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);
```

#### refresh_tokens table
```sql
CREATE TABLE refresh_tokens (
  -- Identificadores
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,

  -- Token
  token_hash TEXT UNIQUE NOT NULL,              -- Hash bcrypt del token (nunca almacenar plano)

  -- Expiración
  expires_at DATETIME NOT NULL,                 -- Cuándo expira (7 días por defecto)
  revoked_at DATETIME,                          -- NULL = activo, TIMESTAMP = revocado

  -- Rotación
  replaced_by_id TEXT,                          -- Si se rotó, qué token lo reemplazó

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(token_hash)
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_session_id ON refresh_tokens(session_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
```

#### account_history table
```sql
CREATE TABLE account_history (
  -- Identificadores
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Cambios detectados
  old_email TEXT,
  new_email TEXT NOT NULL,
  old_google_sub TEXT,
  new_google_sub TEXT,

  -- Categorización
  reason TEXT NOT NULL,                         -- 'account_switched', 'email_updated'
  same_sub BOOLEAN,                             -- true si sub igual, false si cambió

  -- Descripción
  description TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_account_history_user_id ON account_history(user_id);
CREATE INDEX idx_account_history_created_at ON account_history(created_at);
```

### 1.5 JWT Nuestro (Claims)

```javascript
{
  // Estándar
  "iss": "https://api.workspace.local",  // Issuer (nuestro backend)
  "sub": "uuid-12345",                   // Subject (user ID)
  "aud": "workspace-web-app",            // Audience
  "iat": 1711253400,                     // Issued at
  "exp": 1711254300,                     // Expiration (15 min después)

  // Custom claims
  "email": "user@example.com",
  "sid": "session-uuid",                 // Session ID (para revocar)
  "jti": "unique-token-id"               // Para revocation list
}
```

### 1.6 Middleware de Autenticación

```javascript
// middleware/auth.js

export async function authenticateJWT(req, res, next) {
  try {
    // 1. Extraer Bearer token del header
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        status: 'error',
        code: 'NO_TOKEN',
        message: 'No authentication token provided'
      });
    }

    // 2. Validar JWT (signature + expiration)
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          status: 'error',
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired',
          expiredAt: err.expiredAt
        });
      }
      throw err;
    }

    // 3. Validar que sesión sigue activa
    const session = await Session.findById(decoded.sid);
    if (!session || !session.is_active) {
      return res.status(401).json({
        status: 'error',
        code: 'SESSION_REVOKED',
        message: 'Session has been terminated'
      });
    }

    // 4. Validar que token no está en blacklist
    const isBlacklisted = await checkJWTBlacklist(decoded.jti);
    if (isBlacklisted) {
      return res.status(401).json({
        status: 'error',
        code: 'TOKEN_REVOKED',
        message: 'Token has been revoked'
      });
    }

    // 5. Actualizar last_activity de sesión
    await Session.update(decoded.sid, { last_activity: new Date() });

    // 6. Inyectar en request
    req.userId = decoded.sub;
    req.email = decoded.email;
    req.sessionId = decoded.sid;
    req.tokenId = decoded.jti;

    next();

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({
      status: 'error',
      code: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
}

// Endpoints públicos que NO requieren auth
const publicRoutes = [
  '/auth/google',
  '/auth/refresh',
  '/health',
  '/api/status'
];
```

---

## FASE 2: ALMACENAMIENTO BÁSICO

### Objetivo
Implementar CRUD de notas con sincronización bidireccional y detección de conflictos.

### Nuevos Modelos

#### notes table
```sql
CREATE TABLE notes (
  -- Identificadores
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Contenido
  title TEXT NOT NULL,
  content TEXT,
  content_hash TEXT,                      -- SHA256(content) para detectar cambios

  -- Metadata
  type TEXT,                              -- 'medico', 'personal', 'trabajo'
  tags TEXT,                              -- JSON: ["tag1", "tag2"]
  is_pinned BOOLEAN DEFAULT false,

  -- WikiLinks
  links TEXT,                             -- JSON: ["NoteID1", "NoteID2"]
  frontmatter TEXT,                       -- YAML frontmatter

  -- Encriptación
  encrypted BOOLEAN DEFAULT false,
  encryption_iv TEXT,

  -- Versionamiento para sincronización
  local_version INTEGER DEFAULT 1,        -- Incrementa cada vez que user edita
  remote_version INTEGER DEFAULT 0,       -- Versión en servidor
  synced_at DATETIME,                     -- Cuándo se sincronizó por última vez

  -- Conflict resolution
  conflict_state TEXT,                    -- NULL, 'CONFLICT', 'RESOLVED'
  conflict_remote_data TEXT,              -- JSON de datos remotos en conflicto
  conflict_resolution_strategy TEXT,      -- 'KEEP_LOCAL', 'KEEP_REMOTE', 'MERGED'

  -- Auditoría
  created_by TEXT,                        -- User ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,                        -- User ID que hizo último cambio
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_updated_at ON notes(updated_at);
CREATE INDEX idx_notes_synced_at ON notes(synced_at);
CREATE INDEX idx_notes_user_synced ON notes(user_id, synced_at);
```

#### sync_queue table
```sql
CREATE TABLE sync_queue (
  -- Identificadores
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Operación
  action TEXT NOT NULL,                   -- 'CREATE', 'UPDATE', 'DELETE'
  entity_type TEXT NOT NULL,              -- 'note', 'project', 'task'
  entity_id TEXT NOT NULL,

  -- Datos
  payload TEXT NOT NULL,                  -- JSON completo de la entidad
  old_payload TEXT,                       -- Para UPDATE, el valor anterior

  -- Estado de sincronización
  status TEXT DEFAULT 'PENDING',          -- 'PENDING', 'SYNCED', 'FAILED', 'CONFLICT'

  -- Reintentos
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_queue_user_status ON sync_queue(user_id, status);
CREATE INDEX idx_sync_queue_created_at ON sync_queue(created_at);
```

#### sync_cursor table (para paginación)
```sql
CREATE TABLE sync_cursor (
  -- Identificadores
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,                -- Identificador del dispositivo

  -- Posición
  last_sync_time DATETIME,                -- Timestamp del último sync
  last_entity_id TEXT,                    -- Para pagination

  -- Estado
  is_syncing BOOLEAN DEFAULT false,

  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, device_id)
);
```

### 2.2 Endpoints de Sincronización

#### POST /api/sync/pull (Obtener cambios)

**Lógica**:
1. Frontend envía última sincronización conocida
2. Backend retorna cambios desde ese punto
3. Usar cursor para pagination

```http
POST /api/sync/pull
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "lastSyncTime": "2026-03-23T10:00:00Z",
  "lastCursor": null,
  "limit": 100,
  "includeDeleted": true
}
```

**Response**:
```json
{
  "status": "success",
  "changes": {
    "notes": [
      {
        "id": "note-uuid",
        "title": "New note",
        "content": "...",
        "contentHash": "abc123...",
        "action": "CREATE",      // CREATE, UPDATE, DELETE
        "remoteVersion": 1,
        "updatedAt": "2026-03-23T10:15:00Z",
        "updatedBy": "other-user-id",
        "encryption": {
          "encrypted": false
        }
      },
      {
        "id": "note-uuid-2",
        "action": "DELETE",
        "deletedAt": "2026-03-23T10:20:00Z"
      }
    ]
  },
  "nextCursor": "2026-03-23T10:30:00Z",  // Para próxima página
  "hasMore": false,
  "syncToken": "sync-token-xyz",         // Para confirmación
  "serverTime": "2026-03-23T11:00:00Z"
}
```

#### POST /api/sync/push (Enviar cambios)

**Lógica**:
1. Frontend envía cambios locales
2. Backend valida versiones
3. Detecta conflictos
4. Aplica cambios o marca conflicto

```http
POST /api/sync/push
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "changes": [
    {
      "id": "note-uuid",
      "action": "UPDATE",
      "entity": "note",
      "localVersion": 5,           // Versión que tengo localmente
      "data": {
        "title": "Updated title",
        "content": "...",
        "contentHash": "def456..."
      }
    },
    {
      "id": "note-uuid-2",
      "action": "DELETE",
      "entity": "note",
      "localVersion": 3
    }
  ]
}
```

**Response (sin conflictos)**:
```json
{
  "status": "success",
  "applied": [
    {
      "id": "note-uuid",
      "remoteVersion": 6,
      "appliedAt": "2026-03-23T11:05:00Z"
    }
  ],
  "conflicts": [],
  "errors": []
}
```

**Response (con conflictos)**:
```json
{
  "status": "partial",
  "applied": [...],
  "conflicts": [
    {
      "id": "note-uuid",
      "reason": "VERSION_MISMATCH",
      "localVersion": 5,
      "remoteVersion": 7,         // Server tiene versión superior
      "remoteData": {
        "title": "Title from another device",
        "content": "...",
        "updatedAt": "2026-03-23T10:50:00Z",
        "updatedBy": "device-2"
      },
      "suggestedResolution": "KEEP_REMOTE"  // o KEEP_LOCAL, MERGE
    }
  ],
  "errors": []
}
```

#### POST /api/sync/resolve-conflicts (Resolver conflictos)

```http
POST /api/sync/resolve-conflicts
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "resolutions": [
    {
      "id": "note-uuid",
      "resolution": "KEEP_LOCAL",  // KEEP_LOCAL, KEEP_REMOTE, MERGED
      "mergedData": null           // Si resolution = MERGED
    }
  ]
}
```

### 2.3 Algoritmo de Sincronización

#### Pull (Obtener cambios del servidor)

```javascript
// Backend
async function pull(userId, lastSyncTime, cursor) {
  // 1. Obtener notas modificadas desde lastSyncTime
  const notes = await Note.find({
    user_id: userId,
    updated_at: { $gt: lastSyncTime },
    deleted_at: null
  })
  .limit(100)
  .offset(cursor);

  // 2. Obtener notas eliminadas
  const deletedNotes = await DeletedNote.find({
    user_id: userId,
    deleted_at: { $gt: lastSyncTime }
  });

  // 3. Retornar con versionamiento
  return {
    notes: notes.map(n => ({
      ...n,
      action: 'UPDATE',
      remoteVersion: n.remote_version
    })),
    deletedNotes: deletedNotes.map(d => ({
      id: d.id,
      action: 'DELETE',
      deletedAt: d.deleted_at
    })),
    nextCursor: notes[notes.length - 1]?.id,
    hasMore: notes.length === 100
  };
}
```

#### Push (Enviar cambios)

```javascript
// Backend
async function push(userId, changes) {
  const applied = [];
  const conflicts = [];

  for (const change of changes) {
    const note = await Note.findById(change.id);

    if (!note) {
      // Nota no existe en servidor = es nueva
      if (change.action === 'CREATE') {
        const newNote = await Note.create({
          id: change.id,
          user_id: userId,
          ...change.data,
          local_version: 1,
          remote_version: 1,
          synced_at: now()
        });
        applied.push({
          id: change.id,
          remoteVersion: 1,
          appliedAt: now()
        });
      }
      continue;
    }

    // Nota existe = validar versión
    if (change.localVersion !== note.remote_version) {
      // CONFLICTO: Versiones no coinciden
      conflicts.push({
        id: change.id,
        reason: 'VERSION_MISMATCH',
        localVersion: change.localVersion,
        remoteVersion: note.remote_version,
        remoteData: {
          title: note.title,
          content: note.content,
          updatedAt: note.updated_at,
          updatedBy: note.updated_by
        },
        suggestedResolution: compareTimestamps(
          change.data.updatedAt || now(),
          note.updated_at
        ) ? 'KEEP_LOCAL' : 'KEEP_REMOTE'
      });
      continue;
    }

    // Sin conflicto: aplicar cambio
    if (change.action === 'UPDATE') {
      await Note.update(change.id, {
        ...change.data,
        remote_version: note.remote_version + 1,
        synced_at: now()
      });
      applied.push({
        id: change.id,
        remoteVersion: note.remote_version + 1,
        appliedAt: now()
      });
    } else if (change.action === 'DELETE') {
      await Note.softDelete(change.id);
      applied.push({
        id: change.id,
        deletedAt: now()
      });
    }
  }

  return { applied, conflicts };
}
```

### 2.4 Detección de Conflictos

```javascript
// services/conflictService.js

class ConflictService {
  /**
   * Detectar si hay conflicto entre versiones local y remota
   */
  detectConflict(local, remote) {
    // Conflicto si:
    // 1. Versión local != versión remota en servidor
    // 2. Contenido cambió en ambos lados

    if (local.version !== remote.lastKnownVersion) {
      // ¿Cambió localmente?
      const localChanged = local.contentHash !== local.lastSyncedHash;

      // ¿Cambió remotamente?
      const remoteChanged = remote.contentHash !== remote.lastSyncedHash;

      return localChanged && remoteChanged;
    }

    return false;
  }

  /**
   * Resolver conflicto con diferentes estrategias
   */
  resolveConflict(local, remote, strategy = 'KEEP_LOCAL') {
    switch (strategy) {
      case 'KEEP_LOCAL':
        // Usar versión local, incrementar versión
        return {
          ...local,
          version: Math.max(local.version, remote.version) + 1
        };

      case 'KEEP_REMOTE':
        // Usar versión remota
        return {
          ...remote,
          version: remote.version
        };

      case 'MERGE':
        // Merge manual o automático (3-way merge)
        return this.threeWayMerge(
          local.lastSynced,  // Versión anterior común
          local.current,
          remote.current
        );

      default:
        throw new Error('Unknown resolution strategy');
    }
  }

  /**
   * 3-way merge: base + local + remote
   */
  threeWayMerge(base, local, remote) {
    // Detectar qué cambió en cada lado
    const localChanges = diff(base, local);
    const remoteChanges = diff(base, remote);

    // Si cambiaron diferentes campos → no hay conflicto real
    if (!hasOverlap(localChanges, remoteChanges)) {
      return merge(local, remote);
    }

    // Si cambiaron los mismos campos → conflicto
    // Opción: usar CRDT (Automerge) para resolver automáticamente
    return {
      conflict: true,
      local,
      remote,
      base,
      needsManualReview: true
    };
  }
}
```

---

## FASE 3: COLABORACIÓN EN TIEMPO REAL

### Objetivo
Agregar Firestore para compartir notas con múltiples usuarios y sincronización en tiempo real.

### Arquitectura Firestore

```
Firestore:
  └─ workspace (database)
     ├─ users/{userId}
     │  ├─ email
     │  ├─ name
     │  ├─ isOnline
     │  └─ preferences
     │
     ├─ users/{userId}/notes/{noteId}
     │  ├─ title
     │  ├─ content
     │  ├─ sharedWith: [{ userId, permission }]
     │  └─ automergeData (CRDT)
     │
     ├─ changes/{userId}/{changeId}
     │  ├─ action (CREATE/UPDATE/DELETE)
     │  ├─ entity_id
     │  ├─ newValue
     │  └─ timestamp
     │
     └─ presences/{userId}
        ├─ isOnline
        ├─ currentView
        └─ lastActivity
```

### 3.1 WebSocket Events

```javascript
// Cliente → Servidor
CONNECT: { token }
  ↓
PULL: { lastSyncTime }
  ↓
PUSH: { changes }
  ↓
PRESENCE: { isOnline, currentView }
  ↓
REQUEST_COLLABORATION: { noteId, permission }

// Servidor → Clientes
SYNC_CHANGES: { changes, syncToken }
CONFLICT: { id, local, remote }
USER_JOINED: { userId, isOnline }
REAL_TIME_EDIT: { noteId, op, userId }
PRESENCE_UPDATE: { userId, isOnline }
```

### 3.2 CRDT (Conflict-free Replicated Data Type)

Usar Automerge para merge automático sin conflictos:

```javascript
// Antes: conflicto manual
Local:   "Hello world"
Remote:  "Hello universe"
Result:  ??? (necesita usuario)

// Después: Automerge (CRDT)
Local:   Automerge.from({ text: "Hello world" })
Remote:  Automerge.from({ text: "Hello universe" })
Result:  Automerge.merge(local, remote)  // "Hello universe" (merge automático)
```

---

## CONSIDERACIONES DE SEGURIDAD

### 1. Autenticación

✅ **Hacer**:
- Validar JWT de Google en backend
- Almacenar refresh tokens con bcrypt (nunca plano)
- JWT propio con expiración corta (15 min)
- HTTPS en producción
- CORS restrictivo

❌ **Evitar**:
- Confiar en tokens del cliente sin validar
- Almacenar tokens planos en BD
- Guardar tokens en localStorage (vulnerable a XSS)

### 2. Autorización

✅ **Hacer**:
- Validar que User A solo accede a sus datos
- Verificar permisos de colaboración
- Auditar cambios (quién hizo qué)

```javascript
// Middleware de autorización
export function authorize(req, res, next) {
  const resource = req.params.id;
  const userId = req.userId;

  // ¿Este usuario es dueño?
  const isOwner = await Note.findById(resource).user_id === userId;

  // ¿Es colaborador?
  const isCollaborator = await Note.findById(resource)
    .sharedWith
    .some(s => s.userId === userId);

  if (!isOwner && !isCollaborator) {
    return res.status(403).json({
      status: 'error',
      code: 'FORBIDDEN',
      message: 'You do not have access to this resource'
    });
  }

  next();
}
```

### 3. Criptografía

- **Data in transit**: HTTPS + TLS 1.3
- **Data at rest**: AES-256 para datos sensibles
- **Passwords**: bcrypt con salt

### 4. Rate Limiting

```javascript
// Limitar login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max: 5                      // 5 intentos
});

app.post('/auth/google', loginLimiter, authController.login);
```

### 5. CSRF Protection

```javascript
// Generar CSRF token en frontend
POST /auth/google
X-CSRF-Token: <random-token>
```

---

## INTEGRACIÓN FRONTEND-BACKEND

### Cambios en Frontend

#### Actualizar sync.js

```javascript
// Antes: Sincronizar con Google Drive
// Después: Sincronizar con backend

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

class BackendSync {
  async pull(lastSyncTime) {
    const response = await fetch(`${BACKEND_URL}/api/sync/pull`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lastSyncTime })
    });

    if (response.status === 401) {
      // Token expirado → refresh
      await this.refreshToken();
      return this.pull(lastSyncTime);  // Reintentar
    }

    const { changes } = await response.json();
    return changes;
  }

  async push(changes) {
    const response = await fetch(`${BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ changes })
    });

    const { applied, conflicts } = await response.json();

    if (conflicts.length > 0) {
      return this.handleConflicts(conflicts);
    }

    return applied;
  }

  async refreshToken() {
    const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: this.refreshToken
      })
    });

    const { accessToken } = await response.json();
    this.accessToken = accessToken;
    localStorage.setItem('refreshToken', this.refreshToken);
  }
}
```

#### Integración con Google Identity

```javascript
// index.html o auth.js

import { GoogleIdentityServices } from '@react-oauth/google';

function handleCredentialResponse(response) {
  // response.credential = ID Token de Google

  // 1. Enviar al backend
  const backendResponse = await fetch('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken: response.credential })
  });

  const { accessToken, refreshToken, user } = await backendResponse.json();

  // 2. Guardar en memory (no localStorage)
  window.appState = {
    accessToken,
    refreshToken,
    user
  };

  // 3. Guardar refresh token en localStorage (de corta vida)
  localStorage.setItem('refreshToken', refreshToken);

  // 4. Iniciar sincronización
  syncManager.start();
}
```

---

## RIESGOS Y MITIGACIONES

### Riesgo 1: Token Hijacking

**Problema**: Si alguien obtiene el JWT, accede a la cuenta.

**Mitigación**:
- JWT con expiración corta (15 min)
- Guardar en memory, no localStorage
- HTTPS obligatorio
- Rate limiting en auth
- Monitoreo de sesiones (IP, device)

### Riesgo 2: Conflictos de Datos

**Problema**: Dos dispositivos editan simultáneamente, uno sobrescribe al otro.

**Mitigación**:
- Versionamiento (local_version, remote_version)
- Detección automática de conflictos
- CRDT (Automerge) para merge automático
- Fallback a manual si es necesario

### Riesgo 3: Pérdida de Datos

**Problema**: Backend down → datos en IndexedDB no se sincronizan.

**Mitigación**:
- IndexedDB como source of truth local
- Service Worker sincroniza en background
- Retry automático con backoff exponencial
- Auditoría completa de cambios (nunca perder datos)

### Riesgo 4: Escalabilidad

**Problema**: Muchos usuarios → SQL lento.

**Mitigación**:
- Índices en (user_id, updated_at)
- Cursor-based pagination
- Caché Redis para sesiones
- Eventualmente migrar a Firestore (Fase 3)

### Riesgo 5: Colaboración Corrupta

**Problema**: Múltiples usuarios editan, datos se corrompen.

**Mitigación**:
- CRDT (Automerge) para operaciones concurrentes
- Vector clocks para ordenamiento
- Snapshot + delta encoding
- Validación en servidor

---

## TIMELINE DE IMPLEMENTACIÓN

### Semana 1: Setup Inicial
- [ ] Crear proyecto Node.js
- [ ] Setup Express + SQLite
- [ ] Crear models (User, Session)
- [ ] Crear auth endpoints

### Semana 2: Google Auth
- [ ] Integrar google-auth-library
- [ ] Validar JWT de Google
- [ ] Sistema de refresh tokens
- [ ] Testing con frontend

### Semana 3: CRUD + Sync
- [ ] Crear models (Note, Project)
- [ ] Endpoints CRUD
- [ ] Pull/Push endpoints
- [ ] Detección de conflictos

### Semana 4: Testing
- [ ] Test de sincronización
- [ ] Test de conflictos
- [ ] Test multi-dispositivo
- [ ] Performance testing

### Semana 5-6: Firestore (Opcional)
- [ ] Setup Firestore
- [ ] WebSocket server
- [ ] Real-time sync
- [ ] CRDT integration

---

## LINKS A CÓDIGO

**Frontend actual**:
- /home/user/projectmanagement/js/sync.js (reemplazar)
- /home/user/projectmanagement/js/db.js (adaptar schema)
- /home/user/projectmanagement/js/api/google-sync-orchestrator.js (referencia)

**Documentación existente**:
- ACCOUNT_SYNC_ARCHITECTURE.md (email-based switching)
- NOTES_SYSTEM.md (WikiLinks, YAML frontmatter)

---

## CONCLUSIÓN

Este plan implementa un backend robusto en 3 fases:
1. **Autenticación segura** con Google OAuth
2. **Sincronización eficiente** con detección de conflictos
3. **Colaboración en tiempo real** (opcional)

Cada fase se construye sobre la anterior, permitiendo deployment progresivo.
