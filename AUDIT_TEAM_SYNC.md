# Auditoría: Sincronización entre Equipos y Manejo de Cuentas

**Fecha:** 2026-03-10
**Alcance:** `js/sync.js`, `js/app.js`, `js/utils.js`, `js/store.js`, `js/notifications.js`, `js/views/collaboration.js`, `js/components/chat.js`, `scripts/roles.js`
**Estado general:** ⚠️ Funcional para equipos pequeños, con brechas de seguridad y robustez que deben atenderse antes de un despliegue en equipos medianos o con datos sensibles.

---

## 1. Arquitectura de Sincronización (Google Drive)

### ✅ Lo que funciona bien

- **Modelo push/pull con detección de conflicto básica:** Antes de hacer push, se compara `remoteData.updatedAt` con `last_sync_local`. Si el remoto es más reciente, bloquea el push con un toast de advertencia. Evita sobrescrituras ciegas.
- **Auto-sync configurable:** Intervalo mínimo de 1 minuto, con pull antes de push en cada ciclo automático — orden correcto.
- **E2EE en tránsito:** El snapshot cifra `projects`, `tasks`, `cycles`, `decisions` y `documents` con AES-256-GCM antes de subir a Drive cuando `hasKey()` y `!isLocked()`. La bandera `e2ee: true` en el JSON permite que el receptor identifique si debe descifrar.
- **Timeout de red:** Todas las llamadas a Drive usan `fetchWithTimeout` (12 s por defecto), evitando cuelgues indefinidos.

### ❌ Problemas críticos

#### 1.1 `members` se sube en texto plano aunque E2EE esté activo

**Archivo:** `js/sync.js:400-416` (`getSnapshot`)

```js
// Solo se cifran estos 5 stores:
projects: await Promise.all(data.projects.map(encryptRecord)),
tasks:    await Promise.all(data.tasks.map(encryptRecord)),
cycles:   await Promise.all(data.cycles.map(encryptRecord)),
decisions:await Promise.all(data.decisions.map(encryptRecord)),
documents:await Promise.all(data.documents.map(encryptRecord)),
// members, logs, messages, annotations, snapshots → texto plano
```

**Impacto:** Nombres, emails y roles de todos los miembros del equipo se almacenan legibles en el archivo Drive compartido.
**Corrección:** Incluir `members` en el bloque de cifrado E2EE, o al menos excluir el campo `email` del snapshot público.

---

#### 1.2 Sincronización de `nexus_salt` entre dispositivos es un riesgo

**Archivo:** `js/utils.js:270-280` (`SYNCABLE_SETTINGS_KEYS`)

```js
export const SYNCABLE_SETTINGS_KEYS = [
    ...
    'nexus_salt',   // ← sal de derivación PBKDF2
    ...
];
```

La sal de derivación de clave PBKDF2 se sincroniza a través del archivo Drive compartido. Esto permite que todos los dispositivos del mismo usuario puedan derivar la misma clave AES a partir de la misma contraseña, lo cual es necesario. Sin embargo:

- Cualquier miembro del equipo con acceso al archivo Drive compartido puede leer la sal.
- Con la sal y la contraseña conocida (o débil), el atacante puede derivar la clave y descifrar todos los datos.
- Si un actor del equipo modifica la sal en el archivo remoto, `syncSettingsToLocalStorage` la sobreescribirá localmente, corrompiendo el acceso del usuario legítimo.

**Corrección recomendada:** La sal no debería sincronizarse en el archivo de equipo. Cada usuario debe tener su propia sal, derivada en su dispositivo, que no viaje al archivo compartido. Los datos cifrados deben incluir la sal en el envelope (junto al IV), sin necesidad de sincronizarla como setting global.

---

#### 1.3 Sin merge ni resolución granular de conflictos

**Archivo:** `js/sync.js:445-453`

El modelo de conflicto es "gana el más reciente": si el remoto es más nuevo que `last_sync_local`, se bloquea el push. Esto implica que:

