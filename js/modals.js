/**
 * modals.js — All modal dialogs for creating/editing entities
 */

// ────────────────────────────────────────────────────────────────────────────
// Modal helpers
// ────────────────────────────────────────────────────────────────────────────

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
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-input" id="task-title" placeholder="¿Qué hay que hacer?" autofocus value="${isEdit ? esc(task.title) : ''}">
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
            ${STATUSES.map(s => `<option value="${s}" ${s === defStatus ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-select" id="task-priority">
            <option value="alta" ${isEdit && task.priority === 'alta' ? 'selected' : ''}>Alta</option>
            <option value="media" ${(!isEdit || task.priority === 'media') ? 'selected' : ''}>Media</option>
            <option value="baja" ${isEdit && task.priority === 'baja' ? 'selected' : ''}>Baja</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="task-type">
            ${TASK_TYPES.map(t => `<option value="${t}" ${isEdit && task.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha límite</label>
        <input class="form-input" type="date" id="task-due" value="${isEdit && task.dueDate ? task.dueDate : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-textarea" id="task-desc" placeholder="Contexto, notas, referencias…" rows="2">${isEdit ? esc(task.description || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Etiquetas (separadas por coma)</label>
        <input class="form-input" id="task-tags" placeholder="ej. urgente, revisión, campo" value="${isEdit && task.tags ? esc(task.tags.join(', ')) : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Subtareas</label>
        <div id="subtasks-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;"></div>
        <div style="display:flex; gap:8px;">
          <input class="form-input" id="new-subtask" placeholder="Nueva subtarea…">
          <button class="btn btn-secondary" id="add-subtask" style="padding:0 12px;"><i data-feather="plus"></i></button>
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
      assigneeId: 'u1',
      tags,
      subtasks: subTasks
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
  const name = localStorage.getItem('workspace_user_name') || 'Carlos';
  const role = localStorage.getItem('workspace_user_role') || 'Owner';
  const avatar = localStorage.getItem('workspace_user_avatar') || name.charAt(0).toUpperCase();

  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;
  if (avatarEl) avatarEl.textContent = avatar;
}

function openProfileModal() {
  const currentName = localStorage.getItem('workspace_user_name') || 'Carlos';
  const currentRole = localStorage.getItem('workspace_user_role') || 'Owner';
  const currentAvatar = localStorage.getItem('workspace_user_avatar') || currentName.charAt(0).toUpperCase();

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
        <label class="form-label">Avatar (1 o 2 letras)</label>
        <input class="form-input" id="profile-avatar" value="${esc(currentAvatar)}" maxlength="2">
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
    const avatar = modal.querySelector('#profile-avatar').value.trim().toUpperCase() || name.charAt(0);

    localStorage.setItem('workspace_user_name', name);
    localStorage.setItem('workspace_user_role', role);
    localStorage.setItem('workspace_user_avatar', avatar);

    updateUserProfileUI();
    closeModal();
    showToast('Perfil actualizado', 'success');
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Help / Guide Modal
// ────────────────────────────────────────────────────────────────────────────
function openHelpModal() {
  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="help-circle"></i> Guía de Uso del Workspace</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body" style="padding:0;">
      <div class="tabs" id="help-tabs" style="padding: 16px 24px 0 24px;">
        <button class="tab-btn active" data-tab="conceptos">Conceptos Clave</button>
        <button class="tab-btn" data-tab="modulos">Módulos</button>
        <button class="tab-btn" data-tab="integraciones">Integraciones (Zotero/Obsidian)</button>
      </div>
      <div id="help-content" style="padding: 24px; max-height:60vh; overflow-y:auto; line-height:1.6;">
        <!-- Content injected here -->
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="help-close">Entendido</button>
    </div>`);

  const contentDiv = modal.querySelector('#help-content');

  const contentMap = {
    'conceptos': `
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">1. Proyectos</h3>
      <p style="margin-bottom:16px; color:var(--text-secondary);">Un proyecto es el contenedor principal de tu trabajo. Puede ser una investigación, un artículo, una clase o un desarrollo. Los proyectos agrupan tareas, ciclos, decisiones y documentos.</p>
      
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">2. Tareas (Backlog)</h3>
      <p style="margin-bottom:16px; color:var(--text-secondary);">La unidad atómica de trabajo. Las tareas viven en el Backlog del proyecto hasta que decides trabajarlas. Pueden tener subtareas, etiquetas, nivel de prioridad y fechas límite.</p>
      
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">3. Ciclos (Sprints)</h3>
      <p style="margin-bottom:16px; color:var(--text-secondary);">Para no abrumarte con un backlog gigante, puedes agrupar un conjunto de tareas en un "Ciclo" (con fecha de inicio y fin). Esto te permite enfocarte solo en lo que importa esta semana o quincena.</p>
    `,
    'modulos': `
      <ul style="list-style:none; padding:0; display:flex; flex-direction:column; gap:16px;">
        <li><strong><i data-feather="home" style="width:16px;height:16px;margin-right:8px;vertical-align:text-bottom;"></i> Dashboard:</strong> Tu vista matutina. Muestra qué ciclos están activos, tareas bloqueadas y las métricas generales de tu productividad.</li>
        <li><strong><i data-feather="layout" style="width:16px;height:16px;margin-right:8px;vertical-align:text-bottom;"></i> Tablero (Kanban):</strong> Una vista visual para mover tareas por columnas (Capturado, En elaboración, En espera, Terminado).</li>
        <li><strong><i data-feather="database" style="width:16px;height:16px;margin-right:8px;vertical-align:text-bottom;"></i> Biblioteca (Dataview):</strong> Tu base de datos de referencias bibliográficas (Papers, Libros). Puedes verlas en cuadrícula o en modo Tabla estilo Obsidian Dataview.</li>
        <li><strong><i data-feather="edit-3" style="width:16px;height:16px;margin-right:8px;vertical-align:text-bottom;"></i> Canvas:</strong> Una pizarra blanca infinita nativa para que hagas esquemas mentales, dibujos y borradores sin salir de la app (autoguardado offline).</li>
      </ul>
    `,
    'integraciones': `
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">1. Sincronizar con Google Drive en la Nube</h3>
      <ol style="margin-bottom:20px; color:var(--text-secondary); padding-left:20px; line-height:1.5;">
        <li style="margin-bottom:8px;">Ve a <a href="https://console.cloud.google.com/" target="_blank" style="color:var(--accent-primary);">Consola de Google Cloud</a>, crea un <strong>Nuevo Proyecto</strong> y ve a "API y Servicios".</li>
        <li style="margin-bottom:8px;">Busca y habilita la <strong>Google Drive API</strong>.</li>
        <li style="margin-bottom:8px;">Ve a <strong>Credenciales</strong> -> Crear Credenciales -> <strong>ID de cliente de OAuth</strong>. Elige "Aplicación Web". Añade el origen autorizado (como <code>https://proyectosesquizo.netlify.app</code>). Copia el "Client ID".</li>
        <li style="margin-bottom:8px;">En la Consola de Google, ve a <strong>Pantalla de consentimiento de OAuth</strong> y añade tu correo electrónico en la sección de <strong>Usuarios de prueba (Test users)</strong>, o publica la app.</li>
        <li style="margin-bottom:8px;">En el Workspace, dale clic al ícono de la nube ☁️ abajo a la izquierda, pega el <strong>Client ID</strong> y haz clic en Conectar.</li>
      </ol>

      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">2. Conectar Notas de Obsidian</h3>
      <ol style="margin-bottom:20px; color:var(--text-secondary); padding-left:20px;">
        <li style="margin-bottom:8px;">En Obsidian, haz clic derecho en una nota y selecciona <strong>Copy Obsidian URL</strong>.</li>
        <li style="margin-bottom:8px;">En el Workspace, edita tu proyecto y pega ese link (<code>obsidian://open?...</code>) en el campo "Nota de Obsidian/URI".</li>
        <li style="margin-bottom:8px;">Aparecerá un botón inteligente en tu proyecto que abrirá esa nota directa e instantáneamente.</li>
      </ol>

      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">3. Importar de Zotero</h3>
      <ul style="margin-bottom:16px; color:var(--text-secondary); padding-left:20px;">
        <li style="margin-bottom:8px;">En Zotero, selecciona tus referencias, haz clic derecho -> Exportar. En el formato, elige <strong>CSL JSON</strong>.</li>
        <li style="margin-bottom:8px;">Ve a la "Biblioteca" del Workspace y haz clic en <strong>Importar desde Zotero (JSON)</strong>. Sube tu archivo.</li>
      </ul>
    `
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
  renderHelpTab('conceptos');

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
