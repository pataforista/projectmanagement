# Auditoría técnica detallada: sincronización, vinculación y cifrado

**Fecha:** 2026-03-15  
**Alcance revisado:** `js/sync.js`, `js/utils/crypto.js`, `js/utils.js`, `js/app.js`, `js/store.js`, `js/components/chat.js`  
**Objetivo:** detectar riesgos reales de pérdida de datos, conflictos de sincronización, fallas de vinculación entre dispositivos/cuentas y debilidades criptográficas.

---

## Resumen ejecutivo

- El sistema muestra mejoras importantes (merge por campo, ETag, anti-rollback por `snapshotSeq`, PBKDF2 600k, bloqueo por rotación de clave), pero aún hay **5 riesgos relevantes**.
- El riesgo más alto operativo es un posible **DoS por parámetros criptográficos remotos no acotados**.
- El riesgo más alto de sincronización es **pérdida silenciosa de mensajes de chat** por límite local de outbox y por paginación incompleta en el polling.
- A nivel de privacidad, se mantiene exposición de metadatos y stores no cifrados en snapshots compartidos.

---

## Hallazgos

## 1) Riesgo de DoS por `pbkdf2Iterations` remoto sin límite superior

**Severidad:** Alta  
**Tipo:** Cifrado / disponibilidad

### Evidencia
- El snapshot exporta `pbkdf2Iterations` al remoto.  
- En pull, cualquier valor remoto mayor al local se acepta y se persiste directo en `localStorage` sin validar un máximo razonable.

### Impacto
Un actor con acceso de escritura al archivo compartido podría subir un valor excesivo (p.ej. millones o decenas de millones). El siguiente desbloqueo forzaría derivaciones PBKDF2 extremadamente costosas, congelando la UX o bloqueando dispositivos lentos.

### Recomendación
- Definir `MIN_ITER = 310000`, `TARGET = 600000` y `MAX_SAFE_ITER` (ej. 1,200,000 o calibrado por benchmark).  
- Al recibir remoto: `nexus_pbkdf2_iterations = clamp(remote, MIN_ITER, MAX_SAFE_ITER)` y registrar alerta si se recorta.

---

## 2) Salt global via snapshot compartido facilita “salt poisoning” entre colaboradores

**Severidad:** Media-Alta  
**Tipo:** Vinculación / cifrado

### Evidencia
- Se incluye `workspaceSalt` en snapshot remoto compartido.
- En pull, si cambia, se inyecta localmente y se fuerza lock.

### Impacto
La sal no es secreta por diseño, pero aquí actúa como parámetro global mutable por terceros con acceso de escritura al archivo. Un colaborador malicioso puede cambiarla para provocar bloqueos y reautenticaciones repetidas o desalinear derivaciones entre dispositivos.

### Recomendación
- Tratar la sal como parámetro por workspace pero **firmar/validar origen** (checksum autenticado con clave derivada) antes de aceptar cambios.
- Alternativa robusta: versionar parámetros KDF en un bloque protegido por autenticación y aplicar cambios solo bajo flujo explícito de rotación.

---

## 3) Polling de chat sin paginación explícita (`nextPageToken`) puede omitir mensajes

**Severidad:** Alta  
**Tipo:** Sincronización

### Evidencia
- `files.list` de Drive se invoca sin manejar `nextPageToken`.
- Luego, si todo “procesó bien”, se adelanta cursor temporal con `Date.now()`.

### Impacto
Si hay más archivos nuevos de los devueltos en la primera página, los restantes no se recorren y al adelantar cursor pueden quedar fuera del siguiente ciclo. Esto se agrava en equipos activos.

### Recomendación
- Implementar bucle de paginación hasta consumir todas las páginas (`pageToken` / `nextPageToken`) antes de mover `gdrive_chat_last_poll`.
- Opcional: persistir el mayor `modifiedTime` realmente procesado (no `Date.now()`).

---

## 4) Outbox de chat trunca en 250 elementos sin señal de pérdida

**Severidad:** Media  
**Tipo:** Sincronización / confiabilidad

### Evidencia
- `writeChatOutbox(messages.slice(-250))` corta cola local silenciosamente.

### Impacto
En periodos offline largos, mensajes antiguos pueden descartarse sin alertar al usuario. Esto rompe garantías de entrega eventual y dificulta auditoría de comunicación del equipo.

### Recomendación
- Elevar límite y añadir notificación cuando se alcance umbral (80%, 100%).
- Mejor: mover outbox a IndexedDB con cola persistente y política explícita (TTL o tamaño máximo configurable).

---

## 5) Cobertura E2EE parcial: `members`, `logs` y otros stores siguen en claro

**Severidad:** Media  
**Tipo:** Cifrado / privacidad

### Evidencia
- Se cifran `projects`, `tasks`, `cycles`, `decisions`, `documents`, `messages`, `annotations`, `snapshots`.
- `members`, `logs`, `notifications`, etc. no pasan por `encryptRecord` en snapshot.

### Impacto
Aunque ya se elimina `email` de `members`, todavía se exponen metadatos de identidad/actividad y trazas operativas en el JSON compartido.

### Recomendación
- Definir política de clasificación por store (confidencial vs. colaborativo en claro).  
- Si no hay razón fuerte para exponer `logs`, cifrarlos también o minimizar su contenido previo a exportación.

---

## Observaciones positivas

- Se implementó merge por campo con `_timestamps`, reduciendo pérdidas en edición concurrente.
- Hay guardas anti-rollback con `snapshotSeq` y defensa anti “ghost wipe” antes de primer pull.
- Manejo de 412 con reintentos acotados evita bucles infinitos.
- Mejora de seguridad de contraseña mínima a 8 caracteres y lockout en recuperación.

---

## Plan de remediación sugerido (priorizado)

1. **(P0)** Validación robusta de `pbkdf2Iterations` remoto + límites máximos.
2. **(P0)** Paginación completa en `pollChat` y cursor por `modifiedTime` real procesado.
3. **(P1)** Rehacer outbox de chat en IndexedDB con backpressure y alertas.
4. **(P1)** Endurecer gobernanza de `workspaceSalt` (flujo autenticado de cambios).
5. **(P2)** Revisar y ampliar cobertura E2EE por store según clasificación de datos.

---

## Nota metodológica

Esta auditoría se basó en inspección estática y razonamiento de flujo de ejecución/estados; no sustituye pruebas de caos ni pentest activo sobre entorno multiusuario real.