- Dos usuarios que editan simultáneamente en modo offline no pueden hacer merge de sus cambios.
- El usuario que hace pull+push primero gana; el otro debe descartar sus cambios o hacer un push manual que sobreescriba.
- El snapshot es completo (full JSON), no incremental. Un solo cambio de un campo sube todo el workspace.

**Corrección recomendada:** Implementar vector clocks o CRDTs (Yjs/Automerge) por entidad para merge automático. A corto plazo, al menos exponer una UI de "hay conflicto" que permita elegir qué versión conservar por entidad.

---

#### 1.4 Push bloqueado sin retry automático

**Archivo:** `js/sync.js:449-452`

```js
if (remoteData && remoteData.updatedAt && remoteData.updatedAt > localUpdate) {
    showToast('⚠️ Hay cambios remotos más recientes...', 'warning', true);
    return; // push bloqueado, sin retry
}
```

Si el push es bloqueado, la UI muestra un toast pero el auto-sync no reintenta automáticamente (pull + push) en el siguiente tick.
**Corrección:** Encadenar pull automático cuando el push es bloqueado por conflicto, luego intentar el push nuevamente.

---

#### 1.5 `gdrive_folder_id` y `gdrive_file_id` en localStorage sin validación

Si el usuario borra el localStorage, los próximos push/pull crearán una nueva carpeta y archivo en Drive, sin notificar que existe un workspace previo.
**Corrección:** Siempre verificar por nombre de carpeta/archivo en Drive antes de crear uno nuevo; el `findFolder`/`findFile` ya existe, pero no se usa como fallback exhaustivo.

---

### ⚠️ Problemas menores de sincronización

| # | Descripción | Archivo / Línea |
|---|-------------|-----------------|
| 1.6 | `clearTimeout(id)` duplicado (bug de código muerto) | `sync.js:543-544` |
| 1.7 | `syncCalendar()` y `syncGoogleTasks()` no usan `fetchWithTimeout` | `sync.js:940, 963` |
| 1.8 | `syncTodoist()` no usa `fetchWithTimeout` | `sync.js:985` |
| 1.9 | El snapshot incluye `logs` completos (potencialmente voluminosos) sin paginación | `sync.js:388` |

---

## 2. Chat Engine (Drive P2P)

### ✅ Lo que funciona bien

- **Outbox local persistente:** Los mensajes se encolan en localStorage y se reintentan al reconectar.
- **Polling eficiente via Drive Changes API:** Usa `pageToken` incremental a 2.5 s para detectar solo los cambios nuevos, no lista todos los archivos.
- **Cifrado condicional por mensaje:** Si E2EE está activo, los mensajes se cifran individualmente antes de subir a Drive.
- **Deduplicación en recepción:** Antes de insertar un mensaje recibido, verifica si ya existe por `msg.id`.

### ❌ Problemas críticos

#### 2.1 Acumulación infinita de archivos de chat en Drive

**Archivo:** `js/sync.js:1142-1203` (`pollChat`)

Cada mensaje genera un archivo individual `msg_{timestamp}_{id}.json` en la carpeta `chat_messages/`. No hay ningún mecanismo de limpieza (TTL, archivado, compresión). Con uso normal de equipo, esta carpeta acumulará miles de archivos en semanas, degradando:
- El tiempo de polling (Drive Changes API tiene límites de rate)
- El espacio en Drive
- El tiempo de carga inicial si se necesita re-sincronizar

**Corrección:** Implementar un job de compactación periódica: agrupar mensajes del mismo día en un único archivo JSON de array, eliminando los individuales.

---

#### 2.2 Cifrado del mensaje no garantizado, sin notificación al usuario

**Archivo:** `js/sync.js:1116-1118`

```js
if (window.cryptoLayer && window.hasKey && window.hasKey() && !window.isLocked()) {
    try { payload = await encryptRecord(msg); } catch (e) { }
}
```

