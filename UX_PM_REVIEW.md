# Revisión Técnica y UX/UI Senior

## Contexto actual observado
- La app ya tiene un flujo de sincronización con Google Drive basado en **push/pull** con detección simple de conflicto por `updatedAt` y bloqueo de push cuando el remoto es más nuevo que el último sync local.
- Existen indicadores de estado de sync en UI (`online/offline/syncing/error`) pero centrados en Drive, no en conectividad integral de la app.
- Zotero está integrado vía API con sincronización de ítems top-level, pero sin estructura jerárquica de resúmenes dentro del editor.
- La arquitectura de permisos se aproxima a visibilidad por `local/shared`, pero aún no modela espacios privados/compartidos con ACL granular por recurso.

---

## 1) Arquitectura de Usuario y Sincronización

### 1.1 Multi-dispositivo y edición simultánea
**Recomendación de producto/técnica:** implementar un esquema híbrido:

1. **Versionado por documento con vector mínimo de revisión**
   - Campos por documento: `docId`, `revision`, `lastModifiedAt`, `lastModifiedBy`, `deviceId`, `baseRevision`.
   - Cada edición local incrementa `revision` y guarda una operación (o parche) en cola.

2. **Estrategia de conflicto por tipo de contenido**
   - **Texto largo**: CRDT (Yjs/Automerge) o Operational Transform para colaboración real.
   - **Metadatos estructurados** (título, tags, status): Last-Writer-Wins con auditoría.
   - **Listas (tareas/subitems)**: merge por itemId + timestamps.

3. **UX de conflictos (cuando no haya CRDT completo)**
   - Banner no bloqueante: “Este documento cambió en otro dispositivo”.
   - CTA dual: `Comparar cambios` / `Mantener versión local`.
   - Vista diff por bloque (no diff plano gigante).

4. **Sesiones simultáneas**
   - Permitir múltiples sesiones por usuario, pero mostrar presencia: “Editando desde iPad / Web”.
   - Bloqueo pesimista opcional solo para secciones críticas (ej. configuración global), no para todo el documento.

### 1.2 Sincronización real-time o casi real
**Objetivo:** P95 de propagación < 2–3 s en online estable y fallback robusto.

- **Canal primario:** WebSocket/SSE para notificaciones de cambios.
- **Canal secundario:** background sync por lotes (cada 15–60 s adaptativo).
- **Política de red adaptativa:**
  - Wi-Fi: sync agresivo.
  - móvil/ahorro de datos: compresión + debounce mayor.
- **Cola offline-first:**
  - Persistir operaciones en IndexedDB.
  - Reintentos exponenciales con jitter.
  - Idempotencia por `operationId`.
- **Payloads eficientes:** enviar diffs/ops, no snapshots completos por defecto.

**KPIs sugeridos:**
- `sync_latency_p95`
- `conflict_rate`
- `sync_failure_rate`
- `avg_payload_kb`

---

## 2) Gestión de Archivos y Privacidad

### 2.1 Compartimentalización por “Espacios”
Modelo recomendado:

- **Workspace** (tenant del usuario/equipo)
  - **Espacios**
    - `Privado` (owner-only)
    - `Compartido` (miembros + permisos)
  - **Recursos** (docs, tareas, adjuntos, bibliografía)

### 2.2 Espacio Privado
- Cifrado en reposo (idealmente con clave derivada de credencial local si el producto lo permite).
- No indexar recursos privados en vistas compartidas ni búsquedas globales del equipo.
- Doble confirmación al mover un recurso de Privado → Compartido.

### 2.3 Espacio Compartido y permisos
Implementar ACL por recurso con mínimo:
- `owner`
- `editor`
- `viewer`

Reglas UX:
- Mostrar “quién tiene acceso” en un drawer lateral (avatar + rol).
- Estados claros: `Heredado del espacio` vs `Permiso directo`.
- Auditoría de eventos: compartir, revocar, editar.

### 2.4 Google Drive: reducir clics y navegación nativa
**Problema común:** modal tipo “web embebida” con demasiados pasos.

