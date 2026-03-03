# Roadmap — Workspace de Producción

## Estado actual (v0.2)

La app es una PWA estática (HTML + CSS + JS vanilla) con IndexedDB offline-first.
Vistas operativas: Dashboard · Backlog · Tablero · Proyectos · Ciclos · Decisiones

---

## Módulos completados

- [x] Shell visual (dark theme glassmorphism, sidebar, topbar)
- [x] IndexedDB con CRUD completo (getAll, getById, updateRecord, deleteRecord)
- [x] Seed de datos demo al primer arranque
- [x] Router SPA sin dependencias
- [x] **Dashboard** — tareas activas, ciclos, bloqueos, progreso general
- [x] **Backlog** — tabla filtrable por proyecto / estado / prioridad, orden por urgencia
- [x] **Tablero (Board)** — kanban 6 columnas, cambio de estado inline
- [x] **Proyectos** — grid de tarjetas por tipo
- [x] **Ciclos** — lista con barra de progreso temporal
- [x] **Decisiones** — registro con contexto / decisión / impacto
- [x] Modal de creación para tareas, proyectos, ciclos y decisiones
- [x] Priority dots (urgente / alta / media / baja)
- [x] Indicador de vencidos

---

## Paso 1 — Detalle de Proyecto (vista interna)

Al hacer clic en una tarjeta de proyecto, abrir su vista detalle con:

- [ ] Header con nombre, tipo, estado y descripción
- [ ] Tabs internos: **Tareas** · **Ciclos** · **Decisiones** · **Documento**
- [ ] Tab Tareas: lista filtrada por `projectId`, con mismas opciones que Backlog
- [ ] Tab Documento: editor de texto plano/markdown con guardado automático en IndexedDB (`documents` store ya existe)
- [ ] Tab Decisiones: decisiones filtradas por `projectId`
- [ ] Tab Ciclos: ciclos del proyecto con su progreso
- [ ] Botón "Volver" al listado de proyectos

**Archivos a modificar:** `js/app.js`, `styles/components.css`

---

## Paso 2 — Documento Vivo (editor in-app)

Editor liviano de texto con estructura para cada proyecto:

- [ ] Área de texto con soporte de Markdown simple (renderizado con `marked.js` CDN)
- [ ] Modo edición ↔ modo lectura con toggle
- [ ] Guardado automático al perder foco (debounce 800ms → `dbAPI.updateRecord`)
- [ ] Secciones sugeridas en el placeholder: Propósito · Esquema · Acuerdos · Próximos pasos
- [ ] Timestamp de última edición visible

**Archivos a modificar:** `js/app.js`, `styles/components.css`
**Dependencia nueva:** `marked.js` vía CDN en `index.html`

---

## Paso 3 — Sidebar dinámico con proyectos reales

La sección "Trabajo Activo" del sidebar ahora es estática. Hacerla dinámica:

- [ ] Leer proyectos activos de IndexedDB al iniciar
- [ ] Renderizar cada proyecto como nav-item con su punto de color según tipo
- [ ] Clic en proyecto → navegar a su vista detalle (Paso 1)
- [ ] Refrescar la lista cuando se crea o archiva un proyecto

**Archivos a modificar:** `js/app.js`, `index.html`

---

## Paso 4 — Plantillas por tipo de proyecto

Al crear un proyecto, ofrecer una plantilla que pre-carga el documento vivo y tareas iniciales:

- [ ] **Artículo** → documento con: Propósito · Pregunta · Esquema · Referencias · Estado de manuscrito
- [ ] **Clase** → documento con: Audiencia · Objetivos · Material · Checklist de cierre
- [ ] **Capítulo / Libro** → documento con: Índice · Secciones · Fechas editoriales
- [ ] **Proyecto administrativo** → documento con: Oficio · Responsables · Documentos soporte · Fecha límite
- [ ] Selector de plantilla en el modal de creación de proyecto
- [ ] Tareas iniciales opcionales pre-cargadas según plantilla

**Archivos a modificar:** `js/app.js` (modal + seed de plantilla)

---

## Paso 5 — Mejoras al Tablero