Si el cifrado falla (error silenciado con `catch (e) { }`), el mensaje sube en texto plano sin ninguna alerta. El usuario asume que sus mensajes son privados.
**Corrección:** Propagar el error de cifrado, o al menos registrarlo y mostrar un toast de advertencia antes de enviar en texto plano.

---

#### 2.3 Outbox tiene límite de 250 mensajes (mensajes perdidos en silencio)

**Archivo:** `js/sync.js:1057`

```js
writeChatOutbox(messages.slice(-250));
```

Si hay más de 250 mensajes pendientes de sincronización (e.g., trabajo offline prolongado), los más antiguos se descartan silenciosamente.
**Corrección:** Aumentar el límite o notificar al usuario cuando el outbox está cerca del límite.

---

#### 2.4 `sendMessage()` no establece `projectId`

**Archivo:** `js/components/chat.js:207-215`

El modelo de `messages` en IndexedDB tiene un campo `projectId` (indexado), pero el chat floating no lo usa — todos los mensajes son globales. No es posible filtrar mensajes por proyecto en la vista de colaboración.
**Corrección (mejora de diseño):** Pasar el proyecto activo como contexto opcional del chat, o documentar explícitamente que el chat es siempre global.

---

## 3. Manejo de Cuentas (Account Management)

### ✅ Lo que funciona bien

- **Hash SHA-256 para contraseña maestra:** Correctamente actualizado desde el hash djb2 legacy.
- **Brute-force protection (5 intentos / 30 s):** Implementado en login por contraseña.
- **Recovery codes criptográficamente seguros:** Usa `crypto.getRandomValues`, no `Math.random()`.
- **Migración automática de hash legacy:** Detecta hashes djb2 por longitud < 60 y los actualiza a SHA-256.
- **Auto-lock al ocultar ventana:** `visibilitychange` con `autolock_enabled`.

### ❌ Problemas críticos

#### 3.1 Contraseña mínima de 4 caracteres para clave maestra de cifrado

**Archivo:** `js/app.js:303`

```js
if (pwd.length < 4) { ... return; }
```

La contraseña es la clave de derivación PBKDF2 para AES-256-GCM. Con 4 caracteres y 310,000 iteraciones, el espacio de claves es tan pequeño que un ataque de diccionario offline es factible si el atacante obtiene el archivo Drive o el IndexedDB.
**Corrección:** Aumentar el mínimo a 8 caracteres e informar al usuario de la política de seguridad.

---

#### 3.2 Código de recuperación sin brute-force protection

**Archivo:** `js/app.js:415-430` (`authRecoverySubmit`)

```js
authRecoverySubmit.onclick = async () => {
    const entered = normalizeCode(authRecoveryCode.value.trim());
    const inputHash = await hashStr(entered);
    if (savedRecoveryHash && inputHash === savedRecoveryHash) { ... }
    // Sin contador de intentos, sin lockout
};
```

El flujo de recuperación permite intentos ilimitados. Un atacante con acceso físico puede bruteforcear el código de recuperación (formato `XXXX-XXXX-XXXX-XXXX` con charset de 32 caracteres = ~1 billón de combinaciones, pero sin lockout es viable).
**Corrección:** Aplicar el mismo mecanismo de lockout que el login por contraseña (5 intentos → 30 s de espera, o bloqueo permanente con aviso).

---

#### 3.3 Roles sin enforcement — cualquier usuario puede hacer cualquier operación

**Archivo:** `js/store.js` (todas las actions), `scripts/roles.js`

Los roles (`Miembro`, `Colaborador`, `Investigador principal`, etc.) existen como metadatos de display pero no hay ninguna validación en las actions del store. Cualquier usuario autenticado puede:
- Eliminar proyectos de otros
- Cambiar el estado de tareas asignadas a otros
- Añadir o eliminar miembros

`scripts/roles.js` implementa `RoleManager` con `canEditContent`, `canValidate`, `canChangeStatus`, pero **este módulo no está importado ni usado en ninguna view ni en el store**.
**Corrección:** Integrar `RoleManager` en las actions críticas del store, o al menos en las views que permiten edición/eliminación de recursos de otros usuarios.

