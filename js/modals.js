import { store } from './store.js';
import { 
  esc, 
  showToast, 
  setCurrentMemberId, 
  fmtDate, 
  generateUID, 
  getCurrentWorkspaceUser, 
  getCurrentWorkspaceMember, 
  PROJECT_TYPES 
} from './utils.js';

/**
 * modals.js — All modal dialogs for creating/editing entities
 */

// ────────────────────────────────────────────────────────────────────────────
// Modal helpers
// ────────────────────────────────────────────────────────────────────────────

const STATUSES = ['Capturado', 'Definido', 'En preparación', 'En elaboración', 'En revisión', 'En espera', 'Terminado', 'Archivado'];
const TASK_TYPES = ['tarea', 'subtarea', 'entregable', 'hito', 'idea', 'decisión', 'recurso'];
window.STATUSES = STATUSES;
window.TASK_TYPES = TASK_TYPES;

/**
 * Crea e inyecta dinámicamente un overlay modal con el HTML suministrado.
 * Automáticamente reemplaza los logos SVG correspondientes a "Feather Icons".
 * 
 * @param {string} html - HTML que contiene la estructura interna (header, body, footer) del modal.
 * @returns {HTMLElement} Elemento DOM activo que representa este modal.
 */
function openModal(html) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  feather.replace();
  return overlay.querySelector('.modal');
}

/**
 * Cierra inmediatamente el modal actual destruyendo su nodo de overlay en el DOM.
 * No requiere parámetros.
 */
function closeModal() {
  document.getElementById('modal-overlay')?.remove();
}

// Close on Escape
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/**
 * Re-renders the current view after a modal action (create/edit/delete).
 */
function refreshCurrentView() {
  if (window.router) window.router._dispatch();
}

// ────────────────────────────────────────────────────────────────────────────
// Task Modal
// ────────────────────────────────────────────────────────────────────────────

/**
 * Despliega un formulario modal dinámico para Crear o Editar una tarea.
 * Determina el modo (edición vs creación) basándose en si se recibe un 
 * objecto tipo Tarea literal o sólo parámetros por defecto.
 * 
 * @param {Object|string} defaultProjectIdOrTask - Si es objeto Tarea carga modo Edición. Si es string, precarga ese proyecto.
 * @param {string} defaultStatus - Define el estado seleccionado por defecto (opcional).
 */
