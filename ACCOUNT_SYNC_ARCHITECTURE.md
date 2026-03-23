# Arquitectura de Sincronización de Cuentas Multi-Usuario

## Cambios Implementados

Esta arquitectura implementa las correcciones solicitadas para:
- ✅ Vincular todo al correo electrónico como clave primaria
- ✅ Mejorar sincronización de cuentas
- ✅ Mejorar coordinación entre cuentas
- ✅ Mejorar persistencia de asociaciones

## Principios Clave

### 1. **EMAIL COMO CLAVE PRIMARIA**

El correo electrónico (`workspace_user_email`) es ahora la clave primaria para toda coordinación de cuentas:

```
Account Identification:
├─ PRIMARY KEY: email (workspace_user_email)
├─ Secondary: Google Sub (nexus_stored_google_sub)
├─ Secondary: Google Aud (nexus_stored_google_aud)
└─ History Key: email (account history indexed by email)
```

**Razón**: El email es el identificador más estable y visible para los usuarios, a diferencia del `sub` que es opaco.

### 2. **Componentes Mejorados**

#### AccountChangeDetector (`account-detector.js`)
- Detecta cambios de cuenta comparando `sub` (Google ID)
- Detecta cambios de email dentro de la misma cuenta
- **NUEVO**: Maneja "email_updated" cuando el email cambia pero el sub es el mismo
- Registra historial de cuentas indexado por email

```javascript
// Cambio de cuenta (diferentes usuarios)
reason: 'account_switched'    // sub cambió
oldEmail: 'user1@example.com'
newEmail: 'user2@example.com'
sameSub: false

// Cambio de email (mismo usuario, alias)
reason: 'email_updated'       // sub igual, email diferente
oldEmail: 'user@example.com'
newEmail: 'user.alias@example.com'
sameSub: true
```

#### SessionManager (`session-manager.js`)
- Gestiona múltiples sesiones en IndexedDB
- Email es PRIMARY KEY en cada sesión
- **NUEVO**: Almacena `sub` y `aud` en metadatos para coordinación
- **NUEVO**: Sincroniza cambios de sesión entre tablas usando BroadcastChannel

```javascript
// Estructura de sesión
{
  id: 'session_user_timestamp_random',
  email: 'user@example.com',      // PRIMARY KEY
  metadata: {
    name: 'User Name',
    sub: 'google-sub-id',          // Para sincronización
    aud: 'google-audience-id',     // Para sincronización
  },
  idToken: '...',
  createdAt: 1234567890,
  lastActive: 1234567890,
  status: 'active'
}
```

#### StorageManager (`storage-manager.js`)
- **NUEVO**: `validateEmailAsKey()` verifica que si hay un token, hay un email
- Mantiene separación estricta entre storage global (localStorage) y por-sesión (sessionStorage)
- Email es una SESSION_KEY (por-pestaña)

#### Sync Manager (`sync.js`)
- **MEJORADO**: `handleAccountSwitch()` ahora detecta cambios de email dentro de la misma cuenta
- Parámetro `isSameAccount` optimiza la sincronización (skip `pull()` si es alias)
- Coordina con AccountChangeDetector para persistencia

### 3. **Flujos de Sincronización**

#### Flujo 1: Cambio de Cuenta (Usuario diferente)

```
Google Session cambió (sub ≠)
    ↓
AccountChangeDetector.compareWithStored()
    ↓ (reason: 'account_switched')
SessionManager.switchSession(newSessionId)
    ↓
StorageManager: carga datos de nueva sesión
    ↓
Sync.handleAccountSwitch(oldEmail, newEmail, isSameAccount=false)
    ↓
Reset _remoteChecked, _dirtyLocalChanges, accessToken
    ↓
Pull + Push nuevo ciclo
```

#### Flujo 2: Cambio de Email (Mismo Usuario)

```
Google Token cambió (email ≠, sub =)
    ↓
AccountChangeDetector.compareWithStored()
    ↓ (reason: 'email_updated', sameSub=true)
SessionManager: actualiza email en session actual
    ↓
StorageManager: actualiza workspace_user_email
    ↓
Sync.handleAccountSwitch(oldEmail, newEmail, isSameAccount=true)
    ↓
Mantiene _remoteChecked, accessToken
    ↓
Push (sin Pull completo)
```

