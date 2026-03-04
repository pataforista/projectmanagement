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

// Confirmation dialog (styled, replaces browser confirm())
function confirmDialog(message, onConfirm, dangerLabel = 'Eliminar') {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px;">
      <div class="modal-header">
        <h2 style="display:flex;align-items:center;gap:8px;"><i data-feather="alert-triangle" style="color:var(--accent-danger);width:18px;height:18px;"></i> Confirmar acción</h2>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-secondary);line-height:1.6;">${esc(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="conf-cancel">Cancelar</button>
        <button class="btn btn-danger" id="conf-ok"><i data-feather="trash-2"></i> ${dangerLabel}</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  feather.replace();
  overlay.querySelector('#conf-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#conf-ok').addEventListener('click', () => { overlay.remove(); onConfirm(); });
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
        ${isEdit ? `<button class="btn btn-sm btn-ghost" id="task-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : ''}
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="task-save"><i data-feather="check"></i> ${isEdit ? 'Guardar Cambios' : 'Crear Tarea'}</button>
      </div>
    </div>`);

  let subTasks = isEdit && task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : [];
  const subList = modal.querySelector('#subtasks-list');

  function renderSubtasks() {
    subList.innerHTML = subTasks.map(st => `
      <div class="subtask-row" data-id="${st.id}" style="display:flex; align-items:center; gap:8px; background:var(--bg-surface-2); padding:6px 10px; border-radius:4px;">
        <input type="checkbox" class="st-check" data-sid="${st.id}" ${st.done ? 'checked' : ''}>
        <span style="flex:1; font-size:0.84rem; ${st.done ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${esc(st.title)}</span>
        <button class="btn btn-icon st-del" data-sid="${st.id}" style="padding:2px;"><i data-feather="x" style="width:13px;height:13px;"></i></button>
      </div>`).join('');
    feather.replace();
  }

  modal.querySelector('#add-subtask').addEventListener('click', () => {
    const input = modal.querySelector('#new-subtask');
    const text = input.value.trim();
    if (!text) return;
    subTasks.push({ id: Date.now(), title: text, done: false });
    input.value = '';
    renderSubtasks();
  });

  modal.querySelector('#new-subtask').addEventListener('keypress', e => {
    if (e.key === 'Enter') modal.querySelector('#add-subtask').click();
  });

  subList.addEventListener('change', e => {
    if (e.target.classList.contains('st-check')) {
      const sid = parseInt(e.target.dataset.sid, 10);
      const st = subTasks.find(x => x.id === sid);
      if (st) st.done = e.target.checked;
      renderSubtasks();
    }
  });

  subList.addEventListener('click', e => {
    const btn = e.target.closest('.st-del');
    if (btn) {
      const sid = parseInt(btn.dataset.sid, 10);
      subTasks = subTasks.filter(x => x.id !== sid);
      renderSubtasks();
    }
  });

  if (isEdit) {
    renderSubtasks();
    modal.querySelector('#task-delete').addEventListener('click', () => {
      confirmDialog(`¿Eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`, async () => {
        await store.dispatch('DELETE_TASK', { id: task.id });
        closeModal();
        refreshCurrentView();
      });
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
// Project Modal (with access control)
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

      <div class="divider" style="margin:4px 0;"></div>
      <div class="section-label" style="display:flex;align-items:center;gap:6px;"><i data-feather="lock" style="width:12px;height:12px;color:var(--accent-warning);"></i> Control de Acceso</div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Visibilidad</label>
          <select class="form-select" id="proj-visibility">
            <option value="public" ${!isEdit || p?.visibility !== 'restricted' ? 'selected' : ''}>Público (visible siempre)</option>
            <option value="restricted" ${isEdit && p?.visibility === 'restricted' ? 'selected' : ''}>Restringido (requiere PIN)</option>
          </select>
        </div>
        <div class="form-group" id="proj-pin-group" style="${isEdit && p?.visibility === 'restricted' ? '' : 'opacity:0.4;pointer-events:none;'}">
          <label class="form-label">PIN (4 dígitos)</label>
          <input class="form-input" type="password" id="proj-pin" maxlength="4" pattern="[0-9]*" inputmode="numeric"
            placeholder="ej. 1234" value="${isEdit && p?.pin ? p.pin : ''}">
        </div>
      </div>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:-8px;">Los proyectos restringidos se ocultan en el backlog y tablero global hasta desbloquearse con el PIN en cada sesión.</p>
    </div>
    <div class="modal-footer" style="${isEdit ? 'justify-content: space-between;' : ''}">
      ${isEdit ? `<button class="btn btn-ghost" id="proj-delete" style="color:var(--accent-danger);"><i data-feather="trash-2"></i> Eliminar</button>` : '<div></div>'}
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="proj-save"><i data-feather="check"></i> ${isEdit ? 'Guardar cambios' : 'Crear proyecto'}</button>
      </div>
    </div>`);

  feather.replace();

  // Visibility toggle → enable/disable PIN field
  modal.querySelector('#proj-visibility').addEventListener('change', e => {
    const pinGroup = modal.querySelector('#proj-pin-group');
    if (e.target.value === 'restricted') {
      pinGroup.style.opacity = '1';
      pinGroup.style.pointerEvents = 'auto';
      modal.querySelector('#proj-pin').focus();
    } else {
      pinGroup.style.opacity = '0.4';
      pinGroup.style.pointerEvents = 'none';
    }
  });

  // Color swatches
  modal.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      modal.querySelectorAll('.color-swatch').forEach(s => s.style.borderColor = 'transparent');
      sw.style.borderColor = '#fff';
      modal.querySelector('#proj-color').value = sw.dataset.color;
    });
  });
  if (!isEdit) modal.querySelector('.color-swatch').style.borderColor = '#fff';

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

  if (isEdit) {
    modal.querySelector('#proj-delete').addEventListener('click', () => {
      confirmDialog('¿Eliminar este proyecto? Se borrarán también sus tareas, ciclos y decisiones asociadas. Esta acción no se puede deshacer.', async () => {
        await store.dispatch('DELETE_PROJECT', { id: p.id });
        closeModal();
        refreshCurrentView();
        refreshSidebarProjects();
      });
    });
  }

  modal.querySelector('#proj-save').addEventListener('click', async () => {
    const name = modal.querySelector('#proj-name').value.trim();
    if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }

    const visibility = modal.querySelector('#proj-visibility').value;
    const pin = modal.querySelector('#proj-pin').value.trim();
    if (visibility === 'restricted' && pin && !/^\d{4}$/.test(pin)) {
      showToast('El PIN debe ser de 4 dígitos numéricos.', 'error');
      return;
    }

    const data = {
      name,
      type: modal.querySelector('#proj-type').value,
      status: modal.querySelector('#proj-status').value,
      goal: modal.querySelector('#proj-goal').value,
      obsidianUri: modal.querySelector('#proj-obsidian').value.trim(),
      startDate: modal.querySelector('#proj-start').value || null,
      endDate: modal.querySelector('#proj-end').value || null,
      color: modal.querySelector('#proj-color').value,
      visibility: visibility,
      pin: visibility === 'restricted' ? pin : '',
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
// Project PIN Unlock Modal
// ────────────────────────────────────────────────────────────────────────────

function openProjectUnlockModal(project, onSuccess) {
  const hasPin = !!project.pin;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:340px;">
      <div class="modal-header">
        <h2 style="display:flex;align-items:center;gap:8px;">
          <i data-feather="lock" style="color:var(--accent-warning);width:16px;height:16px;"></i>
          Proyecto Restringido
        </h2>
        <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-secondary);margin-bottom:16px;font-size:0.875rem;">
          <strong>${esc(project.name)}</strong> está protegido.
          ${hasPin ? 'Ingresa el PIN de 4 dígitos para acceder.' : 'Confirma que deseas acceder a este proyecto restringido.'}
        </p>
        ${hasPin ? `
          <div class="form-group">
            <label class="form-label">PIN de acceso</label>
            <input class="form-input" type="password" id="unlock-pin" maxlength="4" pattern="[0-9]*" inputmode="numeric" placeholder="••••" autofocus style="text-align:center;letter-spacing:8px;font-size:1.4rem;">
          </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button class="btn btn-primary" id="unlock-confirm"><i data-feather="unlock"></i> Desbloquear</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  feather.replace();

  const confirm = () => {
    if (hasPin) {
      const pin = overlay.querySelector('#unlock-pin').value.trim();
      if (pin !== project.pin) {
        const input = overlay.querySelector('#unlock-pin');
        input.style.borderColor = 'var(--accent-danger)';
        input.value = '';
        input.placeholder = 'PIN incorrecto';
        setTimeout(() => { input.style.borderColor = ''; input.placeholder = '••••'; }, 1500);
        return;
      }
    }
    store.unlockProject(project.id);
    overlay.remove();
    showToast(`Proyecto "${project.name}" desbloqueado.`, 'success');
    if (onSuccess) onSuccess();
    refreshSidebarProjects();
    refreshCurrentView();
  };

  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#unlock-confirm').addEventListener('click', confirm);
  if (hasPin) {
    overlay.querySelector('#unlock-pin').addEventListener('keypress', e => {
      if (e.key === 'Enter') confirm();
    });
  }
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
    modal.querySelector('#cycle-delete').addEventListener('click', () => {
      confirmDialog(`¿Eliminar el ciclo "${cycle.name}"? Las tareas del ciclo no se eliminarán.`, async () => {
        await store.dispatch('DELETE_CYCLE', { id: cycle.id });
        closeModal();
        refreshCurrentView();
      });
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
// Decision Modal (fixed)
// ────────────────────────────────────────────────────────────────────────────

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
    modal.querySelector('#dec-delete').addEventListener('click', () => {
      confirmDialog(`¿Eliminar la decisión "${decision.title}"?`, async () => {
        await store.dispatch('DELETE_DECISION', { id: decision.id });
        closeModal();
        refreshCurrentView();
      });
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
      ownerId: localStorage.getItem('workspace_user_name') || 'u1',
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
      <div class="divider"></div>
      <div class="form-group">
        <label class="form-label" style="color:var(--accent-danger);">Cambiar contraseña maestra</label>
        <input class="form-input" type="password" id="profile-new-pwd" placeholder="Nueva contraseña (dejar vacío para no cambiar)" autocomplete="new-password">
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
    const newPwd = modal.querySelector('#profile-new-pwd').value.trim();

    localStorage.setItem('workspace_user_name', name);
    localStorage.setItem('workspace_user_role', role);
    localStorage.setItem('workspace_user_avatar', avatar);

    if (newPwd && newPwd.length >= 4) {
      const hashStr = str => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        return hash.toString();
      };
      localStorage.setItem('workspace_lock_hash', hashStr(newPwd));
      showToast('Contraseña actualizada.', 'success');
    } else if (newPwd && newPwd.length < 4) {
      showToast('La contraseña debe tener al menos 4 caracteres.', 'error');
      return;
    }

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
        <button class="tab-btn" data-tab="acceso">Control de Acceso</button>
        <button class="tab-btn" data-tab="integraciones">Integraciones</button>
      </div>
      <div id="help-content" style="padding: 24px; max-height:60vh; overflow-y:auto; line-height:1.6;">
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
        <li><strong>Dashboard:</strong> Tu vista matutina. Muestra qué ciclos están activos, tareas bloqueadas y las métricas generales de tu productividad.</li>
        <li><strong>Tablero (Kanban):</strong> Una vista visual para mover tareas por columnas (Capturado, En elaboración, En espera, Terminado).</li>
        <li><strong>Backlog:</strong> Lista completa de todas las tareas. Puedes eliminar, filtrar y cambiar estado directamente. Usa los checkboxes para selección múltiple y eliminación en masa.</li>
        <li><strong>Biblioteca:</strong> Tu base de datos de referencias bibliográficas (Papers, Libros). Puedes verlas en cuadrícula o en modo Tabla.</li>
        <li><strong>Canvas:</strong> Una pizarra blanca infinita nativa para que hagas esquemas mentales y borradores sin salir de la app (autoguardado offline).</li>
      </ul>
    `,
    'acceso': `
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">Proyectos Restringidos</h3>
      <p style="margin-bottom:12px; color:var(--text-secondary);">Puedes asignar visibilidad <strong>"Restringida"</strong> a un proyecto para protegerlo con un PIN de 4 dígitos.</p>
      <ul style="color:var(--text-secondary); padding-left:20px; line-height:1.8; margin-bottom:16px;">
        <li>Los proyectos restringidos aparecen con un ícono 🔒 en el sidebar y la lista de proyectos.</li>
        <li>Sus tareas se ocultan del backlog global, tablero Kanban y calendario hasta que desbloquees el proyecto.</li>
        <li>El desbloqueo dura toda la sesión del navegador (se restablece al cerrar la pestaña).</li>
        <li>Para desbloquear: haz clic en el nombre del proyecto en el sidebar o en la lista, e ingresa el PIN.</li>
        <li>Para re-bloquear: haz clic en "🔒 Bloquear proyecto" en la cabecera del proyecto.</li>
      </ul>
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">Contraseña Maestra</h3>
      <p style="color:var(--text-secondary);">Puedes cambiar tu contraseña maestra del workspace desde el perfil de usuario (ícono de usuario en la esquina inferior izquierda).</p>
    `,
    'integraciones': `
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">1. Sincronizar con Google Drive</h3>
      <ol style="margin-bottom:20px; color:var(--text-secondary); padding-left:20px; line-height:1.5;">
        <li style="margin-bottom:8px;">Ve a la Consola de Google Cloud, crea un Nuevo Proyecto y ve a "API y Servicios".</li>
        <li style="margin-bottom:8px;">Habilita la Google Drive API.</li>
        <li style="margin-bottom:8px;">Crea credenciales OAuth y copia el "Client ID".</li>
        <li style="margin-bottom:8px;">En el Workspace, dale clic al ícono de la nube ☁️ abajo a la izquierda, pega el Client ID y conecta.</li>
      </ol>
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">2. Conectar Notas de Obsidian</h3>
      <ol style="margin-bottom:20px; color:var(--text-secondary); padding-left:20px;">
        <li style="margin-bottom:8px;">En Obsidian, haz clic derecho en una nota y selecciona <strong>Copy Obsidian URL</strong>.</li>
        <li style="margin-bottom:8px;">En el Workspace, edita tu proyecto y pega el link en el campo "Nota de Obsidian/URI".</li>
      </ol>
      <h3 style="margin-bottom:12px; font-weight:600; color:var(--accent-primary);">3. Importar de Zotero</h3>
      <ul style="color:var(--text-secondary); padding-left:20px;">
        <li style="margin-bottom:8px;">En Zotero, exporta en formato <strong>CSL JSON</strong>.</li>
        <li style="margin-bottom:8px;">Ve a la "Biblioteca" del Workspace y sube tu archivo.</li>
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

  renderHelpTab('conceptos');
  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#help-close').addEventListener('click', closeModal);
}

window.openModal = openModal;
window.closeModal = closeModal;
window.confirmDialog = confirmDialog;
window.openTaskModal = openTaskModal;
window.openProjectModal = openProjectModal;
window.openProjectUnlockModal = openProjectUnlockModal;
window.openCycleModal = openCycleModal;
window.openDecisionModal = openDecisionModal;
window.openProfileModal = openProfileModal;
window.openHelpModal = openHelpModal;
window.updateUserProfileUI = updateUserProfileUI;