---

#### 3.4 `clearStoredIdentity()` borra el perfil de usuario sin advertencia

**Archivo:** `js/sync.js:195-202`

```js
function clearStoredIdentity() {
    currentUser = null;
    localStorage.removeItem(ID_TOKEN_KEY);
    localStorage.removeItem('workspace_user_name');
    localStorage.removeItem('workspace_user_email');
    localStorage.removeItem('workspace_user_avatar');
    if (window.updateUserProfileUI) window.updateUserProfileUI();
}
```

Esta función es llamada cuando el ID token de Google expira o es inválido. El resultado es que el perfil del usuario (nombre, email, avatar) desaparece de la UI sin notificación explícita. Las acciones que el usuario siga tomando se registrarán con el nombre por defecto `'Usuario'`, corrompiendo el audit trail.
**Corrección:** Antes de borrar el perfil, mostrar un toast de aviso ("Tu sesión de Google ha expirado, por favor vuelve a iniciar sesión") y no borrar el nombre/avatar local hasta que el usuario confirme o se reautentica.

---

#### 3.5 `workspace_lock_hash` se importa desde Drive sin verificación de integridad

**Archivo:** `js/app.js:255-263` (`handleRemoteWorkspace`)

```js
const remoteHash = remoteData.settings?.workspace_lock_hash;
if (remoteHash) {
    localStorage.setItem('workspace_lock_hash', remoteHash);
    ...
    location.reload();
}
```

El hash de la contraseña maestra se reemplaza con el que venga del archivo Drive, sin verificar que provenga del mismo usuario ni sin ninguna firma digital. Un miembro del equipo con acceso al archivo Drive compartido podría reemplazar el `workspace_lock_hash` con un hash de una contraseña que él controle, efectivamente tomando el control del workspace de otro usuario al próximo acceso.

**Impacto:** **Alto** — permite a un miembro del equipo bloquear o tomar el control del workspace de otro.
**Corrección:** El `workspace_lock_hash` y `workspace_recovery_hash` no deben sincronizarse entre usuarios distintos. Cada usuario debe tener su propio hash local. Si el workspace es compartido, la contraseña maestra debe ser individual, no del equipo.

---

#### 3.6 `generateUID()` usa `Math.random()` (no criptográficamente seguro)

**Archivo:** `js/utils.js:322`

```js
export function generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
```

En un contexto colaborativo multi-dispositivo y multi-usuario, dos usuarios que crean entidades simultáneamente con el mismo timestamp podrían generar IDs idénticos (probabilidad baja pero no cero). El `crypto.getRandomValues` ya se usa en otros contextos del mismo codebase.
**Corrección:** Reemplazar `Math.random()` por `crypto.getRandomValues`:

```js
export function generateUID() {
    const arr = new Uint32Array(2);
    crypto.getRandomValues(arr);
    return Date.now().toString(36) + arr[0].toString(36) + arr[1].toString(36);
}
```

---

#### 3.7 `memberId` opcional permite identidad frágil

**Archivo:** `js/utils.js:141-159` (`getCurrentWorkspaceMember`)

La resolución del miembro activo usa cascada: `memberId → email → nombre`. Si el usuario no tiene `memberId` configurado y cambia de dispositivo o borra localStorage, el sistema intentará resolver por email. Si tampoco hay email, intenta por nombre (normalizado). Esto significa:

- Dos usuarios con nombre similar pueden verse vinculados accidentalmente.
- Un usuario sin email que cambia su nombre entre dispositivos pierde la continuidad de sus asignaciones.

**Corrección:** Hacer obligatorio el vínculo `memberId` durante el onboarding. Mostrar un aviso en la vista de Colaboración si el usuario activo no tiene `memberId` configurado.

---

### ⚠️ Problemas menores de cuentas