#### Flujo 3: Cambio de Sesión Entre Tablas

```
Tab 1: SessionManager.switchSession()
    ↓
BroadcastChannel('session-sync').postMessage()
    ↓
Tab 2: recibe evento
    ↓
Si Tab 2 no tiene sesión activa:
  └─ SessionManager.switchSession() en Tab 2
Si Tab 2 tiene sesión diferente:
  └─ Ignora (cada tab mantiene su sesión)
```

### 4. **Garantías de Integridad**

#### Prevención de Pérdida de Datos

1. **Ghost Wipe Guard**: `_remoteChecked` impide que un push vacío borre datos remotos
2. **Email Validation**: `StorageManager.validateEmailAsKey()` previene estado inconsistente
3. **Dirty Flag**: Tracks cambios no confirmados en Drive
4. **Atomic Switches**: SessionManager.switchSession() es atómico

#### Prevención de Fuga de Credenciales

1. **Session Isolation**: sessionStorage diferente por pestaña
2. **Sensitive Keys Protection**: workspace_lock_hash, nexus_salt nunca en sessionStorage
3. **Secure Logout**: clearSessionData() limpia datos sensibles

### 5. **Claves de Almacenamiento**

#### Global (localStorage) — Compartido entre tabs
- `gdrive_sync_config` - Configuración Drive
- `workspace_lock_hash` - Password hash
- `nexus_salt` - Encryption salt
- `nexus_account_history` - Historial de cuentas

#### Session (sessionStorage) — Por pestaña
- `workspace_user_email` - **PRIMARY KEY**
- `workspace_user_name` - Nombre del usuario
- `google_id_token` - Token JWT
- `nexus_stored_google_sub` - Sub para coordinación
- `nexus_stored_google_aud` - Aud para coordinación

### 6. **Testing**

Ejecutar suite de pruebas:

```bash
npm test -- multi-account-test-suite
```

Tests cubren:
- ✅ Account change detection
- ✅ Storage routing (global vs session)
- ✅ Session switching atomicity
- ✅ Data persistence during switches
- ✅ Credential isolation

## Migración de Código Antiguo

Para aplicaciones que usan la arquitectura anterior:

1. Verificar que `workspace_user_email` siempre esté presente con `google_id_token`
2. Usar `StorageManager.validateEmailAsKey()` en startup
3. Actualizar listeners de `account:switched` para manejar `isSameAccount`
4. Agregar listeners de `session:switched` para sincronización entre tablas

## Ejemplos de Uso

### Detectar Cambio de Cuenta

```javascript
AccountChangeDetector.init((event) => {
  if (event.reason === 'account_switched') {
    console.log(`Switched: ${event.oldEmail} → ${event.newEmail}`);
    // event.sameSub será false
  } else if (event.reason === 'email_updated') {
    console.log(`Email alias: ${event.oldEmail} → ${event.newEmail}`);
    // event.sameSub será true
  }
});
```

### Cambiar de Sesión

```javascript
const sessionId = 'session_user_1234567890_abc123';
await SessionManager.switchSession(sessionId);
// Los datos de la nueva sesión se cargan en sessionStorage
// Se difunde a otras tablas automáticamente
```

### Validar Integridad

```javascript
StorageManager.validateSecurityBoundaries();  // Sensitive keys check
StorageManager.validateEmailAsKey();          // Email as PK check
```

## Consideraciones de Seguridad

1. **Email es públicamente visible** — no usar para información sensible
2. **Sub de Google es opaco** — usar para validaciones internas
3. **sessionStorage es por-origen** — vulnerable a XSS en mismo origen
4. **localStorage es persistente** — requiere HTTPS y CSP

## Problemas Conocidos Resueltos

- ❌ ~~Email no era clave primaria~~ ✅ Ahora lo es
- ❌ ~~Cambios de email dentro de cuenta ignorados~~ ✅ Detectados
- ❌ ~~Sin coordinación entre tablas~~ ✅ BroadcastChannel
- ❌ ~~Riesgo de pérdida de datos en switch~~ ✅ Validaciones
- ❌ ~~Historial de cuentas inconsistente~~ ✅ Indexado por email
