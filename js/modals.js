/**
 * modals.js — All modal dialogs for creating/editing entities
 */

// ────────────────────────────────────────────────────────────────────────────
// Modal helpers
// ────────────────────────────────────────────────────────────────────────────

const STATUSES = ['Capturado', 'Definido', 'En preparación', 'En elaboración', 'En revisión', 'En espera', 'Pendiente Aprobación', 'Terminado', 'Archivado'];
const TASK_TYPES = ['tarea', 'subtarea', 'entregable', 'hito', 'idea', 'decisión', 'recurso'];
window.STATUSES = STATUSES;
window.TASK_TYPES = TASK_TYPES;

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

function closeModal() {
  document.getElementById('modal-overlay')?.remove();
}

// Close on Escape
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ────────────────────────────────────────────────────────────────────────────
// Task Modal
// ────────────────────────────────────────────────────────────────────────────

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

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
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
      if (confirm(`¿Estás seguro de querer eliminar la tarea "${task.title}"?`)) {
        await store.dispatch('DELETE_TASK', { id: task.id });
        closeModal();
        refreshCurrentView();
      }
    });

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
  }

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
      priority: modal.querySelector('#task-priority').value,
      type: modal.querySelector('#task-type').value,
      dueDate: modal.querySelector('#task-due').value || null,
      description: modal.querySelector('#task-desc').value,
      assigneeId: modal.querySelector('#task-assignee').value || null,
      tags,
      subtasks: subTasks,
      referenceIds: Array.from(modal.querySelector('#task-refs').selectedOptions).map(o => o.value)
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
        <label class="form-label">Objetivo</label>
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

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

  if (isEdit) {
    modal.querySelector('#proj-delete').addEventListener('click', async () => {
      const msg = '¿Estás seguro? Se borrarán también las tareas, ciclos y decisiones asociadas a este proyecto de forma permanente.';
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
    };

    if (isEdit) {
      await store.dispatch('UPDATE_PROJECT', { id: p.id, ...data });
    } else {
      await store.dispatch('ADD_PROJECT', { ...data, ownerId: 'u1' });
    }

    closeModal();
    refreshCurrentView();
    refreshSidebarProjects();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Cycle Modal
// ────────────────────────────────────────────────────────────────────────────

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
    modal.querySelector('#cycle-delete').addEventListener('click', async () => {
      if (confirm(`¿Estás seguro de wanting de eliminar el ciclo "${cycle.name}"?`)) {
        await store.dispatch('DELETE_CYCLE', { id: cycle.id }); // WE WILL NEED TO CREATE THIS DISPATCH ACTION IF IT DOESNT EXIST
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

function openDecisionModal(defaultProjectId) {
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
        if (confirm(`¿Estás seguro de eliminar la decisión "${decision.title}"?`)) {
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
        ownerId: 'u1',
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

  if (isEdit) {
    modal.querySelector('#dec-delete').addEventListener('click', async () => {
      if (confirm(`¿Estás seguro de eliminar la decisión "${decision.title}"?`)) {
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
      ownerId: 'u1',
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
      </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="profile-save"><i data-feather="save"></i> Guardar cambios</button>
    </div>`);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#profile-save').addEventListener('click', () => {
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
      const hashStr = str => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        return hash.toString();
      };
      const generateRecoveryCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 16; i++) {
          if (i > 0 && i % 4 === 0) code += '-';
          code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
      };
      recoveryCodeForDisplay = generateRecoveryCode();
      localStorage.setItem('workspace_lock_hash', hashStr(newPwd));
      localStorage.setItem('workspace_recovery_hash', hashStr(recoveryCodeForDisplay.replace(/-/g, '')));
    }
    localStorage.setItem('autolock_enabled', modal.querySelector('#profile-autolock').checked);

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
        showToast('Contrasena y codigo de recuperacion actualizados', 'success');
      };
    } else {
      closeModal();
      showToast('Perfil actualizado', 'success');
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
      ${step(3, '⌨️', 'Escribe tu contraseña', 'En el campo <strong>Nueva Contraseña</strong>, escribe una clave de al menos 4 caracteres. Elige algo que recuerdes fácilmente.')}
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

window.openSessionModal = openSessionModal;

// ────────────────────────────────────────────────────────────────────────────
// Admin Panel
// ────────────────────────────────────────────────────────────────────────────

// Hash helper using Web Crypto (SHA-256)
async function _adminHashStr(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function openAdminLoginModal() {
  const adminProfile = getAdminProfile();

  if (!adminProfile.hasPassword) {
    // First time: set up admin account
    openAdminSetupModal();
    return;
  }

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="shield"></i> Acceso de Administrador</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary); margin-bottom:16px; font-size:0.9rem;">
        Ingresa la contraseña de administrador para acceder al panel de gestión.
      </p>
      <div class="form-group">
        <label class="form-label">Contraseña de Administrador</label>
        <input type="password" class="form-input" id="admin-pwd-input" placeholder="Contraseña de admin" autofocus>
      </div>
      <div id="admin-login-error" style="display:none; color:var(--accent-danger); font-size:0.85rem; margin-top:8px;"></div>
    </div>
    <div class="modal-footer" style="justify-content:space-between;">
      <button class="btn btn-ghost" id="admin-setup-link" style="color:var(--text-muted); font-size:0.8rem;">Cambiar contraseña admin</button>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="admin-login-submit"><i data-feather="log-in"></i> Entrar</button>
      </div>
    </div>`);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

  const doLogin = async () => {
    const pwd = modal.querySelector('#admin-pwd-input').value.trim();
    const inputHash = await _adminHashStr(pwd);
    const savedHash = localStorage.getItem('workspace_admin_hash');
    if (inputHash === savedHash) {
      setAdminSession(true);
      closeModal();
      showToast(`Bienvenido, ${adminProfile.name}`, 'success');
      updateAdminBadge();
      openAdminPanel();
    } else {
      const errEl = modal.querySelector('#admin-login-error');
      errEl.textContent = 'Contraseña incorrecta.';
      errEl.style.display = 'block';
      modal.querySelector('#admin-pwd-input').value = '';
    }
  };

  modal.querySelector('#admin-login-submit').addEventListener('click', doLogin);
  modal.querySelector('#admin-pwd-input').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  modal.querySelector('#admin-setup-link').addEventListener('click', () => { closeModal(); openAdminSetupModal(); });

  if (window.feather) feather.replace();
}

function openAdminSetupModal() {
  const adminProfile = getAdminProfile();
  const isFirstTime = !adminProfile.hasPassword;

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="shield"></i> ${isFirstTime ? 'Configurar Cuenta de Administrador' : 'Cambiar Contraseña de Admin'}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      ${isFirstTime ? `
      <div style="background:var(--accent-primary)15; border-left:3px solid var(--accent-primary); border-radius:6px; padding:12px 16px; margin-bottom:16px; font-size:0.85rem; color:var(--text-secondary);">
        <strong style="color:var(--text-primary);">Cuenta de Administrador General</strong><br>
        El administrador puede gestionar todos los usuarios, aprobar/rechazar tareas pendientes y supervisar la continuidad de cuentas. Esta contraseña es independiente de la contraseña maestra del workspace.
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">Nombre del Administrador</label>
        <input class="form-input" id="admin-setup-name" value="${esc(adminProfile.name)}" placeholder="Administrador General">
      </div>
      <div class="form-group">
        <label class="form-label">Correo del Administrador</label>
        <input type="email" class="form-input" id="admin-setup-email" value="${esc(adminProfile.email)}" placeholder="admin@empresa.com">
      </div>
      <div class="form-group">
        <label class="form-label">${isFirstTime ? 'Contraseña de Administrador' : 'Nueva Contraseña de Administrador'}</label>
        <input type="password" class="form-input" id="admin-setup-pwd" placeholder="Mínimo 6 caracteres" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Confirmar Contraseña</label>
        <input type="password" class="form-input" id="admin-setup-pwd2" placeholder="Repetir contraseña">
      </div>
      <div id="admin-setup-error" style="display:none; color:var(--accent-danger); font-size:0.85rem; margin-top:4px;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="admin-setup-save"><i data-feather="save"></i> ${isFirstTime ? 'Crear Cuenta Admin' : 'Guardar Cambios'}</button>
    </div>`);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

  modal.querySelector('#admin-setup-save').addEventListener('click', async () => {
    const name = modal.querySelector('#admin-setup-name').value.trim() || 'Administrador General';
    const email = modal.querySelector('#admin-setup-email').value.trim().toLowerCase();
    const pwd = modal.querySelector('#admin-setup-pwd').value;
    const pwd2 = modal.querySelector('#admin-setup-pwd2').value;
    const errEl = modal.querySelector('#admin-setup-error');

    if (pwd.length < 6) {
      errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      errEl.style.display = 'block';
      return;
    }
    if (pwd !== pwd2) {
      errEl.textContent = 'Las contraseñas no coinciden.';
      errEl.style.display = 'block';
      return;
    }

    const hash = await _adminHashStr(pwd);
    localStorage.setItem('workspace_admin_hash', hash);
    localStorage.setItem('workspace_admin_name', name);
    localStorage.setItem('workspace_admin_email', email);

    closeModal();
    showToast(isFirstTime ? `Cuenta de administrador "${name}" creada.` : 'Contraseña de administrador actualizada.', 'success');
    updateAdminBadge();

    if (isFirstTime) {
      // Auto-login after setup
      setAdminSession(true);
      setTimeout(() => openAdminPanel(), 300);
    }
  });

  if (window.feather) feather.replace();
}

function openAdminPanel() {
  if (!isAdminSession()) {
    openAdminLoginModal();
    return;
  }

  const adminProfile = getAdminProfile();

  const renderPanelContent = (tabId, container) => {
    if (tabId === 'members') {
      renderMembersTab(container);
    } else if (tabId === 'continuity') {
      renderContinuityTab(container);
    } else if (tabId === 'approvals') {
      renderApprovalsTab(container);
    } else if (tabId === 'settings') {
      renderAdminSettingsTab(container);
    }
    if (window.feather) feather.replace();
  };

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="shield"></i> Panel de Administración — ${esc(adminProfile.name)}</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body" style="padding:0; min-height:480px;">
      <div id="admin-tabs" style="display:flex; gap:2px; padding:12px 20px 0; border-bottom:1px solid var(--border-color); flex-wrap:wrap;">
        <button class="tab-btn active" data-atab="members" style="white-space:nowrap;"><i data-feather="users" style="width:14px;height:14px;"></i> Miembros</button>
        <button class="tab-btn" data-atab="continuity" style="white-space:nowrap;"><i data-feather="link" style="width:14px;height:14px;"></i> Continuidad</button>
        <button class="tab-btn" data-atab="approvals" style="white-space:nowrap;"><i data-feather="check-circle" style="width:14px;height:14px;"></i> Aprobaciones</button>
        <button class="tab-btn" data-atab="settings" style="white-space:nowrap;"><i data-feather="settings" style="width:14px;height:14px;"></i> Ajustes Admin</button>
      </div>
      <div id="admin-tab-content" style="padding:20px; overflow-y:auto; max-height:60vh;"></div>
    </div>
    <div class="modal-footer" style="justify-content:space-between;">
      <button class="btn btn-ghost btn-sm" id="admin-logout" style="color:var(--accent-danger); font-size:0.82rem;"><i data-feather="log-out"></i> Cerrar sesión admin</button>
      <button class="btn btn-secondary" id="modal-close2">Cerrar Panel</button>
    </div>`);
  modal.style.maxWidth = '740px';

  const tabContent = modal.querySelector('#admin-tab-content');

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-close2').addEventListener('click', closeModal);
  modal.querySelector('#admin-logout').addEventListener('click', () => {
    setAdminSession(false);
    updateAdminBadge();
    closeModal();
    showToast('Sesión de administrador cerrada.', 'info');
  });

  modal.querySelectorAll('.tab-btn[data-atab]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.tab-btn[data-atab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPanelContent(btn.dataset.atab, tabContent);
    });
  });

  // Render default tab
  renderPanelContent('members', tabContent);
  if (window.feather) feather.replace();
}

function renderMembersTab(container) {
  const members = store.get.members();

  const memberRows = members.map(m => `
    <tr data-mid="${m.id}">
      <td style="padding:10px 12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-primary)20;color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;">${esc(m.avatar || '?')}</div>
          <div>
            <div style="font-weight:600; color:var(--text-primary);">${esc(m.name)}</div>
            ${m.email ? `<div style="font-size:0.78rem; color:var(--text-muted);">${esc(m.email)}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding:10px 12px; color:var(--text-secondary); font-size:0.85rem;">${esc(m.role || '—')}</td>
      <td style="padding:10px 12px;">
        <span class="badge ${m.systemRole === 'admin' ? 'badge-info' : 'badge-neutral'}" style="font-size:0.75rem;">
          ${m.systemRole === 'admin' ? 'Admin' : 'Usuario'}
        </span>
      </td>
      <td style="padding:10px 12px; text-align:right;">
        <button class="btn btn-sm btn-ghost member-edit-btn" data-mid="${m.id}" title="Editar"><i data-feather="edit-2" style="width:14px;height:14px;"></i></button>
        <button class="btn btn-sm btn-ghost member-delete-btn" data-mid="${m.id}" title="Eliminar" style="color:var(--accent-danger);"><i data-feather="trash-2" style="width:14px;height:14px;"></i></button>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h3 style="margin:0; font-size:1rem; font-weight:600;">Gestión de Miembros (${members.length})</h3>
      <button class="btn btn-sm btn-primary" id="admin-add-member"><i data-feather="user-plus"></i> Nuevo Miembro</button>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-color);">
            <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Nombre</th>
            <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Rol</th>
            <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Permisos</th>
            <th style="text-align:right; padding:8px 12px; color:var(--text-muted); font-weight:500;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${memberRows || '<tr><td colspan="4" style="padding:24px; text-align:center; color:var(--text-muted);">Sin miembros registrados</td></tr>'}
        </tbody>
      </table>
    </div>`;

  if (window.feather) feather.replace();

  container.querySelector('#admin-add-member')?.addEventListener('click', () => openMemberEditModal(null, container));

  container.querySelectorAll('.member-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openMemberEditModal(btn.dataset.mid, container));
  });

  container.querySelectorAll('.member-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const m = store.get.members().find(x => x.id === btn.dataset.mid);
      if (!m) return;
      if (!confirm(`¿Eliminar al miembro "${m.name}"? Esta acción no se puede deshacer.`)) return;
      await store.dispatch('DELETE_MEMBER', { id: m.id });
      renderMembersTab(container);
    });
  });
}

function openMemberEditModal(memberId, parentContainer) {
  const isEdit = !!memberId;
  const m = isEdit ? store.get.members().find(x => x.id === memberId) : null;

  const innerModal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="${isEdit ? 'edit-2' : 'user-plus'}"></i> ${isEdit ? 'Editar Miembro' : 'Nuevo Miembro'}</h2>
      <button class="btn btn-icon" id="member-modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Nombre completo</label>
        <input class="form-input" id="mem-name" value="${esc(m?.name || '')}" placeholder="Nombre del miembro" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Rol en el equipo</label>
        <input class="form-input" id="mem-role" value="${esc(m?.role || '')}" placeholder="ej. Investigador, Supervisor">
      </div>
      <div class="form-group">
        <label class="form-label">Correo de identidad (para continuidad entre dispositivos)</label>
        <input type="email" class="form-input" id="mem-email" value="${esc(m?.email || '')}" placeholder="correo@institucion.edu">
        <small style="color:var(--text-secondary); display:block; margin-top:4px;">Si el usuario usa el mismo correo en perfil, se vinculan automáticamente.</small>
      </div>
      <div class="form-group">
        <label class="form-label">Avatar (1-2 letras)</label>
        <input class="form-input" id="mem-avatar" value="${esc(m?.avatar || '')}" maxlength="2" style="max-width:80px;">
      </div>
      <div class="form-group">
        <label class="form-label">Nivel de permisos</label>
        <select class="form-select" id="mem-role-sys">
          <option value="user" ${(!m?.systemRole || m.systemRole === 'user') ? 'selected' : ''}>Usuario — Acceso normal</option>
          <option value="admin" ${m?.systemRole === 'admin' ? 'selected' : ''}>Administrador — Acceso completo</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="member-modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="member-modal-save"><i data-feather="save"></i> Guardar</button>
    </div>`);

  innerModal.querySelector('#member-modal-close').addEventListener('click', closeModal);
  innerModal.querySelector('#member-modal-cancel').addEventListener('click', closeModal);

  innerModal.querySelector('#member-modal-save').addEventListener('click', async () => {
    const name = innerModal.querySelector('#mem-name').value.trim();
    if (!name) { showToast('El nombre es requerido.', 'error'); return; }
    const role = innerModal.querySelector('#mem-role').value.trim();
    const email = innerModal.querySelector('#mem-email').value.trim().toLowerCase();
    const avatar = (innerModal.querySelector('#mem-avatar').value.trim().toUpperCase() || name.charAt(0).toUpperCase()).slice(0, 2);
    const systemRole = innerModal.querySelector('#mem-role-sys').value;

    const payload = { name, role, email, avatar, systemRole };

    if (isEdit) {
      await store.dispatch('UPDATE_MEMBER', { id: memberId, ...payload });
      showToast(`Miembro "${name}" actualizado.`, 'success');
    } else {
      await store.dispatch('ADD_MEMBER', payload);
      showToast(`Miembro "${name}" creado.`, 'success');
    }

    closeModal();
    // Re-render parent member list
    if (parentContainer) renderMembersTab(parentContainer);
  });

  if (window.feather) feather.replace();
}

function renderContinuityTab(container) {
  const members = store.get.members();
  const tasks = store.get.allTasks();

  const rows = members.map(m => {
    const assignedCount = tasks.filter(t => t.assigneeId === m.id).length;
    const emailKey = m.email ? `email:${m.email}` : null;
    const memberKey = `member:${m.id}`;
    const linkedBy = emailKey ? 'correo' : 'ID de miembro';

    return `
      <tr>
        <td style="padding:10px 12px;">
          <div style="font-weight:600;">${esc(m.name)}</div>
          <div style="font-size:0.78rem; color:var(--text-muted);">${esc(m.role || '—')}</div>
        </td>
        <td style="padding:10px 12px; font-size:0.8rem; font-family:var(--font-mono); color:var(--text-secondary);">
          ${emailKey ? `<div style="color:var(--accent-success);">✓ ${esc(m.email)}</div>` : `<div style="color:var(--accent-warning);">⚠ Sin correo</div>`}
        </td>
        <td style="padding:10px 12px; text-align:center; color:var(--text-secondary);">${assignedCount}</td>
        <td style="padding:10px 12px;">
          <span class="badge ${emailKey ? 'badge-success' : 'badge-warning'}" style="font-size:0.73rem;">
            ${emailKey ? 'Por correo' : 'Por ID local'}
          </span>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0 0 6px; font-size:1rem; font-weight:600;">Continuidad de Cuentas</h3>
      <p style="color:var(--text-secondary); font-size:0.85rem; margin:0;">
        Los miembros con <strong>correo de identidad</strong> mantienen su cuenta activa en cualquier dispositivo o sesión.<br>
        Los miembros sin correo dependen del ID local (puede perderse si se resetea el workspace).
      </p>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%; border-collapse:collapse; font-size:0.875rem;">
        <thead>
          <tr style="border-bottom:1px solid var(--border-color);">
            <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Miembro</th>
            <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Identidad</th>
            <th style="text-align:center; padding:8px 12px; color:var(--text-muted); font-weight:500;">Tareas</th>
            <th style="text-align:left; padding:8px 12px; color:var(--text-muted); font-weight:500;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="padding:24px; text-align:center; color:var(--text-muted);">Sin miembros</td></tr>'}
        </tbody>
      </table>
    </div>
    <div style="margin-top:16px; padding:12px 16px; background:var(--bg-surface); border-radius:8px; font-size:0.83rem; color:var(--text-secondary);">
      <strong style="color:var(--text-primary);">Recomendación:</strong> Asigna un correo a cada miembro para garantizar continuidad entre sesiones y dispositivos. El correo vincula al miembro con el perfil de usuario cuando coinciden.
    </div>`;
}

function renderApprovalsTab(container) {
  const pendingTasks = store.get.allTasks().filter(t => t.status === 'Pendiente Aprobación');
  const projects = store.get.projects();

  if (!pendingTasks.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        <i data-feather="check-circle" style="width:40px;height:40px; margin-bottom:12px; color:var(--accent-success);"></i>
        <p style="margin:0; font-weight:500;">Sin aprobaciones pendientes</p>
        <p style="margin:8px 0 0; font-size:0.85rem;">Todas las tareas están al día.</p>
      </div>`;
    if (window.feather) feather.replace();
    return;
  }

  const rows = pendingTasks.map(t => {
    const proj = projects.find(p => p.id === t.projectId);
    const member = t.assigneeId ? store.get.memberById(t.assigneeId) : null;
    return `
      <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:8px; padding:14px 16px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">${esc(t.title)}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">
              ${proj ? `<span style="margin-right:10px;">📁 ${esc(proj.name)}</span>` : ''}
              ${member ? `<span>👤 ${esc(member.name)}</span>` : ''}
              ${t.createdBy ? `<span style="margin-left:10px;">Solicitado por: ${esc(t.createdBy)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button class="btn btn-sm" style="background:var(--accent-success)20; color:var(--accent-success); border:1px solid var(--accent-success)40;"
              data-approve="${t.id}"><i data-feather="check" style="width:13px;height:13px;"></i> Aprobar</button>
            <button class="btn btn-sm" style="background:var(--accent-danger)20; color:var(--accent-danger); border:1px solid var(--accent-danger)40;"
              data-reject="${t.id}"><i data-feather="x" style="width:13px;height:13px;"></i> Rechazar</button>
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0; font-size:1rem; font-weight:600;">Aprobaciones Pendientes (${pendingTasks.length})</h3>
    </div>
    ${rows}`;

  if (window.feather) feather.replace();

  container.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await store.dispatch('UPDATE_TASK', { id: btn.dataset.approve, status: 'En elaboración' });
      showToast('Tarea aprobada.', 'success');
      renderApprovalsTab(container);
    });
  });

  container.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await store.dispatch('UPDATE_TASK', { id: btn.dataset.reject, status: 'Capturado' });
      showToast('Tarea rechazada y devuelta a Capturado.', 'info');
      renderApprovalsTab(container);
    });
  });
}

function renderAdminSettingsTab(container) {
  const adminProfile = getAdminProfile();
  container.innerHTML = `
    <div style="max-width:480px;">
      <h3 style="margin:0 0 16px; font-size:1rem; font-weight:600;">Cuenta de Administrador</h3>
      <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:8px; padding:16px; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-primary)20;color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;">
            ${esc((adminProfile.name || 'A').charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="font-weight:600; color:var(--text-primary);">${esc(adminProfile.name)}</div>
            <div style="font-size:0.82rem; color:var(--text-muted);">${adminProfile.email ? esc(adminProfile.email) : 'Sin correo configurado'}</div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" id="admin-change-pwd"><i data-feather="key"></i> Cambiar contraseña admin</button>
      </div>
      <div style="background:var(--accent-danger)10; border:1px solid var(--accent-danger)30; border-radius:8px; padding:16px;">
        <h4 style="margin:0 0 8px; font-size:0.9rem; color:var(--accent-danger);">Zona de peligro</h4>
        <p style="margin:0 0 12px; font-size:0.83rem; color:var(--text-secondary);">Cerrar sesión de administrador o eliminar la cuenta admin del sistema.</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm" style="background:var(--accent-danger)15; color:var(--accent-danger); border:1px solid var(--accent-danger)40;" id="admin-session-close">
            <i data-feather="log-out"></i> Cerrar sesión admin
          </button>
          <button class="btn btn-sm" style="background:var(--accent-danger)15; color:var(--accent-danger); border:1px solid var(--accent-danger)40;" id="admin-remove-account">
            <i data-feather="trash-2"></i> Eliminar cuenta admin
          </button>
        </div>
      </div>
    </div>`;

  if (window.feather) feather.replace();

  container.querySelector('#admin-change-pwd').addEventListener('click', () => {
    closeModal();
    openAdminSetupModal();
  });

  container.querySelector('#admin-session-close').addEventListener('click', () => {
    setAdminSession(false);
    updateAdminBadge();
    closeModal();
    showToast('Sesión de administrador cerrada.', 'info');
  });

  container.querySelector('#admin-remove-account').addEventListener('click', () => {
    if (!confirm('¿Eliminar la cuenta de administrador? Deberás crear una nueva para acceder al panel de admin.')) return;
    localStorage.removeItem('workspace_admin_hash');
    localStorage.removeItem('workspace_admin_name');
    localStorage.removeItem('workspace_admin_email');
    setAdminSession(false);
    updateAdminBadge();
    closeModal();
    showToast('Cuenta de administrador eliminada.', 'info');
  });
}

function updateAdminBadge() {
  const btn = document.getElementById('btn-admin');
  if (!btn) return;
  if (isAdminSession()) {
    btn.classList.add('admin-active');
    btn.title = 'Panel de Administración (sesión activa)';
  } else {
    btn.classList.remove('admin-active');
    btn.title = 'Panel de Administración';
  }
}

window.openAdminLoginModal = openAdminLoginModal;
window.openAdminSetupModal = openAdminSetupModal;
window.openAdminPanel = openAdminPanel;
window.updateAdminBadge = updateAdminBadge;