**Flujo objetivo (3 pasos máximo):**
1. **Seleccionar destino** (recientes + favoritos + breadcrumbs).
2. **Acción rápida**: `Subir aquí` / `Mover aquí` / `Crear carpeta`.
3. **Confirmación inline** con undo.

Mejoras concretas:
- Breadcrumb sticky + árbol lateral colapsable.
- Buscador por nombre en Drive con resultados instantáneos.
- Recientes de carpetas por usuario para atajos.
- Mantener contexto al volver (scroll/selección), evitando “reiniciar modal”.

---

## 3) Integración con Zotero: estructura de resúmenes

### 3.1 Problema
La vista principal puede saturarse si los resúmenes viven al mismo nivel que el documento largo.

### 3.2 Solución recomendada
Implementar **resúmenes jerárquicos por referencia**:

- Nivel 1: Colección/Proyecto
- Nivel 2: Referencia Zotero
- Nivel 3: Resúmenes (por tema/metodología/resultados)
- Nivel 4 (opcional): notas atómicas/citas destacadas

### 3.3 Patrón UI propuesto
- **Pestañas alternas** en editor:
  - `Documento`
  - `Resúmenes`
  - `Referencias`
- Dentro de `Resúmenes`, usar árbol anidado + panel detalle.
- Permitir “insertar al documento” desde resumen con una acción contextual.

### 3.4 Viabilidad técnica
Alta viabilidad incremental:
1. Añadir entidad `summaryNodes` en store.
2. Relación por `zoteroKey` + `projectId`.
3. Render en panel lateral virtualizado (si crece mucho).
4. Exportación opcional (Markdown/JSON) por rama.

---

## 4) Feedback del Sistema y UI Material 3 (M3)

### 4.1 Indicadores de estado de conexión
Diseñar estados globales y no intrusivos:
- `Online`
- `Offline`
- `Sincronizando`
- `Error de conexión`

Patrón recomendado:
- **Top app bar status dot** + tooltip textual.
- Snackbars solo en transiciones críticas (error persistente / reconexión).
- En móvil, usar ícono compacto + etiqueta en ajustes de sincronización.

### 4.2 Aplicación de Material 3
- Adoptar tokens M3 (`primary`, `surface`, `surfaceContainer`, `outline`, etc.).
- **Dynamic Color**:
  - Android: derivado del sistema (Material You).
  - Web/Desktop: fallback con esquema tonal predefinido y opción “usar color del sistema”.
- Componentes prioritarios:
  - Navigation Bar (móvil)
  - Navigation Rail (tablet/desktop)
  - Cards con elevación semántica
  - FAB contextual (1 acción primaria por vista)

### 4.3 Accesibilidad (WCAG AA)
Checklist mínimo:
- Contraste 4.5:1 en texto normal, 3:1 en texto grande/iconografía esencial.
- Focus visible en teclado (no solo hover).
- Targets táctiles ≥ 44x44 px.
- No depender solo del color para estado (agregar ícono + texto).
- Modo oscuro validado con pruebas de contraste reales.

---

## Roadmap sugerido (90 días)

### Fase 1 (Semanas 1-3)
- Modelo de Espacios + ACL base.
- Indicador global de conectividad.
- Rediseño de flujo Drive “Seleccionar/Subir/Mover” a 3 pasos.

### Fase 2 (Semanas 4-7)
- Cola offline con operaciones idempotentes.
- Resolución de conflictos mejorada (diff por bloque).
- Estructura jerárquica de resúmenes Zotero.

### Fase 3 (Semanas 8-12)
- Migración visual a tokens M3 + Dynamic Color.
- Hardening accesibilidad WCAG AA y test de usabilidad moderado.
- Métricas de sync y tablero de salud operacional.

---

## Métricas de éxito UX/Producto
- -30% tiempo para completar “subir/mover archivo en Drive”.
- -40% incidencias de “pérdida o sobrescritura de cambios”.
- +20% uso semanal de Zotero dentro de la app.
- +15 puntos en satisfacción percibida de claridad de estados de conexión.

