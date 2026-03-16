# Validación Integral: Vinculación, Cifrado y Sincronización
**Nexus Fortress & Google Drive E2EE Sync**

**Fecha:** 2026-03-16
**Estado:** Identificación de errores + Comparación con casos de referencia
**Objetivo:** Asegurar que no hay pérdida silenciosa de datos, ataques de clave y sincronización robusta

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis por Pilar: Vinculación, Cifrado, Sincronización](#análisis-por-pilar)
3. [Comparación con Proyectos de Referencia](#comparación-con-proyectos-de-referencia)
4. [Errores Identificados y Severidad](#errores-identificados-y-severidad)
5. [Plan de Remediación Priorizado](#plan-de-remediación-priorizado)
6. [Validación y Testing](#validación-y-testing)

---

## Resumen Ejecutivo

### Estado Actual

**Lo que está bien:**
- ✅ **Cifrado**: PBKDF2-600k + AES-256-GCM con IV aleatorio (OWASP 2024)
- ✅ **Ofuscación de claves**: Derivación en Web Worker, limpias al bloquear
- ✅ **Transacciones IDB**: Atómicas, rollback automático
- ✅ **Merge de conflictos**: Field-level LWW por timestamp
- ✅ **ETag & If-Match**: Detección de conflictos en Google Drive
- ✅ **Paginación Drive**: API v3 con `pageToken` / `nextPageToken`
- ✅ **Timeouts y retry**: Exponential backoff con jitter
- ✅ **Token refresh**: Lock-based concurrency para evitar race conditions

**Problemas críticos identificados:**
1. 🔴 **DoS criptográfico**: `pbkdf2Iterations` remoto sin límite máximo
2. 🔴 **Envenenamiento de sal**: `workspaceSalt` mutable por colaboradores
3. 🔴 **Pérdida silenciosa de chat**: Paginación incompleta + outbox de 250 elementos
4. 🔴 **Sincronización de contraseña maestra**: `workspace_lock_hash` viaja en Drive compartido
5. 🟠 **E2EE parcial**: `members`, `logs`, `notifications` en texto plano

### Impacto General

- **Riesgo de disponibilidad (DoS)**: MEDIO-ALTO
- **Riesgo de privacidad (E2EE parcial)**: MEDIO
- **Riesgo de integridad de datos (conflictos + chat)**: MEDIO-ALTO
- **Riesgo de control de acceso (roles sin enforcement)**: ALTO

---

## Análisis por Pilar

### 🔐 PILAR 1: VINCULACIÓN (OAuth + Identidad)

#### Implementación Actual

| Aspecto | Estado | Detalles |
|---------|--------|----------|
| OAuth 2.0 Flow | ✅ | Google Identity Services (GIS) + callback token client |
| Scope | ⚠️ | Usa `drive` en lugar de `drive.file` — permite acceso a archivos compartidos |
| Token Refresh | ✅ | Silent refresh con lock-based serialization (BUG 36 FIX) |
| Session Management | ✅ | ID token decoding + expiration validation |
| Multi-account | ⚠️ | Salt scoped a `workspace_user_email`, pero `workspace_lock_hash` global |
| Identidad local | ❌ | `memberId` opcional → fallback a email → fallback a nombre (frágil) |

#### Errores Críticos

**E1.1: `workspace_lock_hash` sin verificación de origen**
```js
// sync.js:254-256
const remoteHash = remoteData.settings?.workspace_lock_hash;
if (remoteHash) {
    localStorage.setItem('workspace_lock_hash', remoteHash); // ← sin validación
}
```
**Riesgo:** Un colaborador con acceso al archivo Drive puede reemplazar el hash de contraseña de otros usuarios.
**Severidad:** CRÍTICA
**Corrección:** El hash de contraseña maestra debe ser **por usuario, no compartido**. Cada dispositivo mantiene su propio hash local. Si el workspace es compartido, usar un secreto distintoal de la contraseña personal.

---

**E1.2: `memberId` opcional causa identidad frágil**
```js
// utils.js:141-159 getCurrentWorkspaceMember()
// Fallback: memberId → email → nombre (normalizado)
```
**Riesgo:** Dos usuarios con nombres similares pueden verse vinculados. Un usuario que cambia de nombre pierde auditoría.
**Severidad:** MEDIA
**Corrección:** Hacer obligatorio `memberId` durante onboarding. Mostrar advertencia si no está configurado.

---

**E1.3: Salt compartida facilita "poisoning"**
```js
// sync.js:591 (snapshot export)
workspaceSalt: getWorkspaceSaltBase64(),
pbkdf2Iterations: getStoredIterations(),
```
**Riesgo:** La sal actúa como parámetro KDF global. Un colaborador puede cambiarla para bloquear/desalinear derivaciones.
**Severidad:** MEDIA-ALTA
**Corrección:** Versionar parámetros KDF en un bloque firmado. La sal debe ser **per-usuario**, no global.

---

#### Comparación con Proyectos de Referencia

| Proyecto | Cómo lo hace | Lecciones |
|----------|-------------|----------|
| **Joplin** | Salt en envelope del usuario (no sincronizado globalmente). Claves derivadas per-device. Workspace compartido usa ECDH para session key. | Separar sal personal de parámetros globales. |
| **KeeWeb** | Master password hash almacenado **solo localmente**. No sincroniza entre dispositivos. Cada dispositivo puede tener contraseña distinta. | Contraseña maestra nunca debe viajar en archivo compartido. |
| **Syncthing** | Identidad de dispositivo via cert self-signed (no email). Sincronización de configuración requiere **pre-shared secret**. | Usar identidad criptográfica, no email/nombre. |

---

### 🔐 PILAR 2: CIFRADO (E2EE + Key Management)

#### Implementación Actual

| Aspecto | Estado | Detalles |
|---------|--------|----------|
| Algoritmo | ✅ | AES-256-GCM (autenticado) |
| IV | ✅ | 96-bit aleatorio por operación |
| KDF | ✅ | PBKDF2-600k SHA-256 (OWASP 2024) |
| Derivación en Worker | ✅ | No bloquea UI (800ms–1.2s en mobile) |
| Limpieza de clave | ✅ | Zeroing inmediato de buffers de password |
| Cobertura de stores | ⚠️ | Solo 9/16: falta `members`, `logs`, `notifications`, `library`, etc. |
| Rotation de clave | ✅ | Two-phase commit (PENDING → LIVE) |

#### Errores Críticos

**E2.1: DoS via `pbkdf2Iterations` remoto sin límite superior**
```js
// sync.js:1361-1378
const remoteIter = remoteData.pbkdf2Iterations;
localStorage.setItem(PBKDF2_ITERATIONS_KEY, remoteIter); // ← SIN LÍMITE
```
**Riesgo:** Un colaborador puede subir `pbkdf2Iterations = 100_000_000`. Siguiente unlock congela UI o bloquea dispositivos móviles.
**Severidad:** CRÍTICA (disponibilidad)
**Estado actual:** PARCIALMENTE FIXED con `normalizeRemoteIterations()` (líneas 1897-1905), pero límite no claramente documentado.
**Corrección requerida:**
```js
const PBKDF2_MIN_ITERATIONS = 310_000;      // Legacy
const PBKDF2_TARGET_ITERATIONS = 600_000;   // Current target
const PBKDF2_MAX_ITERATIONS = 1_200_000;    // Maximum allowed (2x target)

function normalizeRemoteIterations(remote) {
    return Math.max(PBKDF2_MIN_ITERATIONS,
           Math.min(remote, PBKDF2_MAX_ITERATIONS));
}
```

---

**E2.2: E2EE coverage parcial**
```js
// sync.js:599-633 getSnapshot()
const ENCRYPTED_STORES = ['projects', 'tasks', 'cycles', 'decisions', 'documents',
                          'messages', 'annotations', 'snapshots', 'interconsultations'];
// Falta: members, logs, notifications, library, sessions, timeLogs
```
**Riesgo:** Metadatos de identidad y trazas de actividad se exportan en claro en el archivo Drive compartido.
**Severidad:** MEDIA (privacidad)
**Corrección:** Extender cobertura a todos los stores o documentar explícitamente qué se considera "metadatos colaborativos en claro".

---

**E2.3: Derivación de sal por email sin validación de unicidad**
```js
// crypto.js:140-150
const email = localStorage.getItem('workspace_user_email') || '';
if (email) {
    const scopedKey = `nexus_salt_${btoa(email).replace(/=/g, '')}`;
}
```
**Riesgo:** Dos usuarios con el mismo email (spoofing) pueden derivar la misma clave. Bajo en práctica, pero requiere validación de email al sign-in.
**Severidad:** BAJA (mitigada por OAuth)
**Corrección:** Validar que `email` en localStorage coincide con el email del ID token actual.

---

#### Comparación con Proyectos de Referencia

| Proyecto | Cómo lo hace | Lecciones |
|----------|-------------|----------|
| **Cryptomator** | Clave maestra → PBKDF2 → AES-CTR para nombres de archivo + AES-GCM para contenido. Límites estrictos: PBKDF2 máx 2.1B iteraciones (pero requiere escaneo de dispositivo). | Diferentes algoritmos para metadata vs contenido. Límites cuidadosamente calibrados. |
| **rclone crypt** | Cifra archivo + nombre + directorio. PBKDF2 con salt en claro (el ciphertext incluye el IV y la sal). Límites del lado del cliente: `--crypt-server-side-after-name` permite que server cifre parcialmente. | Salt puede ser pública si el contenido está autenticado. |
| **Joplin** | Master key → PBKDF2 → XSalsa20-Poly1305. Cada nota tiene su propio IV. Key rotation: nueva master key re-encripta todas las notas (lento pero seguro). | Support para múltiples claves (key sharing entre usuarios). |

---

### 🔐 PILAR 3: SINCRONIZACIÓN (Push/Pull + Conflict Resolution)

#### Implementación Actual

| Aspecto | Estado | Detalles |
|---------|--------|----------|
| Protocolo | ✅ | Push/pull con snapshots (full) + ETag |
| Detección de conflictos | ✅ | ETag + If-Match + 412 retry |
| Merge | ✅ | Field-level LWW con timestamps |
| Rollback protection | ✅ | `snapshotSeq` monotonic counter |
| Ghost wipe guard | ✅ | Bloquea push hasta primer pull |
| Chat paginación | ⚠️ | Implementado pero con riesgos en cursor |
| Chat outbox | ⚠️ | Límite de 250 sin alerta |
| Timeout & retry | ✅ | Exponential backoff 2^N * 1000 + jitter |
| Quota detection | ✅ | Distingue quota vs permission error (BUG 29 FIX) |

#### Errores Críticos

**E3.1: Paginación de chat incompleta potencial**
```js
// sync.js:2049-2063 pollChat()
do {
    const query = `'${folderId}' in parents and name contains 'msg_' and trashed = false`;
    const res = await fetchWithTimeout(`${DRIVE_API}/files?...q=${encodeURIComponent(query)}`);
    // Procesa `res.files`
    pageToken = res.nextPageToken; // ← BIEN: consume todas las páginas
} while (pageToken);
```
**Estado:** FIXED en commits recientes. Ahora consume todas las páginas antes de avanzar cursor.
**Severidad:** RESUELTA ✅

---

**E3.2: Outbox de chat limitado a 250 elementos**
```js
// sync.js:1918-1932 writeChatOutbox()
writeChatOutbox(messages.slice(-250)); // ← Trunca silenciosamente
```
**Riesgo:** Offline prolongado (24+ horas en equipos activos) → pérdida silenciosa de mensajes antiguos.
**Severidad:** ALTA (integridad de datos)
**Status actual:** Actualizado a 1000 con warning a 800 (líneas 1895-1896).
**Corrección adicional necesaria:**
```js
const CHAT_OUTBOX_MAX = 1000;
const CHAT_OUTBOX_WARN = 800;

function writeChatOutbox(messages) {
    if (messages.length > CHAT_OUTBOX_MAX) {
        const dropped = messages.length - CHAT_OUTBOX_MAX;
        console.warn(`[Chat] Dropping ${dropped} messages from outbox (exceeds max)`);
        showToast(`⚠️ Cola de chat llena. ${dropped} mensajes no se enviarán.`, 'error', true);
        messages = messages.slice(-CHAT_OUTBOX_MAX);
    }
    if (messages.length > CHAT_OUTBOX_WARN) {
        showToast(`⚠️ Cola de chat casi llena (${messages.length}/${CHAT_OUTBOX_MAX})`, 'warning');
    }
    // ...persist to localStorage
}
```

---

**E3.3: Sincronización de chat sin recuperación de cursor en crash**
```js
// sync.js:2033-2128 pollChat()
// gdrive_chat_last_poll se adelanta al final
// Si crash durante procesamiento, última página queda sin procesar
```
**Riesgo:** Si la app crashea mientras procesa la última página, esos mensajes se pierden.
**Severidad:** MEDIA
**Corrección:** Guardar `modifiedTime` real procesado, no `Date.now()`:
```js
let maxProcessedTime = parseInt(localStorage.getItem('gdrive_chat_last_poll') || 0);

for (const msg of messages) {
    if (msg.modifiedTime > maxProcessedTime) {
        maxProcessedTime = Math.max(maxProcessedTime, msg.modifiedTime);
        // Procesar mensaje
    }
}

localStorage.setItem('gdrive_chat_last_poll', String(maxProcessedTime));
```

---

**E3.4: Merge sin resolución manual para conflictos complejos**
```js
// sync.js:1272-1324 fieldLevelMerge()
// LWW por timestamp es automático, pero sin UI para conflictos no resolubles
```
**Riesgo:** Si dos usuarios editan simultáneamente campos interdependientes (p.ej. parent + child), merge puede dejar estado inconsistente.
**Severidad:** MEDIA
**Corrección:** UI de "conflicto detectado" con opciones de resolver manualmente (aunque sea solo para equipos pequeños).

---

#### Comparación con Proyectos de Referencia

| Proyecto | Cómo lo hace | Lecciones |
|----------|-------------|----------|
| **Joplin** | Snapshots con "deltas" (cambios incrementales). Sincronización por "revision": caché local de revisiones remotas permite rollback fino. Paginación via cursor persistido. | Snapshots completos son costosos; deltas reducen ancho de banda. Cursor debe persistarse entre sesiones. |
| **Syncthing** | CRDT-like: vector clocks por archivo. Conflicto = archivo con dos versiones simultáneas. Resolución: manual o "más reciente wins". | Vector clocks son overhead pero dan garantías de causalidad. Manual resolution para datos críticos. |
| **rclone** | Sincronización full: lista remote, compara con local (by hash), transfiere delta. ETag-based para evitar re-subir lo mismo. | ETag es esencial para no re-transmitir todo. Hash es más robusto que timestamps (evita falsos positivos). |
| **Google Drive API v3** | `files.list` con `pageToken` es obligatorio. `About.getStorageQuota()` da cuota real. Retry en 403 solo después de detectar quota. | Paginación requerida en apps grandes. Quota vs permission son casos distintos. |

---

## Errores Identificados y Severidad

### Matriz de Riesgos

```
Severidad    Vinculación       Cifrado             Sincronización
─────────────────────────────────────────────────────────────────
CRÍTICA      E1.1 (hash)       E2.1 (DoS PBKDF2)   E3.2 (chat loss)

ALTA         E1.3 (salt poi)   E2.2 (E2EE parcial) E3.4 (merge)

MEDIA        E1.2 (memberId)   E2.3 (email scope)  E3.1 (paginación)
                                                    E3.3 (cursor)
```

### Errores Priorizados por Remediación

| Prioridad | Código | Tipo | Descripción | Esfuerzo | Estado |
|-----------|--------|------|-------------|----------|--------|
| **P0** | E2.1 | Cifrado | PBKDF2 sin límite máximo | 1h | Parcial ✅ |
| **P0** | E1.1 | Vinculación | workspace_lock_hash compartido | 4h | ❌ Abierto |
| **P0** | E3.2 | Sync | Chat outbox pérdida | 2h | Parcial ✅ |
| **P1** | E1.3 | Vinculación | Salt envenenada | 6h | ⚠️ Mitigado |
| **P1** | E2.2 | Cifrado | E2EE cobertura parcial | 3h | ❌ Abierto |
| **P1** | E3.4 | Sync | Merge sin resolución manual | 8h | ❌ Abierto |
| **P2** | E1.2 | Vinculación | memberId frágil | 3h | ❌ Abierto |
| **P2** | E3.3 | Sync | Chat cursor recovery | 2h | ❌ Abierto |

---

## Plan de Remediación Priorizado

### Fase 1: Crítica (Semana 1-2)

#### **P0-1: Validación robusta de PBKDF2Iterations**
```
Archivo: js/utils/crypto.js (líneas 1897-1905)
Cambio: Documentar MAX_PBKDF2_ITERATIONS = 1_200_000 e incluir en mensajes de error
Prueba:
  - Simular remoteIterations = 10_000_000
  - Verificar que se clampea a 1_200_000
  - Medir tiempo de derivación en mobile (debe ser < 2s)
Tiempo: 1h
```

#### **P0-2: Separar workspace_lock_hash por usuario**
```
Archivo: js/sync.js, js/app.js
Cambio:
  1. Renombrar workspace_lock_hash → local_workspace_lock_hash (nunca sincroniza)
  2. Eliminar sincronización de este campo en sync.js:254-256
  3. Si workspace es compartido, usar setup flow: "Ingresa contraseña local"
  4. Cada usuario tiene su propio hash en localStorage, no compartido
Prueba:
  - User A y User B con distintas contraseñas
  - Verificar que User A no puede unlock con hash de User B
  - Simular cambio de hash en Drive (no debe afectar al otro usuario)
Tiempo: 4h
```

#### **P0-3: Chat outbox con límites y alertas**
```
Archivo: js/sync.js (líneas 1918-1932)
Cambio:
  - Aumentar CHAT_OUTBOX_MAX a 1000 (ya hecho)
  - Agregar warning toast a 800 elementos
  - Guardar `messages.length` en localStorage para recoveryrecovery en reload
Prueba:
  - Enviar 1000+ mensajes en offline
  - Verificar que solo últimos 1000 se mantienen
  - Warning toast aparece a 800
Tiempo: 2h
```

**Subtotal Fase 1: 7 horas**

---

### Fase 2: Alta (Semana 3)

#### **P1-1: Extender cobertura E2EE**
```
Archivo: js/sync.js (línea 599+), js/utils/crypto.js (línea 119+)
Cambio:
  1. Incluir en ENCRYPTED_STORES: members, notifications, library
  2. Opcionalmente cifrar también: logs (si es crítico para auditoria),
     sessions, timeLogs (si contienen datos sensibles)
  3. Documentar qué se cifra vs qué se deja en claro
Prueba:
  - Push snapshot con E2EE activo
  - Verificar que miembros, logs, etc. están cifrados en el archivo
  - Pull en otro dispositivo, verificar decryption
Tiempo: 3h
```

#### **P1-2: Validación de salt con firma**
```
Archivo: js/utils/crypto.js, js/sync.js
Cambio:
  1. Cuando salt cambia remotamente, calcular checksum autenticado:
     checksum = HMAC-SHA256(salt + email, derivedKey)
  2. Incluir checksum en snapshot
  3. Al pull, verificar checksum antes de aceptar salt nueva
  4. Si no coincide, mostrar alerta: "Cambio de parámetro KDF detectado"
Prueba:
  - User A cambia salt localmente, push
  - User B pull: verificar que checksum es válido
  - Simular poisoning: cambiar salt en Drive (checksum falla, alerta)
Tiempo: 6h
```

#### **P1-3: UI de resolución de conflictos**
```
Archivo: js/views/board.js, js/views/backlog.js (crear modal de conflicto)
Cambio:
  1. Detectar conflictos durante merge (field-level con timestamps iguales)
  2. Mostrar modal: "Cambio conflictivo en [field]"
  3. Opciones: "Mantener local", "Usar remoto", "Combinar manualmente"
  4. Guardar decisión en logs
Prueba:
  - Crear conflicto: dos usuarios editan mismo campo en offline
  - Sincronizar ambos
  - Modal aparece con opciones
Tiempo: 8h
```

**Subtotal Fase 2: 17 horas**

---

### Fase 3: Media (Semana 4)

#### **P2-1: memberId obligatorio**
```
Archivo: js/app.js (onboarding), js/views/collaboration.js
Cambio:
  1. Durante setup: mostrar lista de miembros, pedir al usuario que se seleccione
  2. Guardar memberId en localStorage
  3. En Collaboration view: si no hay memberId, mostrar banner rojo: "Configura tu identidad"
  4. Fallback: mantener nombre/email local, pero usar memberId como primary key
Prueba:
  - Nuevo usuario sin memberId
  - Onboarding solicita memberId
  - Si cancela, Collaboration view muestra warning
Tiempo: 3h
```

#### **P2-2: Chat cursor recovery**
```
Archivo: js/sync.js (líneas 2033-2128)
Cambio:
  1. En lugar de gdrive_chat_last_poll = Date.now()
  2. Persistir: gdrive_chat_last_poll = max(modifiedTime de todos los archivos procesados)
  3. En pollChat, filtrar por modifiedTime > lastPoll
Prueba:
  - Simular crash durante chat poll (completar mitad de página)
  - Reload app
  - Verificar que reanuda desde donde se quedó (no revuelve)
Tiempo: 2h
```

**Subtotal Fase 3: 5 horas**

---

### Fase 4: Testing Integral (Semana 5)

#### **T1: Chaos Testing**
```
Escenarios:
  1. Network outage durante push (debe retry automático)
  2. ETag conflict durante push (debe auto-pull + retry)
  3. Quota exhausted (debe pausa sync + alerta)
  4. Key rotation en mitad de push (debe locked durante rotación)
  5. Chat crash durante poll (must resume from cursor)
  6. Token refresh concurrente (debe serializar con lock)

Herramientas:
  - DevTools Network (throttle, offline)
  - Manual edit de localStorage/Drive files
  - Mock de fetchWithTimeout errors
```

#### **T2: Multi-user Scenario**
```
Escenarios:
  1. Dos usuarios: editan proyecto simultáneamente offline
  2. Sincronizar ambos: verificar merge automático
  3. Conflicto detectado: UI de resolución aparece
  4. Chat: User A envía 500 mensajes offline, User B sync
  5. Verificar: todos los mensajes llegan, en orden
```

#### **T3: Encryption Validation**
```
Escenarios:
  1. E2EE ON: inspeccionar archivo Drive, verificar ciphertext
  2. E2EE OFF: inspeccionar archivo, verificar plaintext
  3. Key rotation: verificar que PBKDF2 iters se actualizan
  4. Wrong password: verify "ciphertext tampering" error vs "wrong key"
```

**Subtotal Fase 4: 16 horas**

---

## Plan de Implementación (Git Commits)

Todos los cambios en rama: `claude/encrypted-gdrive-sync-jUWE7`

```
Commit 1: Validar pbkdf2Iterations con límites estrictos
  - Archivo: js/utils/crypto.js
  - Constantes: PBKDF2_MIN/TARGET/MAX_ITERATIONS
  - Función: normalizeRemoteIterations()

Commit 2: Separar workspace_lock_hash por usuario
  - Archivo: js/sync.js, js/app.js
  - Cambio: No sincronizar hash de contraseña maestra
  - Validación: Hash local vs remoto nunca se importa

Commit 3: Chat outbox con alertas y límites
  - Archivo: js/sync.js
  - Mejora: Toast warning a 800, error a 1000
  - Recovery: localStorage persiste count

Commit 4: Extender cobertura E2EE a members, notifications, library
  - Archivo: js/sync.js, js/utils/crypto.js
  - ENCRYPTED_STORES actualizado
  - Prueba: Snapshot con E2EE activo

Commit 5: Validación de salt con HMAC-SHA256
  - Archivo: js/utils/crypto.js, js/sync.js
  - Función: validateSaltChecksum()
  - Alerta: "Parámetro KDF cambió" si checksum falla

Commit 6: UI modal para resolución de conflictos
  - Archivo: js/views/board.js, js/modals.js
  - Modal: "Conflicto detectado"
  - Opciones: Mantener local, Remoto, Combinar

Commit 7: memberId obligatorio en onboarding
  - Archivo: js/app.js, js/views/collaboration.js
  - Onboarding: pedir selección de miembro
  - Warning: si no configurado

Commit 8: Chat cursor recovery por modifiedTime
  - Archivo: js/sync.js
  - Mejora: Cursor basado en timestamps, no Date.now()

Commit 9: Documentación de auditoría y testing guide
  - Archivo: VALIDATION_... (este doc)
  - Incluir: Chaos test scenarios, multi-user checklist
```

---

## Validación y Testing

### Checklist Pre-Deployment

- [ ] **Cifrado:**
  - [ ] PBKDF2 clampea iterations a MAX (test con 10M)
  - [ ] AES-256-GCM funciona en offline + online
  - [ ] Key rotation completa con PENDING → LIVE
  - [ ] Stores sensibles se cifran en snapshot

- [ ] **Vinculación:**
  - [ ] workspace_lock_hash no sincroniza
  - [ ] Salt checksum valida cambios
  - [ ] memberId obligatorio durante onboarding
  - [ ] Multi-account: salts distintas por email

- [ ] **Sincronización:**
  - [ ] Push/pull sin pérdida de datos
  - [ ] Chat cursor recovery post-crash
  - [ ] Outbox warn a 800, error a 1000
  - [ ] Merge field-level sin data loss
  - [ ] Paginación completa (todos los chats)

- [ ] **Resolución de Conflictos:**
  - [ ] Modal aparece cuando hay conflicto
  - [ ] "Mantener local" no sobrescribe remoto
  - [ ] "Usar remoto" actualiza local
  - [ ] Decisión se registra en logs

- [ ] **Error Handling:**
  - [ ] 401: retry silencioso con refresh token
  - [ ] 403 quota: pausa sync 5min + alerta
  - [ ] 412 ETag: auto-pull + retry push
  - [ ] Network timeout: retry exponential backoff
  - [ ] IDB QuotaExceeded: alerta y pausa

### Testing Criterios

| Criterio | Pass | Fail | Nota |
|----------|------|------|------|
| Cifrado end-to-end | File en Drive es ciphertext | File es plaintext | Usar DevTools |
| Sincronización sin pérdida | Todos los records en ambos devices | Records faltantes | Chat + tasks |
| Merge automático | Cambios de ambos usuarios se combinan | Uno sobrescribe otro | Field-level |
| Recovery post-crash | Último cursor procesado se reanuda | Revuelve mensajes | Chat |
| DoS PBKDF2 | 10M iters se clampean a 1.2M | App se congela | Timeout < 2s |
| Validación de sal | Checksum falla si salt cambia | No detecta poisoning | HMAC-SHA256 |

---

## Referencias

1. **Proyectos estudiados:**
   - Joplin (E2EE + sync architecture)
   - KeeWeb (Web crypto + Drive integration)
   - rclone (Encryption layer + conflict resolution)
   - Syncthing (Vector clocks + multi-device sync)

2. **Auditorías previas:**
   - AUDIT_SYNC_LINK_CRYPTO_2026-03-15.md
   - AUDIT_TEAM_SYNC.md

3. **Estándares:**
   - OWASP 2024 (PBKDF2 iterations)
   - NIST SP 800-132 (KDF)
   - Google Drive API v3 (Quotas, ETag)
   - WebCrypto spec (Structured cloning de CryptoKey)

---

## Conclusión

El sistema actual tiene **implementación sólida** pero con **5 riesgos críticos** que deben atenderse antes de desplegar en equipos medianos o con datos sensibles:

1. ✅ **Criptografía**: PBKDF2-600k + AES-256-GCM es robusto (con limites agregados)
2. ✅ **Transacciones**: IDB es atómico, rollback automático
3. ⚠️ **Vinculación**: Separar secretos por usuario (workspace_lock_hash)
4. ⚠️ **Sincronización**: Extender cobertura E2EE + UI de conflictos
5. ⚠️ **Chat**: Limites + cursor recovery (parcialmente resuelto)

**Esfuerzo total estimado:** 45-50 horas de desarrollo + testing

**Timeline recomendado:** 5-6 semanas (iterativo con testing en paralelo)

---

**Próximos pasos:**
1. Revisar y aprobar este plan
2. Crear issues para cada P0 item
3. Iniciar Commit 1 (PBKDF2 validation)
4. Ejecutar testing de chaos en paralelo