function openTaskModal(defaultProjectIdOrTask, defaultStatus) {
  const isEdit = !!defaultProjectIdOrTask && typeof defaultProjectIdOrTask === 'object' && !('clientX' in defaultProjectIdOrTask);
  const task = isEdit ? defaultProjectIdOrTask : null;
  const defProjectId = isEdit ? task.projectId : defaultProjectIdOrTask;
  const defStatus = isEdit ? task.status : (defaultStatus || 'Capturado');

  const projects = store.get.projects();
  const cycles = store.get.activeCycles();

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="${isEdit ? 'edit-2' : 'check-square'}"></i> ${isEdit ? 'Editar Tarea' : 'Nueva Tarea'}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      ${isEdit && task.createdBy ? `
        <div style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-secondary); padding:8px 12px; border-radius:8px; margin-bottom:16px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span><i data-feather="user" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i><b>Creado por:</b> ${esc(task.createdBy)} (${fmtDate(task.createdAt)})</span>
          ${task.updatedBy ? `<span><i data-feather="edit-2" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i><b>Última mod.:</b> ${esc(task.updatedBy)}</span>` : ''}
        </div>
      ` : ''}
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-input" id="task-title" placeholder="¿Qué hay que hacer?" value="${isEdit ? esc(task.title) : ''}" autofocus>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Proyecto</label>
          <select class="form-select" id="task-project">
            <option value="">Sin proyecto</option>
            ${projects.map(p => `<option value="${p.id}" ${p.id === defProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Ciclo</label>
          <select class="form-select" id="task-cycle">
            <option value="">Sin ciclo</option>
            ${cycles.map(c => `<option value="${c.id}" ${isEdit && c.id === task.cycleId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-select" id="task-status">
            ${STATUSES.map(s => `<option value="${s}" ${s === (isEdit ? task.status : (defStatus || STATUSES[0])) ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="task-type">
            ${TASK_TYPES.map(t => `<option value="${t}" ${isEdit && task.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Visibilidad</label>
          <select class="form-select" id="task-visibility" style="border-color: var(--accent-primary);">
            <option value="shared" ${(!isEdit || task?.visibility !== 'local') ? 'selected' : ''}>☁️ Equipo</option>
            <option value="local" ${isEdit && task?.visibility === 'local' ? 'selected' : ''}>🔒 Privada</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-select" id="task-priority">
            <option value="alta" ${isEdit && task.priority === 'alta' ? 'selected' : ''}>Alta</option>
            <option value="media" ${(!isEdit || task.priority === 'media') ? 'selected' : ''}>Media</option>
            <option value="baja" ${isEdit && task.priority === 'baja' ? 'selected' : ''}>Baja</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Asignado a</label>
          <select class="form-select" id="task-assignee">
            <option value="">Sin asignar</option>
            ${store.get.members().map(m => `<option value="${m.id}" ${isEdit && task.assigneeId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha límite</label>
          <input class="form-input" type="date" id="task-due" value="${isEdit && task.dueDate ? task.dueDate : ''}">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-textarea" id="task-desc" placeholder="Contexto, notas, referencias…" rows="2">${isEdit ? esc(task.description || '') : ''}</textarea>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
        <div class="form-group">
          <label class="form-label">Subtareas</label>
          <div id="subtasks-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;"></div>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="new-subtask" placeholder="Nueva subtarea…">
            <button class="btn btn-secondary" id="add-subtask" style="padding:0 12px;"><i data-feather="plus"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Etiquetas (separadas por coma)</label>
          <input class="form-input" id="task-tags" placeholder="ej. urgente, revisión, campo" value="${isEdit && task.tags ? esc(task.tags.join(', ')) : ''}" style="margin-bottom:8px;">
          
          <label class="form-label">Referencias de Zotero</label>
          <select class="form-select" id="task-refs" multiple style="height:100px;">
            ${store.get.library().map(lib => `
              <option value="${lib.id}" ${isEdit && (task.referenceIds || []).includes(lib.id) ? 'selected' : ''}>
                ${esc(lib.author.split(';')[0])} — ${esc(lib.title)}
              </option>`).join('')}
          </select>
          <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px;">Mantén Ctrl (o Cmd) presionado para seleccionar varias.</div>
        </div>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; width:100%;">
      <div>
        ${isEdit ? `<button class="btn btn-sm btn-ghost" id="task-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar Tarea</button>` : ''}
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="task-save"><i data-feather="check"></i> ${isEdit ? 'Guardar Cambios' : 'Crear Tarea'}</button>
      </div>
    </div>`);

  let subTasks = isEdit && task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : [];
  const subList = modal.querySelector('#subtasks-list');

  modal.querySelector('#add-subtask').addEventListener('click', () => {
    const input = modal.querySelector('#new-subtask');
    const text = input.value.trim();
    if (!text) return;
    const id = Date.now();
    subTasks.push({ id, title: text, done: false });
    input.value = '';
    renderSubtasks();
  });

  function renderSubtasks() {
    subList.innerHTML = subTasks.map(st => `
            <div style="display:flex; align-items:center; gap:8px; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px;">
                <input type="checkbox" ${st.done ? 'checked' : ''} onchange="this.dataset.id = ${st.id}">
                <span style="flex:1; font-size:0.84rem;">${esc(st.title)}</span>
                <button class="btn btn-icon" style="padding:2px;" onclick="this.dataset.id = ${st.id}"><i data-feather="trash-2" style="width:14px;height:14px;"></i></button>
            </div>
        `).join('');
    feather.replace();
  }

  if (isEdit) {
    modal.querySelector('#task-delete').addEventListener('click', async () => {
      const isLocal = task.visibility === 'local';
      const msg = isLocal
        ? `¿Estás seguro de eliminar la tarea "${task.title}" de tu dispositivo local?`
        : `¿Estás seguro de eliminar la tarea "${task.title}"?\n\n⚠️ Esta tarea pertenece a un PROYECTO COMPARTIDO. Esto afectará al Google Drive del equipo.`;

      if (confirm(msg)) {
        await store.dispatch('DELETE_TASK', { id: task.id });
        closeModal();
        refreshCurrentView();
      }
    });
  }

  // Handle subtask checkbox events when editing
  subList.addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
      const sid = parseInt(e.target.dataset.id, 10);
      const st = subTasks.find(x => x.id === sid);
      if (st) st.done = e.target.checked;
    }
  });

  subList.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (btn && btn.dataset.id) {
      const sid = parseInt(btn.dataset.id, 10);
      const idx = subTasks.findIndex(x => x.id === sid);
      if (idx !== -1) {
        subTasks.splice(idx, 1);
        renderSubtasks();
      }
    }
  });

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#task-save').addEventListener('click', async () => {
  const title = modal.querySelector('#task-title').value.trim();
  if (!title) { showToast('El título es obligatorio.', 'error'); return; }

  const tags = modal.querySelector('#task-tags').value.split(',').map(t => t.trim()).filter(t => t);

  const payload = {
    title,
    projectId: modal.querySelector('#task-project').value || null,
    cycleId: modal.querySelector('#task-cycle').value || null,
    status: modal.querySelector('#task-status').value,
    type: modal.querySelector('#task-type').value,
    priority: modal.querySelector('#task-priority').value,
    assigneeId: modal.querySelector('#task-assignee').value || null,
    dueDate: modal.querySelector('#task-due').value || null,
    description: modal.querySelector('#task-desc').value.trim(),
    subtasks: subTasks,
    tags,
    referenceIds: Array.from(modal.querySelector('#task-refs').selectedOptions).map(o => o.value),
    visibility: modal.querySelector('#task-visibility').value
  };


  if (isEdit) {
    payload.id = task.id;
    await store.dispatch('UPDATE_TASK', payload);
  } else {
    await store.dispatch('ADD_TASK', payload);
  }
  closeModal();
  refreshCurrentView();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Project Modal
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construye el modal de Creación o Edición de Proyectos. 
 * Incluye la renderización de opciones de color, control de estados 
 * y advertencias previas de eliminación de dependencias vinculadas.
 * 
 * @param {Object} p - El objeto Proyecto en modo edición. Null para modo creación.
 */
function openProjectModal(p = null) {
  const isEdit = !!p && typeof p === 'object' && !('clientX' in p);
  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="briefcase"></i> ${isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Nombre *</label>
        <input class="form-input" id="proj-name" placeholder="ej. Artículo: Cognición y Memoria" value="${isEdit ? esc(p.name) : ''}" autofocus>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Visibilidad (Sincronización)</label>
          <select class="form-select" id="proj-visibility" style="border-color: var(--accent-primary);">
            <option value="shared" ${(!isEdit || p?.visibility === 'shared') ? 'selected' : ''}>☁️ Compartido (Equipo)</option>
            <option value="local" ${isEdit && p?.visibility === 'local' ? 'selected' : ''}>🔒 Privado (Solo local)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="proj-type">
            ${Object.entries(PROJECT_TYPES).map(([k, v]) => `<option value="${k}" ${isEdit && p?.type === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-select" id="proj-status">
            <option value="activo" ${isEdit && p?.status === 'activo' ? 'selected' : ''}>Activo</option>
            <option value="planificado" ${isEdit && p?.status === 'planificado' ? 'selected' : ''}>Planificado</option>
            <option value="pausado" ${isEdit && p?.status === 'pausado' ? 'selected' : ''}>Pausado</option>
            <option value="archivado" ${isEdit && p?.status === 'archivado' ? 'selected' : ''}>Archivado</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <label class="form-label" style="margin:0;">Objetivo</label>
          <button class="btn btn-ghost btn-xs" id="btn-ai-goal" title="Generar descripción con IA" style="gap:4px; display:flex; align-items:center;">
            <i data-feather="zap" style="width:12px;"></i> IA
          </button>
        </div>
        <textarea class="form-textarea" id="proj-goal" placeholder="¿Qué resultado específico buscas?" rows="2">${isEdit ? esc(p?.goal || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Nota de Obsidian (URI)</label>
        <input class="form-input" id="proj-obsidian" placeholder="obsidian://open?vault=..." value="${isEdit ? esc(p?.obsidianUri || '') : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Enlace Google Drive (Carpeta/Archivo)</label>
        <input class="form-input" id="proj-drive" placeholder="https://drive.google.com/..." value="${isEdit ? esc(p?.driveUrl || '') : ''}">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Fecha de inicio</label>
          <input class="form-input" type="date" id="proj-start" value="${isEdit ? p?.startDate || '' : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de cierre</label>
          <input class="form-input" type="date" id="proj-end" value="${isEdit ? p?.endDate || '' : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Color del proyecto</label>
        <div style="display:flex; gap:10px; flex-wrap:wrap;" id="proj-colors">
          ${['#5e6ad2', '#16a085', '#8e44ad', '#c0392b', '#d35400', '#2980b9', '#f39c12', '#7f8c8d'].map(c =>
    `<div class="color-swatch" data-color="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${isEdit && p?.color === c ? '#fff' : 'transparent'};transition:all 0.15s;" title="${c}"></div>`
  ).join('')}
        </div>
        <input type="hidden" id="proj-color" value="${isEdit && p?.color ? p.color : '#5e6ad2'}">
      </div>
    </div>
    <div class="modal-footer" style="${isEdit ? 'justify-content: space-between;' : ''}">
      ${isEdit ? `<button class="btn btn-ghost" id="proj-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : '<div></div>'}
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="proj-save"><i data-feather="check"></i> ${isEdit ? 'Guardar cambios' : 'Crear proyecto'}</button>
      </div>
    </div>`);

  // Color swatches
  modal.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      modal.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
      sw.style.borderColor = '#fff';
      modal.querySelector('#proj-color').value = sw.dataset.color;
    });
  });
  if (!isEdit) modal.querySelector('.color-swatch').style.borderColor = '#fff'; // select first only if new

  // AI button for generating project goal
  modal.querySelector('#btn-ai-goal')?.addEventListener('click', async () => {
    const name = modal.querySelector('#proj-name').value.trim();
    const type = modal.querySelector('#proj-type').value;
    if (!name) {
      showToast('Ingresa el nombre del proyecto primero.', 'warning');
      return;
    }

    const btn = modal.querySelector('#btn-ai-goal');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-feather="loader"></i> Generando...';
    btn.disabled = true;
    feather.replace();

    try {
      const prompt = `Proyecto: ${name}
Tipo: ${PROJECT_TYPES[type]?.label || type}

Genera un objetivo claro y conciso (2-3 oraciones) para este proyecto:`;

      const goal = await window.ollamaApi.generate(prompt, 'Eres un asistente de gestión de proyectos. Genera objetivos SMART para proyectos. Sé conciso y específico.');
      modal.querySelector('#proj-goal').value = goal.trim();
      showToast('Objetivo generado con IA.', 'success');
    } catch (e) {
      showToast('Error al generar objetivo: ' + e.message, 'error');
    } finally {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
      feather.replace();
    }
  });

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

  if (isEdit) {
    modal.querySelector('#proj-delete').addEventListener('click', async () => {
      const msg = p.visibility === 'local'
        ? '¿Estás seguro? Se borrarán también las tareas, ciclos y decisiones asociadas de forma permanente solo en tu dispositivo.'
        : '¿Estás seguro? Se borrarán también las tareas, ciclos y decisiones asociadas de forma permanente.\n\n⚠️ Este es un PROYECTO COMPARTIDO. Eliminarlo afectará al Google Drive de todo el equipo.';
      if (confirm(msg)) {
        await store.dispatch('DELETE_PROJECT', { id: p.id });
        closeModal();
        refreshCurrentView();
      }
    });
  }

  modal.querySelector('#proj-save').addEventListener('click', async () => {
    const name = modal.querySelector('#proj-name').value.trim();
    if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }

    const data = {
      name,
      type: modal.querySelector('#proj-type').value,
      status: modal.querySelector('#proj-status').value,
      goal: modal.querySelector('#proj-goal').value,
      obsidianUri: modal.querySelector('#proj-obsidian').value.trim(),
      driveUrl: modal.querySelector('#proj-drive').value.trim(),
      startDate: modal.querySelector('#proj-start').value || null,
      endDate: modal.querySelector('#proj-end').value || null,
      color: modal.querySelector('#proj-color').value,
      visibility: modal.querySelector('#proj-visibility').value,
    };

    if (isEdit) {
      await store.dispatch('UPDATE_PROJECT', { id: p.id, ...data });
    } else {
      await store.dispatch('ADD_PROJECT', { ...data, ownerId: getCurrentWorkspaceUser().memberId });
    }

    closeModal();
    refreshCurrentView();
    window.refreshSidebarProjects?.();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Cycle Modal
// ────────────────────────────────────────────────────────────────────────────

/**
 * Muestra el modal de Ciclos (iteraciones / timeboxing). 
 * Se encarga de mapear automáticamente el proyecto dependiente asociado.
 * 
 * @param {Object|string} defaultProjectIdOrCycle - ID inicial de proyecto o el Objeto Ciclo propiamente en edición.
 */
function openCycleModal(defaultProjectIdOrCycle) {
  const isEdit = typeof defaultProjectIdOrCycle === 'object' && defaultProjectIdOrCycle !== null && !('clientX' in defaultProjectIdOrCycle);
  const cycle = isEdit ? defaultProjectIdOrCycle : null;
  const defProjectId = isEdit ? cycle.projectId : defaultProjectIdOrCycle;

  const projects = store.get.projects();
  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="refresh-cw"></i> ${isEdit ? 'Editar Ciclo' : 'Nuevo Ciclo'}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Nombre del ciclo *</label>
        <input class="form-input" id="cycle-name" placeholder="ej. Semana de cierre — Intro" autofocus value="${isEdit ? esc(cycle.name) : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Proyecto</label>
        <select class="form-select" id="cycle-project">
          <option value="">Sin proyecto</option>
          ${projects.map(p => `<option value="${p.id}" ${p.id === defProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Objetivo del ciclo</label>
        <textarea class="form-textarea" id="cycle-goal" placeholder="¿Qué quieres lograr en este bloque temporal?" rows="2">${isEdit ? esc(cycle.goal || '') : ''}</textarea>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Fecha de inicio</label>
          <input class="form-input" type="date" id="cycle-start" value="${isEdit && cycle.startDate ? cycle.startDate : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de cierre</label>
          <input class="form-input" type="date" id="cycle-end" value="${isEdit && cycle.endDate ? cycle.endDate : ''}">
        </div>
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; width:100%;">
      <div>
        ${isEdit ? `<button class="btn btn-sm btn-ghost" id="cycle-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : ''}
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="cycle-save"><i data-feather="check"></i> ${isEdit ? 'Guardar Cambios' : 'Crear Ciclo'}</button>
      </div>
    </div>`);

  if (isEdit) {
    modal.querySelector('#cycle-delete')?.addEventListener('click', async () => {
      const proj = store.get.projectById(cycle.projectId);
      const isLocal = proj && proj.visibility === 'local';
      const msg = isLocal
        ? '¿Eliminar este ciclo de forma permanente de tu dispositivo?'
        : '¿Eliminar este ciclo?\n\n⚠️ Este ciclo pertenece a un PROYECTO COMPARTIDO. Afectará al Google Drive del equipo.';
      if (confirm(msg)) {
        await store.dispatch('DELETE_CYCLE', { id: cycle.id });
        closeModal();
        refreshCurrentView();
      }
    });
  }

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#cycle-save').addEventListener('click', async () => {
    const name = modal.querySelector('#cycle-name').value.trim();
    if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }

    const payload = {
      name,
      projectId: modal.querySelector('#cycle-project').value || null,
      goal: modal.querySelector('#cycle-goal').value,
      startDate: modal.querySelector('#cycle-start').value || null,
      endDate: modal.querySelector('#cycle-end').value || null,
      status: isEdit ? cycle.status : 'activo',
    };

    if (isEdit) {
      payload.id = cycle.id;
      await store.dispatch('UPDATE_CYCLE', payload);
    } else {
      await store.dispatch('ADD_CYCLE', payload);
    }

    closeModal();
    refreshCurrentView();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Decision Modal
// ────────────────────────────────────────────────────────────────────────────

// End of Decision Modal

function openDecisionModal(defaultProjectIdOrDecision) {
  const isEdit = typeof defaultProjectIdOrDecision === 'object' && defaultProjectIdOrDecision !== null && !('clientX' in defaultProjectIdOrDecision);
  const decision = isEdit ? defaultProjectIdOrDecision : null;
  const defProjectId = isEdit ? decision.projectId : defaultProjectIdOrDecision;
  const today = new Date().toISOString().slice(0, 10);

  const projects = store.get.projects();

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="zap"></i> ${isEdit ? 'Editar Decisión' : 'Nueva Decisión'}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Título de la decisión *</label>
        <input class="form-input" id="dec-title" placeholder="ej. Enfocar artículo en adultos mayores" autofocus value="${isEdit ? esc(decision.title) : ''}">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Proyecto</label>
          <select class="form-select" id="dec-project">
            <option value="">Sin proyecto</option>
            ${projects.map(p => `<option value="${p.id}" ${p.id === defProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Impacto</label>
          <select class="form-select" id="dec-impact">
            <option value="alta" ${isEdit && decision.impact === 'alta' ? 'selected' : ''}>Alto</option>
            <option value="media" ${(!isEdit || decision.impact === 'media') ? 'selected' : ''}>Medio</option>
            <option value="baja" ${isEdit && decision.impact === 'baja' ? 'selected' : ''}>Bajo</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Contexto</label>
        <textarea class="form-textarea" id="dec-context" placeholder="¿Cuál era la situación que requería esta decisión?" rows="2">${isEdit ? esc(decision.context || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Decisión tomada *</label>
        <textarea class="form-textarea" id="dec-decision" placeholder="Describe la decisión con precisión" rows="2">${isEdit ? esc(decision.decision || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" type="date" id="dec-date" value="${isEdit ? decision.date : today}">
      </div>
    </div>
    <div class="modal-footer" style="display:flex; justify-content:space-between; width:100%;">
      <div>
        ${isEdit ? `<button class="btn btn-sm btn-ghost" id="dec-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : ''}
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="dec-save"><i data-feather="check"></i> ${isEdit ? 'Guardar Cambios' : 'Registrar Decisión'}</button>
      </div>
    </div>`);

  if (isEdit) {
    modal.querySelector('#dec-delete').addEventListener('click', async () => {
      const proj = store.get.projectById(decision.projectId);
      const isLocal = proj && proj.visibility === 'local';
      const msg = isLocal
        ? `¿Estás seguro de eliminar la decisión "${decision.title}" de tu dispositivo local?`
        : `¿Estás seguro de eliminar la decisión "${decision.title}"?\n\n⚠️ Pertenece a un PROYECTO COMPARTIDO. Esto afectará al Google Drive del equipo.`;
      if (confirm(msg)) {
        await store.dispatch('DELETE_DECISION', { id: decision.id });
        closeModal();
        refreshCurrentView();
      }
    });
  }

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#dec-save').addEventListener('click', async () => {
    const title = modal.querySelector('#dec-title').value.trim();
    const decText = modal.querySelector('#dec-decision').value.trim();
    if (!title || !decText) { showToast('Título y decisión son obligatorios.', 'error'); return; }

    const payload = {
      title,
      projectId: modal.querySelector('#dec-project').value || null,
      context: modal.querySelector('#dec-context').value,
      decision: decText,
      impact: modal.querySelector('#dec-impact').value,
      date: modal.querySelector('#dec-date').value,
      ownerId: getCurrentWorkspaceUser().memberId,
    };

    if (isEdit) {
      payload.id = decision.id;
      await store.dispatch('UPDATE_DECISION', payload);
    } else {
      await store.dispatch('ADD_DECISION', payload);
    }
    closeModal();
    refreshCurrentView();
  });
}


// ────────────────────────────────────────────────────────────────────────────
// Profile Modal
// ────────────────────────────────────────────────────────────────────────────

function updateUserProfileUI() {
  const user = getCurrentWorkspaceUser();
  const linkedMember = getCurrentWorkspaceMember();
  const name = user.name;
  const avatar = user.avatar;
  const identity = user.email || user.team
    ? [user.email || null, user.team ? `Equipo: ${user.team}` : null].filter(Boolean).join(' · ')
    : null;
  const roleWithMember = [
    user.role,
    linkedMember ? linkedMember.name : null,
    identity,
  ].filter(Boolean).join(' · ');

  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = roleWithMember;
  if (avatarEl) avatarEl.textContent = avatar;
}

/**
 * Despliega el panel principal de personalización y opciones de seguridad locales.
 * Permite cambiar el alias, correo, avatar y clave encriptada de Nexus Fortress.
 */
function openProfileModal() {
  const user = getCurrentWorkspaceUser();
  const members = store.get.members();
  const linkedMember = getCurrentWorkspaceMember();
  const currentName = user.name;
  const currentRole = user.role;
  const currentAvatar = user.avatar;
  const currentEmail = user.email || '';
  const currentTeam = user.team || 'General';

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="user"></i> Perfil de Usuario</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Nombre</label>
        <input class="form-input" id="profile-name" value="${esc(currentName)}" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Rol en el equipo</label>
        <input class="form-input" id="profile-role" value="${esc(currentRole)}" placeholder="ej. Investigador Principal">
      </div>
      <div class="form-group">
        <label class="form-label">Correo de identidad (recomendado para continuidad entre equipos/dispositivos)</label>
        <input class="form-input" id="profile-email" value="${esc(currentEmail)}" placeholder="tu.nombre@institucion.edu">
      </div>
      <div class="form-group">
        <label class="form-label">Etiqueta de equipo actual</label>
        <input class="form-input" id="profile-team" value="${esc(currentTeam)}" placeholder="ej. Laboratorio Cognición">
      </div>
      <div class="form-group">
        <label class="form-label">Miembro del workspace (para identificar "mis" tareas)</label>
        <select class="form-select" id="profile-member-id">
          <option value="">Sin vincular</option>
          ${members.map(m => `<option value="${m.id}" ${linkedMember?.id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
        </select>
        <small style="color:var(--text-secondary);display:block;margin-top:6px;">Si usas el mismo correo en otro equipo/dispositivo, tu identidad se mantiene aunque cambies el miembro local.</small>
      </div>
        <div class="form-group">
          <label class="form-label">Avatar (1 o 2 letras)</label>
          <input class="form-input" id="profile-avatar" value="${esc(currentAvatar)}" maxlength="2">
        </div>
        <div class="hr-text"><span>Seguridad</span></div>
        <div class="form-group">
          <label class="form-label">Nueva Contraseña Maestra (Lock Screen)</label>
          <input type="password" class="form-input" id="profile-pwd" placeholder="Dejar en blanco para no cambiar">
        </div>
        <div class="form-group">
          <label class="checkbox-item">
            <input type="checkbox" id="profile-autolock" ${localStorage.getItem('autolock_enabled') === 'true' ? 'checked' : ''}>
            <span>Autobloqueo al salir (Auto-lock)</span>
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-item">
            <input type="checkbox" id="profile-low-feedback" ${localStorage.getItem('low_feedback_enabled') === 'true' ? 'checked' : ''}>
            <span>Modo Poca Retroalimentación (ocultar confirmaciones)</span>
          </label>
        </div>
      </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="profile-save"><i data-feather="save"></i> Guardar cambios</button>
    </div>`);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#profile-save').addEventListener('click', async () => {
    const name = modal.querySelector('#profile-name').value.trim() || 'Usuario';
    const role = modal.querySelector('#profile-role').value.trim();
    const memberId = modal.querySelector('#profile-member-id').value.trim();
    const email = modal.querySelector('#profile-email').value.trim().toLowerCase();
    const team = modal.querySelector('#profile-team').value.trim() || 'General';
    const avatar = modal.querySelector('#profile-avatar').value.trim().toUpperCase() || name.charAt(0);

    localStorage.setItem('workspace_user_name', name);
    localStorage.setItem('workspace_user_role', role);
    localStorage.setItem('workspace_user_avatar', avatar);
    localStorage.setItem('workspace_user_member_id', memberId);
    localStorage.setItem('workspace_user_email', email);
    localStorage.setItem('workspace_team_label', team);

    const newPwd = modal.querySelector('#profile-pwd').value.trim();
    let recoveryCodeForDisplay = null;
    if (newPwd) {
      if (newPwd.length < 8) {
        if (window.showToast) showToast('La contraseña maestra debe tener al menos 8 caracteres.', 'warning');
        return;
      }
      // SECURITY FIX: Use cryptographically secure RNG (OS entropy) instead of Math.random().
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const randomBytes = crypto.getRandomValues(new Uint8Array(16));
      let code = '';
      for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) code += '-';
        code += chars[randomBytes[i] % chars.length];
      }
      recoveryCodeForDisplay = code;

      // SECURITY FIX: Use Web Crypto SHA-256 with salt (matches app.js hashPassword).
      // The legacy djb2 hash was trivially reversible and set a hash that app.js
      // would flag as "legacy" and attempt to migrate on the next login.
      const enc = new TextEncoder();
      let saltB64 = localStorage.getItem('nexus_salt');
      if (!saltB64) {
        const saltBytes = crypto.getRandomValues(new Uint8Array(16));
        saltB64 = btoa(String.fromCharCode(...saltBytes));
        localStorage.setItem('nexus_salt', saltB64);
      }
      const pwdHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(newPwd + saltB64));
      const pwdHashHex = Array.from(new Uint8Array(pwdHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
      const rcHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(recoveryCodeForDisplay.replace(/-/g, '') + saltB64));
      const rcHashHex = Array.from(new Uint8Array(rcHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      localStorage.setItem('workspace_lock_hash', pwdHashHex);
      localStorage.setItem('workspace_recovery_hash', rcHashHex);
    }
    localStorage.setItem('autolock_enabled', modal.querySelector('#profile-autolock').checked);
    localStorage.setItem('low_feedback_enabled', modal.querySelector('#profile-low-feedback').checked);

    updateUserProfileUI();

    if (recoveryCodeForDisplay) {
      openModal(`
        <div class="modal-header">
          <h2><i data-feather="key"></i> Codigo de Recuperacion</h2>
        </div>
        <div class="modal-body" style="padding:24px; display:flex; flex-direction:column; gap:16px;">
          <p style="color:var(--accent-warning); font-weight:600; margin:0;">Guarda este codigo en un lugar seguro.</p>
          <p style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Si olvidas tu contrasena, necesitaras este codigo para recuperar el acceso. No se mostrara de nuevo.</p>
          <div style="font-family:var(--font-mono); font-size:1.1rem; letter-spacing:3px; text-align:center; padding:16px; background:var(--bg-base); border-radius:8px; color:var(--text-primary); font-weight:700; border:1px solid var(--border-highlight);">${recoveryCodeForDisplay}</div>
          <button class="btn btn-secondary" id="rc-copy-btn" style="justify-content:center;">Copiar codigo</button>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="rc-done-btn" style="justify-content:center;"><i data-feather="check"></i> Ya lo guarde — Cerrar</button>
        </div>`);
      const rcModal = document.querySelector('#modal-overlay .modal');
      rcModal.querySelector('#rc-copy-btn').onclick = () => {
        navigator.clipboard.writeText(recoveryCodeForDisplay).catch(() => { });
        rcModal.querySelector('#rc-copy-btn').textContent = '¡Copiado!';
      };
      rcModal.querySelector('#rc-done-btn').onclick = () => {
        closeModal();
        showToast('Contrasena y codigo de recuperacion actualizados', 'success', true);
      };
    } else {
      closeModal();
      showToast('Perfil actualizado', 'success', true);
    }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Help / Guide Modal
// ────────────────────────────────────────────────────────────────────────────
function openHelpModal() {
  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="help-circle"></i> Guía de Uso — Paso a Paso</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body" style="padding:0;">
      <div id="help-tabs" style="display:flex; gap:4px; padding:16px 24px 0; flex-wrap:wrap; border-bottom:1px solid var(--border-color); overflow-x:auto;">
        <button class="tab-btn active" data-tab="inicio" style="white-space:nowrap;">🚀 Primeros Pasos</button>
        <button class="tab-btn" data-tab="proyectos" style="white-space:nowrap;">📁 Proyectos y Tareas</button>
        <button class="tab-btn" data-tab="vistas" style="white-space:nowrap;">🗂️ Las Vistas</button>
        <button class="tab-btn" data-tab="google" style="white-space:nowrap;">☁️ Sincronizar con Google</button>
        <button class="tab-btn" data-tab="seguridad" style="white-space:nowrap;">🔒 Contraseña y Seguridad</button>
        <button class="tab-btn" data-tab="instalar" style="white-space:nowrap;">📱 Instalar la App</button>
      </div>
      <div id="help-content" style="padding:24px; max-height:62vh; overflow-y:auto; line-height:1.7; font-size:0.9rem;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="help-close"><i data-feather="check"></i> Entendido</button>
    </div>`);

  const contentDiv = modal.querySelector('#help-content');

  const tip = (text) => `<div style="background:var(--accent-primary)15; border-left:3px solid var(--accent-primary); border-radius:6px; padding:10px 14px; margin:12px 0; font-size:0.83rem; color:var(--text-secondary);">💡 ${text}</div>`;
  const step = (n, icon, title, body) => `
    <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:20px;">
      <div style="min-width:32px; height:32px; border-radius:50%; background:var(--accent-primary)20; color:var(--accent-primary); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; margin-top:2px;">${n}</div>
      <div>
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">${icon} ${title}</div>
        <div style="color:var(--text-secondary);">${body}</div>
      </div>
    </div>`;

  const contentMap = {

    'inicio': `
      <h3 style="color:var(--accent-primary); margin-bottom:16px;">Bienvenido al Workspace 👋</h3>
      <p style="color:var(--text-secondary); margin-bottom:24px;">Esta es tu app personal para organizar proyectos académicos, escritura, consultas médicas y cualquier trabajo en equipo. Funciona <strong>100% sin internet</strong> y puedes instalarla en tu teléfono o computadora.</p>

      ${step(1, '📁', 'Crea tu primer Proyecto', 'Haz clic en <strong>Proyectos</strong> en el menú izquierdo, luego en el botón <strong>+ Nuevo Proyecto</strong>. Dale un nombre (p.ej. "Tesis 2026"), elige el tipo (Investigación, Artículo, Clase…) y guarda.')}
      ${step(2, '✅', 'Agrega tareas a tu proyecto', 'Abre tu proyecto y haz clic en <strong>+ Nueva Tarea</strong>. Escribe lo que tienes que hacer ("Redactar introducción"), elige una prioridad y una fecha límite si la tiene.')}
      ${step(3, '🗂️', 'Organiza con el Tablero', 'Ve a <strong>Tablero</strong> en el menú. Verás columnas con los estados de tus tareas. Arrastra una tarea de "Capturado" a "En elaboración" cuando empieces a trabajarla.')}
      ${step(4, '📊', 'Revisa el Dashboard a diario', 'El <strong>Dashboard</strong> es tu pantalla matutina: muestra qué hay que hacer hoy, tareas atrasadas y el progreso de tus proyectos.')}
      ${tip('No tienes que crear cuenta ni contraseña para empezar. Todos tus datos se guardan automáticamente en este dispositivo.')}`,

    'proyectos': `
      <h3 style="color:var(--accent-primary); margin-bottom:16px;">Proyectos y Tareas en detalle</h3>

      <h4 style="margin:20px 0 10px; font-weight:600;">🏗️ Crear un Proyecto</h4>
      ${step(1, '', 'Ir a Proyectos', 'Haz clic en <strong>Proyectos</strong> en el menú lateral izquierdo.')}
      ${step(2, '', 'Crear', 'Haz clic en el botón azul <strong>+ Nuevo Proyecto</strong>.')}
      ${step(3, '', 'Rellenar el formulario', '<ul style="padding-left:16px; margin-top:4px;"><li><strong>Nombre:</strong> El nombre de tu proyecto (p.ej. "Artículo sobre cognición")</li><li><strong>Tipo:</strong> Investigación, Artículo, Libro, Clase, etc.</li><li><strong>Descripción:</strong> Opcional, pero útil para recordar el objetivo.</li><li><strong>Enlace Obsidian:</strong> Si usas Obsidian, pega el enlace de tu nota aquí.</li></ul>')}
      ${step(4, '', 'Guardar', 'Haz clic en <strong>Crear Proyecto</strong>. Aparecerá en tu lista.')}

      <h4 style="margin:24px 0 10px; font-weight:600;">✅ Estados de las Tareas</h4>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px;">
        <div style="padding:10px; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border-color);"><strong>Capturado</strong><br><small style="color:var(--text-muted);">Idea o pendiente sin trabajar aún.</small></div>
        <div style="padding:10px; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border-color);"><strong>En elaboración</strong><br><small style="color:var(--text-muted);">Estás trabajando en esto ahora.</small></div>
        <div style="padding:10px; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border-color);"><strong>En revisión</strong><br><small style="color:var(--text-muted);">Hecho, esperando revisión/aprobación.</small></div>
        <div style="padding:10px; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border-color);"><strong>En espera</strong><br><small style="color:var(--text-muted);">Bloqueada por algo externo.</small></div>
        <div style="padding:10px; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border-color);"><strong>Terminado</strong><br><small style="color:var(--text-muted);">¡Listo! Puedes marcarla con el checkbox.</small></div>
        <div style="padding:10px; border-radius:8px; background:var(--bg-surface); border:1px solid var(--border-color);"><strong>Archivado</strong><br><small style="color:var(--text-muted);">Ya no es relevante, la guardas para registro.</small></div>
      </div>

      <h4 style="margin:24px 0 10px; font-weight:600;">🔄 ¿Qué son los Ciclos?</h4>
      <p style="color:var(--text-secondary);">Un Ciclo es como una "semana de trabajo enfocado". En vez de ver <em>todas</em> las tareas, escoges cuáles vas a hacer <em>esta semana</em> y las metes al ciclo. Al terminar la semana, cierras el ciclo y ves tu progreso.</p>
      ${tip('Recomendamos ciclos de 1 a 2 semanas. Ve a <strong>Ciclos</strong> → <strong>+ Nuevo Ciclo</strong>.')}`,

    'vistas': `
      <h3 style="color:var(--accent-primary); margin-bottom:16px;">Las Vistas del Workspace</h3>
      <p style="color:var(--text-secondary); margin-bottom:20px;">Cada sección del menú lateral es una forma diferente de ver tu trabajo. No tienes que usar todas, elige las que más te sirvan.</p>

      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>🏠 Dashboard</strong> — <em style="color:var(--text-muted);">Tu pantalla matutina</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Muestra un resumen: tareas activas, ciclos en curso, próximas fechas y proyectos activos. Empieza aquí cada día.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>📋 Tablero Kanban</strong> — <em style="color:var(--text-muted);">Vista visual de tareas</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Columnas por estado. Arrastra las tarjetas para mover tareas. Ideal para ver qué está en progreso.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>📥 Backlog</strong> — <em style="color:var(--text-muted);">Lista de todo el trabajo</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Todas tus tareas en una lista plana. Filtra por proyecto, prioridad o estado. Aquí capturas ideas nuevas.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>📅 Calendario</strong> — <em style="color:var(--text-muted);">Vista mensual</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Ver fechas límite, sesiones y clases en un calendario mensual. Haz clic en un día para ver qué hay programado.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>⚡ Matriz de Eisenhower</strong> — <em style="color:var(--text-muted);">Priorización visual</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Organiza tus tareas en 4 cuadrantes: Urgente+Importante (hazlo ya), No Urgente+Importante (planifícalo), etc.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>✍️ Escritura</strong> — <em style="color:var(--text-muted);">Editor de manuscritos</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Modo de escritura tipo Scrivener. Escribe artículos o capítulos directamente en la app. Se guarda en tu proyecto. Incluye contador de palabras y meta diaria.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>🏥 Panel Médico</strong> — <em style="color:var(--text-muted);">Interconsultas</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Registra derivaciones y consultas especializadas con estado (Solicitada / En proceso / Respondida). Diseñado para consultorios.</span>
        </div>
        <div style="padding:14px; border-radius:10px; background:var(--bg-surface); border:1px solid var(--border-color);">
          <strong>⚙️ Integraciones</strong> — <em style="color:var(--text-muted);">Conectar herramientas</em><br>
          <span style="color:var(--text-secondary); font-size:0.85rem;">Configura Google Calendar, Zotero y Todoist. Crea tu contraseña de acceso. Ver más en la pestaña de Seguridad.</span>
        </div>
      </div>`,

    'google': `
      <h3 style="color:var(--accent-primary); margin-bottom:16px;">Sincronizar con Google ☁️</h3>
      <p style="color:var(--text-secondary); margin-bottom:20px;">La sincronización con Google te permite <strong>respaldar tus datos en Google Drive</strong>, sincronizar eventos con <strong>Google Calendar</strong> y tareas con <strong>Google Tasks</strong>.</p>

      <h4 style="margin-bottom:12px; font-weight:600;">Parte 1: Crear las credenciales (una sola vez)</h4>
      ${step(1, '🌐', 'Abre Google Cloud Console', 'Ve a <a href="https://console.cloud.google.com/" target="_blank" style="color:var(--accent-primary)">console.cloud.google.com</a> e inicia sesión con tu cuenta de Google.')}
      ${step(2, '📁', 'Crea un nuevo proyecto', 'Haz clic en el selector de proyectos arriba → <strong>Nuevo Proyecto</strong>. Llámalo "Workspace PWA" y haz clic en <strong>Crear</strong>.')}
      ${step(3, '🔌', 'Activa las APIs', 'En el menú lateral: <strong>APIs y Servicios → Biblioteca</strong>. Busca y activa:<ul style="padding-left:16px; margin-top:8px;"><li><strong>Google Drive API</strong></li><li><strong>Google Calendar API</strong></li><li><strong>Google Tasks API</strong></li></ul>')}
      ${step(4, '🔑', 'Crea las credenciales OAuth', 'Ve a <strong>APIs y Servicios → Credenciales → Crear Credenciales → ID de cliente OAuth 2.0</strong>.<ul style="padding-left:16px; margin-top:8px;"><li>Tipo de aplicación: <strong>Aplicación Web</strong></li><li>Nombre: Workspace PWA</li><li>Orígenes autorizados: agrega la URL donde usas la app (ej. <code>http://localhost:5500</code> para desarrollo local)</li></ul>Haz clic en <strong>Crear</strong> y copia el <strong>Client ID</strong>.')}
      ${step(5, '👤', 'Agrega tu correo como usuario de prueba', 'Ve a <strong>APIs y Servicios → Pantalla de consentimiento OAuth → EDITAR APP</strong>. Baja hasta <strong>Usuarios de prueba</strong> y agrega tu correo electrónico.')}

      <h4 style="margin:24px 0 12px; font-weight:600;">Parte 2: Conectar en el Workspace</h4>
      ${step(6, '⚙️', 'Abre Integraciones', 'En el menú lateral del Workspace, haz clic en <strong>Integraciones</strong>.')}
      ${step(7, '☁️', 'Configura Google API', 'En la tarjeta de Google Cloud, haz clic en <strong>Configurar Google API</strong>. Pega tu <strong>Client ID</strong> y haz clic en <strong>Conectar con Google</strong>.')}
      ${step(8, '✅', 'Elige qué sincronizar', 'Activa los toggles de <strong>Google Calendar</strong> y/o <strong>Google Tasks</strong> según lo que necesites.')}
      ${tip('Una vez conectado, el botón de nube ☁️ en la barra lateral inferior sincronizará automáticamente tus datos.')}

      <h4 style="margin:24px 0 12px; font-weight:600;">Conectar Zotero (Referencias Bibliográficas)</h4>
      ${step(1, '🔬', 'Obtén tu Zotero User ID', 'Ve a <a href="https://www.zotero.org/settings/keys" target="_blank" style="color:var(--accent-primary)">zotero.org/settings/keys</a>. Tu User ID aparece en la parte superior de la página.')}
      ${step(2, '🗝️', 'Crea una API Key', 'En la misma página, haz clic en <strong>Create new private key</strong>. Ponle un nombre y dale permisos de sólo lectura. Copia la clave generada.')}
      ${step(3, '⚙️', 'Guarda en Integraciones', 'En el Workspace → <strong>Integraciones</strong>, en la tarjeta de Zotero pega el <strong>User ID</strong> y la <strong>API Key</strong>. Haz clic en <strong>Guardar Zotero</strong>.')}
      ${step(4, '📚', 'Importa tus referencias', 'Ve a <strong>Biblioteca</strong> en el menú y haz clic en <strong>Sincronizar Zotero</strong>.')}`,

    'seguridad': `
      <h3 style="color:var(--accent-primary); margin-bottom:16px;">Contraseña y Seguridad 🔒</h3>
      <p style="color:var(--text-secondary); margin-bottom:20px;">Puedes proteger el Workspace con una contraseña. Así, si alguien abre la app en tu dispositivo, tendrá que ingresar la clave. <strong>La contraseña se guarda en tu dispositivo — no en ningún servidor.</strong></p>

      <h4 style="margin-bottom:14px; font-weight:600;">Crear una Contraseña</h4>
      ${step(1, '⚙️', 'Ve a Integraciones', 'En el menú lateral, haz clic en <strong>Integraciones</strong>.')}
      ${step(2, '🔒', 'Encuentra la tarjeta de Seguridad', 'Desplázate hasta la tarjeta <strong>Seguridad</strong> (la última de la pantalla).')}
      ${step(3, '⌨️', 'Escribe tu contraseña', 'En el campo <strong>Nueva Contraseña</strong>, escribe una clave de al menos 8 caracteres. Elige algo que recuerdes fácilmente.')}
      ${step(4, '💾', 'Guarda', 'Haz clic en <strong>Guardar Seguridad</strong>. Verás que la tarjeta cambia a "Protegido" en verde.')}
      ${step(5, '🔄', 'Activa el bloqueo automático', 'Marca la casilla <strong>Bloquear al minimizar</strong> si quieres que la app se bloquee sola cuando cambias de aplicación.')}

      <div style="background:var(--accent-warning)15; border-left:3px solid var(--accent-warning); border-radius:6px; padding:10px 14px; margin:16px 0; font-size:0.83rem; color:var(--text-secondary);">
        ⚠️ <strong>Importante:</strong> Si olvidas tu contraseña no hay forma de recuperarla (no hay cuenta de usuario). Anótala en un lugar seguro o usa un gestor de contraseñas.
      </div>

      <h4 style="margin:24px 0 14px; font-weight:600;">Cómo desbloquear la app</h4>
      <p style="color:var(--text-secondary);">Cuando la app esté bloqueada, verás una pantalla con un campo de contraseña. Escribe tu clave y haz clic en <strong>Desbloquear</strong>. También puedes hacer clic en el ícono de candado 🔒 en la parte inferior del menú para bloquear manualmente en cualquier momento.</p>

      <h4 style="margin:24px 0 14px; font-weight:600;">Cambiar la Contraseña</h4>
      <p style="color:var(--text-secondary);">Simplemente ve de nuevo a <strong>Integraciones → Seguridad</strong>, escribe la <strong>nueva</strong> contraseña y haz clic en <strong>Guardar Seguridad</strong>. La contraseña anterior se reemplaza automáticamente.</p>
      ${tip('La contraseña sólo protege la <em>pantalla de acceso</em>. Los datos en IndexedDB del navegador son accesibles por cualquier usuario del dispositivo con acceso a las herramientas de desarrollo. Para mayor seguridad, usa una cuenta de usuario de Windows/Mac separada.')}`,

    'instalar': `
      <h3 style="color:var(--accent-primary); margin-bottom:16px;">Instalar la App en tu Dispositivo 📱</h3>
      <p style="color:var(--text-secondary); margin-bottom:20px;">El Workspace es una <strong>Progressive Web App (PWA)</strong>. Puedes instalarlo como si fuera una app nativa en tu teléfono o computadora. Funciona <strong>sin internet</strong> una vez instalado.</p>

      <h4 style="margin-bottom:14px; font-weight:600;">📱 En Android (Chrome)</h4>
      ${step(1, '', 'Abre el Workspace en Chrome', 'Visita la URL del Workspace en el navegador Chrome de tu Android.')}
      ${step(2, '', 'Toca el menú', 'Toca los tres puntos ⋮ en la esquina superior derecha.')}
      ${step(3, '', 'Instalar', 'Busca la opción <strong>"Instalar aplicación"</strong> o <strong>"Agregar a pantalla de inicio"</strong> y tócala.')}
      ${step(4, '', 'Confirmar', 'Toca <strong>Instalar</strong> en el diálogo. La app aparecerá en tu pantalla de inicio como cualquier otra app.')}

      <h4 style="margin:24px 0 14px; font-weight:600;">🍎 En iPhone / iPad (Safari)</h4>
      ${step(1, '', 'Abre el Workspace en Safari', 'Visita la URL del Workspace en Safari (no funciona con Chrome en iOS).')}
      ${step(2, '', 'Toca Compartir', 'Toca el ícono de compartir <strong>□↑</strong> en la barra de navegación inferior.')}
      ${step(3, '', 'Agregar a Inicio', 'Desplázate y toca <strong>"Agregar a pantalla de inicio"</strong>.')}
      ${step(4, '', 'Confirmar', 'Toca <strong>Agregar</strong>. La app aparecerá en tu pantalla de inicio.')}

      <h4 style="margin:24px 0 14px; font-weight:600;">💻 En Windows/Mac (Chrome o Edge)</h4>
      ${step(1, '', 'Abre en Chrome o Edge', 'Navega al Workspace en Google Chrome o Microsoft Edge.')}
      ${step(2, '', 'Busca el ícono de instalación', 'En la barra de dirección, busca el ícono <strong>⊕</strong> o el símbolo de monitor con flecha. En Edge es en los "…" → Aplicaciones → Instalar sitio como aplicación.')}
      ${step(3, '', 'Instalar', 'Haz clic y confirma. La app se abrirá como una ventana separada (sin barra de navegación del browser).')}
      ${tip('Una vez instalada, la app abre directamente sin necesidad de abrir el navegador primero. Funciona offline gracias al Service Worker.')}

      <h4 style="margin:24px 0 14px; font-weight:600;">Barra de Instalación en el Workspace</h4>
      <p style="color:var(--text-secondary);">Si el navegador detecta que aún no has instalado la app y es elegible para instalación, aparecerá automáticamente un <strong>banner azul</strong> en la parte superior del Workspace con el botón <strong>"Instalar App"</strong>. Solo haz clic en ese botón.</p>`
  };

  const renderHelpTab = (tabId) => {
    contentDiv.innerHTML = contentMap[tabId] || '';
    feather.replace();
  };

  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderHelpTab(btn.dataset.tab);
    });
  });

  // Setup initial
  renderHelpTab('inicio');

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#help-close').addEventListener('click', closeModal);
}

window.openModal = openModal;
window.closeModal = closeModal;
window.openTaskModal = openTaskModal;
window.openProjectModal = openProjectModal;
window.openCycleModal = openCycleModal;
window.openDecisionModal = openDecisionModal;
window.openProfileModal = openProfileModal;
window.openHelpModal = openHelpModal;
window.updateUserProfileUI = updateUserProfileUI;

function openSessionModal(id = null) {
  const isEdit = !!id;
  const session = isEdit ? store.get.sessions().find(s => s.id === id) : null;
  const projects = store.get.projects();

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="calendar"></i> ${isEdit ? 'Editar Sesión' : 'Nueva Sesión'}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-input" id="sess-title" placeholder="ej. Reunion con tutor" value="${isEdit ? esc(session.title) : ''}" autofocus>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="sess-type">
            <option value="Clase" ${isEdit && session.type === 'Clase' ? 'selected' : ''}>Clase</option>
            <option value="Cita Médica" ${isEdit && session.type === 'Cita Médica' ? 'selected' : ''}>Cita Médica</option>
            <option value="Escritura" ${isEdit && session.type === 'Escritura' ? 'selected' : ''}>Escritura</option>
            <option value="Reunión" ${isEdit && session.type === 'Reunión' ? 'selected' : ''}>Reunión</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Proyecto</label>
          <select class="form-select" id="sess-project">
            <option value="">Sin proyecto</option>
            ${projects.map(p => `<option value="${p.id}" ${isEdit && session.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" type="date" id="sess-date" value="${isEdit ? session.date : new Date().toISOString().slice(0, 10)}">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Hora inicio</label>
          <input class="form-input" type="time" id="sess-start" value="${isEdit ? session.startTime : '09:00'}">
        </div>
        <div class="form-group">
          <label class="form-label">Hora fin</label>
          <input class="form-input" type="time" id="sess-end" value="${isEdit ? session.endTime : '10:00'}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <textarea class="form-textarea" id="sess-notes" rows="2">${isEdit ? esc(session.description || '') : ''}</textarea>
      </div>
    </div>
    <div class="modal-footer" style="justify-content: ${isEdit ? 'space-between' : 'flex-end'}">
      ${isEdit ? `<button class="btn btn-ghost" id="sess-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : ''}
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="sess-save"><i data-feather="save"></i> ${isEdit ? 'Guardar' : 'Crear'}</button>
      </div>
    </div>
  `);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

  if (isEdit) {
    modal.querySelector('#sess-delete').addEventListener('click', async () => {
      if (confirm('¿Eliminar esta sesión?')) {
        await store.dispatch('DELETE_SESSION', { id: session.id });
        closeModal();
        refreshCurrentView();
      }
    });
  }

  modal.querySelector('#sess-save').addEventListener('click', async () => {
    const title = modal.querySelector('#sess-title').value.trim();
    if (!title) return showToast('Título es requerido', 'error');

    const payload = {
      title,
      type: modal.querySelector('#sess-type').value,
      projectId: modal.querySelector('#sess-project').value || null,
      date: modal.querySelector('#sess-date').value,
      startTime: modal.querySelector('#sess-start').value,
      endTime: modal.querySelector('#sess-end').value,
      description: modal.querySelector('#sess-notes').value,
    };

    if (isEdit) {
      await store.dispatch('UPDATE_SESSION', { id: session.id, ...payload });
    } else {
      await store.dispatch('ADD_SESSION', payload);
    }
    closeModal();
    refreshCurrentView();
    // Trigger sync if enabled
    if (localStorage.getItem('sync_gcal') === 'true' && window.syncManager) {
      syncManager.syncCalendar();
    }
  });
}

/**
 * Abre el panel lateral derecho con los detalles de una tarea para su edicion 'fluida'.
 * @param {Object} task - El objeto Tarea a mostrar.
 */
async function openTaskDetail(task) {
  const panel = document.getElementById('details-panel');
  const container = document.querySelector('.app-container');
  if (!panel || !container) return;

  const projects = store.get.projects();
  const members = store.get.members();

  panel.innerHTML = `
    <div class="details-header">
      <div style="display:flex; align-items:center; gap:8px;">
        <i data-feather="check-square" style="color:var(--accent-primary); width:18px; height:18px;"></i>
        <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Detalles de Tarea</span>
      </div>
      <button class="btn btn-icon" id="details-close"><i data-feather="x"></i></button>
    </div>
    <div class="details-body">
      <input type="text" class="details-title-input" id="detail-task-title" value="${esc(task.title)}" placeholder="Título de la tarea...">
      
      <div class="details-field-group">
        <label class="details-field-label">Proyecto</label>
        <select class="form-select" id="detail-task-project">
          <option value="">Sin proyecto</option>
          ${projects.map(p => `<option value="${p.id}" ${p.id === task.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="details-field-group">
          <label class="details-field-label">Estado</label>
          <select class="form-select" id="detail-task-status">
            ${STATUSES.map(s => `<option value="${s}" ${s === task.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="details-field-group">
          <label class="details-field-label">Prioridad</label>
          <select class="form-select" id="detail-task-priority">
            <option value="alta" ${task.priority === 'alta' ? 'selected' : ''}>Alta</option>
            <option value="media" ${task.priority === 'media' ? 'selected' : ''}>Media</option>
            <option value="baja" ${task.priority === 'baja' ? 'selected' : ''}>Baja</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div class="details-field-group">
          <label class="details-field-label">Asignado a</label>
          <select class="form-select" id="detail-task-assignee">
            <option value="">Sin asignar</option>
            ${members.map(m => `<option value="${m.id}" ${task.assigneeId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
          </select>
        </div>
        <div class="details-field-group">
          <label class="details-field-label">Fecha límite</label>
          <input type="date" class="form-input" id="detail-task-due" value="${task.dueDate || ''}">
        </div>
      </div>

      <div class="details-field-group">
        <label class="details-field-label">Descripción</label>
        <textarea class="form-textarea" id="detail-task-desc" placeholder="Notas, contexto..." rows="4">${esc(task.description || '')}</textarea>
      </div>

      <div class="details-field-group">
        <label class="details-field-label">Subtareas</label>
        <div id="detail-subtasks-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;"></div>
        <div style="display:flex; gap:8px;">
          <input class="form-input" id="detail-new-subtask" placeholder="Nueva subtarea...">
          <button class="btn btn-secondary" id="detail-add-subtask" style="padding:0 12px;"><i data-feather="plus"></i></button>
        </div>
      </div>
    </div>
    <div class="details-footer">
      <button class="btn btn-ghost" id="detail-task-delete" style="color:var(--accent-danger);">Eliminar</button>
      <button class="btn btn-primary" id="detail-task-save"><i data-feather="check"></i> Guardar</button>
    </div>
  `;

  feather.replace();
  container.classList.add('show-details');

  let subTasks = task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : [];
  const renderSubtasks = () => {
    const list = panel.querySelector('#detail-subtasks-list');
    list.innerHTML = subTasks.map(st => `
      <div style="display:flex; align-items:center; gap:8px; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px;">
        <input type="checkbox" ${st.done ? 'checked' : ''} data-id="${st.id}">
        <span style="flex:1; font-size:0.84rem;">${esc(st.title)}</span>
        <button class="btn btn-icon btn-del-sub" style="padding:2px;" data-id="${st.id}"><i data-feather="trash-2" style="width:14px;height:14px;"></i></button>
      </div>
    `).join('');
    feather.replace();
  };
  renderSubtasks();

  panel.querySelector('#detail-add-subtask').addEventListener('click', () => {
    const input = panel.querySelector('#detail-new-subtask');
    const text = input.value.trim();
    if (!text) return;
    subTasks.push({ id: Date.now(), title: text, done: false });
    input.value = '';
    renderSubtasks();
  });

  panel.querySelector('#detail-subtasks-list').addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
      const sid = parseInt(e.target.dataset.id, 10);
      const st = subTasks.find(x => x.id === sid);
      if (st) st.done = e.target.checked;
    }
  });

  const saveAction = async () => {
    const title = panel.querySelector('#detail-task-title').value.trim();
    if (!title) { showToast('El título es obligatorio.', 'error'); return; }
    if (title.length < 3) { showToast('El título debe tener al menos 3 caracteres.', 'warning'); return; }

    const status = panel.querySelector('#detail-task-status').value;
    if (!status) { showToast('El estado es obligatorio.', 'warning'); return; }

    const priority = panel.querySelector('#detail-task-priority').value;
    if (!priority) { showToast('La prioridad es obligatoria.', 'warning'); return; }

    const dueDate = panel.querySelector('#detail-task-due').value;
    if (dueDate && new Date(dueDate) < new Date().setHours(0, 0, 0, 0)) {
      showToast('La fecha no puede ser en el pasado.', 'warning');
      return;
    }

    const payload = {
      title,
      projectId: panel.querySelector('#detail-task-project').value || null,
      status,
      priority,
      dueDate: dueDate || null,
      description: panel.querySelector('#detail-task-desc').value,
      assigneeId: panel.querySelector('#detail-task-assignee').value || null,
      subtasks: subTasks
    };

    if (task.id) {
      await store.dispatch('UPDATE_TASK', { id: task.id, ...payload });
      showToast('Tarea actualizada');
    } else {
      await store.dispatch('ADD_TASK', payload);
      showToast('Tarea creada');
      closeDetailsPanel();
    }
    refreshCurrentView();
  };


  panel.querySelector('#detail-task-save').addEventListener('click', saveAction);
  panel.querySelector('#details-close').addEventListener('click', closeDetailsPanel);
  
  panel.querySelector('#detail-task-delete').addEventListener('click', async () => {
    if (confirm(`¿Eliminar la tarea "${task.title}"?`)) {
      await store.dispatch('DELETE_TASK', { id: task.id });
      closeDetailsPanel();
      refreshCurrentView();
    }
  });
}

function closeDetailsPanel() {
  const container = document.querySelector('.app-container');
  if (container) container.classList.remove('show-details');
}

/**
 * Modal de bienvenida y configuración inicial para el primer usuario (Admin) del workspace.
 */
function openInitialSetupModal() {
  const user = getCurrentWorkspaceUser();
  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="box"></i> ¡Bienvenido al Workspace!</h2>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary); margin-bottom:20px;">Parece que eres la primera persona en este entorno. Vamos a configurarlo para que tú y tu equipo puedan trabajar cómodamente.</p>
      
      <div class="form-group">
        <label class="form-label">Nombre del Workspace</label>
        <input class="form-input" id="setup-ws-name" placeholder="ej. Laboratorio de Investigación" value="Mi Workspace">
      </div>

      <div class="form-group">
        <label class="form-label">Tu Nombre Público</label>
        <input class="form-input" id="setup-admin-name" placeholder="Tu nombre o alias" value="${esc(user.name || 'Admin')}">
        <small style="color:var(--text-muted);">Este nombre aparecerá en las tareas que crees.</small>
      </div>

      <div class="form-group" style="padding:12px; background:var(--accent-primary)10; border-radius:8px; border:1px solid var(--accent-primary)30;">
        <span style="font-size:0.8rem; font-weight:700; color:var(--accent-primary); display:block; margin-bottom:4px;">🔑 Eres el Administrador</span>
        <p style="font-size:0.75rem; color:var(--text-secondary); margin:0;">Como primer usuario, tendrás el rol de Administrador para gestionar el workspace.</p>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="setup-start-btn" style="width:100%; justify-content:center;">Empezar a trabajar <i data-feather="arrow-right"></i></button>
    </div>
  `, { closeOnOutsideClick: false, showCloseBtn: false });

  modal.querySelector('#setup-start-btn').addEventListener('click', async () => {
    const wsName = modal.querySelector('#setup-ws-name').value.trim() || 'Mi Workspace';
    const adminName = modal.querySelector('#setup-admin-name').value.trim() || 'Admin';

    // 1. Save Workspace Metadata in sync config (since store doesn't have SETTINGS action)
    syncManager.saveConfig({ 
      ...syncManager.getConfig(),
      workspace_name: wsName,
      admin_setup_completed: true,
      created_at: new Date().toISOString()
    });

    // 2. Create the Admin Member record
    const adminPayload = {
      name: adminName,
      email: user.email || 'local-admin',
      emailHash: user.emailHash || null,
      role: 'admin',
      avatar: adminName.charAt(0).toUpperCase(),
      joinedAt: new Date().toISOString()
    };

    const newMember = await store.dispatch('ADD_MEMBER', adminPayload);
    
    // 3. Link local identity to this new member
    if (newMember && newMember.id) {
      setCurrentMemberId(newMember.id);
    }

    closeModal();
    showToast(`¡Workspace "${wsName}" listo!`, 'success');
    refreshCurrentView();
    if (window.updateUserProfileUI) updateUserProfileUI();
  });

  feather.replace();
}

window.openInitialSetupModal = openInitialSetupModal;
window.openTaskDetail = openTaskDetail;
window.closeDetailsPanel = closeDetailsPanel;
window.openSessionModal = openSessionModal;