| # | Descripción | Archivo / Línea |
|---|-------------|-----------------|
| 3.8 | JWT de Google no se revalida automáticamente, solo al init | `sync.js:316-324` |
| 3.9 | No hay logout real (solo desconexión de Drive + borrado de identidad) | `sync.js:355-368` |
| 3.10 | `workspace_user_role` por defecto `'Miembro'` se asigna solo si no existe; no se actualiza desde Google | `sync.js:213-216` |
| 3.11 | `syncMembers()` crea miembros desde el panel de sync sin email ni avatar | `sync.js:914-923` |

---

## 4. Vista de Colaboración

### ✅ Lo que funciona bien

- **Semáforo de edición (15 min):** Detecta tareas editadas por otros en los últimos 15 minutos y las resalta con badge de advertencia.
- **`updatedById` como identidad primaria:** El semáforo usa `updatedById` (identityKey) cuando está disponible, con fallback a `updatedBy` (nombre), lo que reduce falsos positivos cuando hay usuarios con nombres similares.
- **Tabla de carga por miembro:** Muestra tareas activas vs terminadas por persona, útil para detectar desequilibrios de carga.

### ❌ Problemas

#### 4.1 `recentlyEditedByOthers` puede mostrar datos de usuarios desconocidos

Si `task.updatedBy` contiene el nombre de un usuario que ya no está en `members`, el sistema lo muestra igual (no valida que el editor exista en el equipo actual). Puede mostrar datos de equipos anteriores si el workspace fue reutilizado.

#### 4.2 Sin mecanismo de invitación formal al equipo

Para incorporar un nuevo miembro, el administrador debe:
1. Compartir el `sharedFolderId` de Drive manualmente
2. El nuevo miembro debe configurar su `clientId` de Google OAuth
3. Alguien debe agregar su nombre en el panel de Sync

No hay flujo de invitación por email, enlace de incorporación, ni verificación de que el nuevo miembro sea quien dice ser.

#### 4.3 `activityByUser` usa nombre string como clave del mapa

**Archivo:** `js/views/collaboration.js:16-28`

Si un usuario cambia su nombre (`workspace_user_name`), la actividad previa queda registrada bajo el nombre anterior, apareciendo como dos usuarios distintos en el resumen de las últimas 24 horas.
**Corrección:** Usar `updatedById` (identityKey) como clave del mapa de actividad, con fallback al nombre para display.

---

## 5. Sistema de Notificaciones

### ✅ Lo que funciona bien

- **Permiso solicitado correctamente:** Solo al init, y respeta la respuesta del usuario.
- **Una notificación por día:** Evita spam al usuario con múltiples reloads.

### ❌ Problemas

#### 5.1 Sin notificaciones de colaboración

No se notifica al usuario cuando:
- Otro miembro le asigna una tarea
- Hay mensajes nuevos de chat (solo badge visual)
- Hay conflictos de edición en sus tareas
- El workspace fue sincronizado con cambios de otros

Todas las notificaciones son solo para recordatorios de fechas límite del propio usuario.

#### 5.2 Notificaciones no distinguen entre proyectos

La notificación agrupa todos los proyectos del workspace. En un workspace con muchos proyectos activos, el usuario recibe una notificación vaga sin saber qué proyectos o equipos requieren atención.

---

## 6. `RoleManager` (scripts/roles.js) — Módulo sin integrar

El módulo `RoleManager` define permisos correctos para leads, revisores y autores, pero **no está importado en ningún archivo de vistas ni en el store**. Existe como código muerto.

**Acciones recomendadas:**
1. Importar `RoleManager` en al menos las vistas `backlog.js`, `board.js` y `medical.js`.
2. En las actions de `UPDATE_TASK` y `DELETE_TASK`, validar que el actor tiene permiso según su rol.
3. Mostrar controles de edición condicionalmente en la UI según el rol del usuario activo.

---

## 7. Resumen de Hallazgos por Severidad

### 🔴 Crítico (requiere atención inmediata)