- [ ] Contador de tareas vencidas por columna (badge rojo)
- [ ] Filtro por proyecto encima del board
- [ ] Tarjeta expandible (clic → panel lateral o modal con descripción + decisiones vinculadas)
- [ ] Campo `description` en tareas (textarea en modal de creación — ya en el schema, falta en UI)
- [ ] Indicador visual de subtareas (`parentId` ya existe en el schema)

**Archivos a modificar:** `js/app.js`, `styles/components.css`

---

## Paso 6 — Ciclos: asignación de tareas

- [ ] En la vista de un ciclo activo, mostrar sus tareas (`cycleId` ya existe en el schema)
- [ ] Modal o panel para asignar tareas al ciclo desde el backlog
- [ ] Progreso del ciclo calculado por % de tareas completadas (no solo tiempo)
- [ ] Al cerrar un ciclo: opción de migrar pendientes al siguiente ciclo

**Archivos a modificar:** `js/app.js`, `styles/components.css`

---

## Paso 7 — Calendario

Vista mensual de fechas clave:

- [ ] Grid de calendario (sin librería, renderizado con JS nativo)
- [ ] Mostrar tareas con `dueDate`, hitos y fechas de ciclos
- [ ] Click en día → lista de ítems de esa fecha
- [ ] Navegación mes anterior / mes siguiente
- [ ] Indicadores de color por tipo/prioridad

**Archivos a modificar:** `js/app.js`, `styles/components.css`
**Nav item a agregar:** `data-view="calendar"` en `index.html`

---

## Paso 8 — Subtareas

- [ ] El schema ya tiene `parentId`; activar la UI
- [ ] En detalle de tarea (modal/panel): sección "Subtareas" con lista + añadir inline
- [ ] En Backlog: opción de expandir fila para ver subtareas
- [ ] Progreso de tarea padre calculado por % de subtareas completadas

**Archivos a modificar:** `js/app.js`, `styles/components.css`

---

## Paso 9 — Service Worker y PWA completa

Convertir en PWA instalable con soporte offline real:

- [ ] Crear `sw.js` (service worker) con estrategia cache-first para assets estáticos
- [ ] Crear `manifest.json` con nombre, íconos, colores, `display: standalone`
- [ ] Agregar `<link rel="manifest">` y `<meta theme-color>` en `index.html`
- [ ] Background Sync para cola de cambios pendientes (`syncQueue` store ya existe)
- [ ] Banner de instalación en el topbar cuando el browser lo soporte

**Archivos nuevos:** `sw.js`, `manifest.json`
**Archivos a modificar:** `index.html`

---

## Paso 10 — Integración Google Drive (opcional, post-MVP)

- [ ] Autenticación OAuth2 con Google (client-side flow)
- [ ] Seleccionar carpeta raíz del workspace en Drive
- [ ] Asociar carpeta a proyecto (guardar `folderId` en el record de proyecto)
- [ ] Listar archivos de la carpeta en la tab "Archivos" del proyecto
- [ ] Abrir archivos directamente en Drive con un clic
- [ ] Guardar metadatos del workspace en `appDataFolder` (config interna oculta)
- [ ] Sincronización diferida de cambios locales usando la cola `syncQueue`

**Archivos nuevos:** `js/drive.js`
**Archivos a modificar:** `js/app.js`, `index.html`

---

## Deuda técnica

| # | Ítem | Prioridad |
|---|------|-----------|
| T1 | Eliminar los links estáticos de "Trabajo Activo" en sidebar (Paso 3) | Alta |
| T2 | Agregar campo `description` a las tareas en el modal de creación | Media |
| T3 | Manejar error de IndexedDB gracefully en la UI (no solo console.error) | Media |
| T4 | Validación de fechas en ciclos (fin > inicio) | Baja |
| T5 | Confirmación antes de eliminar registros | Media |
| T6 | Paginación o scroll virtual en Backlog cuando hay muchos ítems | Baja |

---

## Orden de implementación recomendado

```
Paso 1 → Paso 3 → Paso 2 → Paso 4 → Paso 5 → Paso 6 → Paso 7 → Paso 8 → Paso 9 → Paso 10
```

Los pasos 1, 2 y 3 son el núcleo funcional que convierte la app de un shell a una herramienta de uso diario real.