| ID | Descripción | Impacto |
|----|-------------|---------|
| 3.5 | `workspace_lock_hash` importado desde Drive sin verificación — permite toma de control del workspace | Seguridad |
| 1.2 | `nexus_salt` sincronizado en archivo de equipo — facilita ataques de diccionario offline | Seguridad |
| 1.1 | `members` (emails, nombres) subidos en texto plano aunque E2EE esté activo | Privacidad |
| 3.2 | Recovery code sin brute-force protection | Seguridad |

### 🟠 Alto (atender en el corto plazo)

| ID | Descripción | Impacto |
|----|-------------|---------|
| 3.1 | Contraseña mínima de 4 caracteres para clave maestra de cifrado | Seguridad |
| 3.3 | Roles sin enforcement — cualquier usuario puede hacer cualquier operación | Control de acceso |
| 2.1 | Acumulación infinita de archivos de chat en Drive | Rendimiento / Datos |
| 1.3 | Sin merge de conflictos — sobrescritura ciega posible entre usuarios | Integridad de datos |
| 3.4 | `clearStoredIdentity()` borra perfil sin advertencia, corrompe audit trail | UX / Trazabilidad |

### 🟡 Medio (mejorar en el mediano plazo)

| ID | Descripción | Impacto |
|----|-------------|---------|
| 3.6 | `generateUID()` usa `Math.random()` — riesgo de colisión en uso colaborativo | Integridad de datos |
| 3.7 | `memberId` opcional genera identidad frágil entre dispositivos | Trazabilidad |
| 2.2 | Cifrado de mensajes de chat sin alerta cuando falla | Privacidad / UX |
| 1.4 | Push bloqueado sin retry automático | UX / Sincronización |
| 4.3 | `activityByUser` usa nombre como clave — fragmenta historial si el nombre cambia | Trazabilidad |
| 4.2 | Sin flujo de invitación formal al equipo | Incorporación |

### 🟢 Bajo (mejoras deseables)

| ID | Descripción | Impacto |
|----|-------------|---------|
| 5.1 | Sin notificaciones de eventos de colaboración (asignación, chat, conflicto) | UX colaborativo |
| 6.0 | `RoleManager` implementado pero no integrado en ninguna vista | Control de acceso |
| 2.4 | Mensajes de chat sin contexto de proyecto | Organización |
| 1.6 | `clearTimeout(id)` duplicado (código muerto) | Calidad de código |
| 1.7–1.8 | `syncCalendar`, `syncGoogleTasks`, `syncTodoist` sin timeout de red | Robustez |

---

## 8. Recomendaciones Prioritarias

1. **Separar el hash de contraseña por usuario:** `workspace_lock_hash` y `workspace_recovery_hash` deben ser exclusivos de cada dispositivo/usuario y nunca viajar en el archivo Drive compartido. Si el workspace necesita ser compartido, la clave de cifrado debe derivarse de un secreto compartido distinto a la contraseña maestra personal.

2. **Aplicar brute-force protection al código de recuperación:** El mismo mecanismo de 5 intentos con 30 s de lockout del login debe aplicarse al flujo de recuperación.

3. **Aumentar la longitud mínima de contraseña a 8 caracteres** y mostrar un indicador de fortaleza en el formulario de configuración.

4. **Integrar `RoleManager` en el store:** Las actions `UPDATE_TASK`, `DELETE_TASK`, `DELETE_PROJECT` deben verificar el rol del actor antes de ejecutarse.

5. **Implementar limpieza periódica del chat en Drive:** Ejecutar un job de compactación semanal que agrupe mensajes de chat en archivos diarios o semanales, reduciendo el número de archivos en la carpeta `chat_messages/`.

6. **Hacer obligatorio el vínculo `memberId`:** Durante el primer uso del workspace, guiar al usuario para vincular su perfil con un miembro del equipo. Mostrar una advertencia visible en la vista de Colaboración si el vínculo no existe.

7. **No borrar el perfil de usuario al expirar la sesión de Google:** Mantener el nombre/email local aunque el ID token expire. Solo borrar cuando el usuario haga logout explícito.
