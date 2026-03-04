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

function openTaskModal(defaultProjectId, defaultStatus) {
  const projects = store.get.projects();
  const cycles = store.get.activeCycles();

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="check-square"></i> Nueva Tarea</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Título *</label>
        <input class="form-input" id="task-title" placeholder="¿Qué hay que hacer?" autofocus>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Proyecto</label>
          <select class="form-select" id="task-project">
            <option value="">Sin proyecto</option>
            ${projects.map(p => `<option value="${p.id}" ${p.id === defaultProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Ciclo</label>
          <select class="form-select" id="task-cycle">
            <option value="">Sin ciclo</option>
            ${cycles.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select class="form-select" id="task-status">
            ${STATUSES.map(s => `<option value="${s}" ${s === (defaultStatus || 'Capturado') ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select class="form-select" id="task-priority">
            <option value="alta">Alta</option>
            <option value="media" selected>Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-select" id="task-type">
            ${TASK_TYPES.map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha límite</label>
        <input class="form-input" type="date" id="task-due">
      </div>
      <div class="form-group">
        <label class="form-label">Descripción</label>
        <textarea class="form-textarea" id="task-desc" placeholder="Contexto, notas, referencias…" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Etiquetas (separadas por coma)</label>
        <input class="form-input" id="task-tags" placeholder="ej. urgente, revisión, campo">
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
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="task-save"><i data-feather="check"></i> Crear tarea</button>
    </div>`);

  const subTasks = [];
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

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#task-save').addEventListener('click', async () => {
    const title = modal.querySelector('#task-title').value.trim();
    if (!title) { showToast('El título es obligatorio.', 'error'); return; }

    const tags = modal.querySelector('#task-tags').value.split(',').map(t => t.trim()).filter(t => t);

    await store.dispatch('ADD_TASK', {
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
    });
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
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="proj-save"><i data-feather="check"></i> ${isEdit ? 'Guardar cambios' : 'Crear proyecto'}</button>
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

function openCycleModal(defaultProjectId) {
  const projects = store.get.projects();
  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="refresh-cw"></i> Nuevo Ciclo</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Nombre del ciclo *</label>
        <input class="form-input" id="cycle-name" placeholder="ej. Semana de cierre — Intro" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Proyecto</label>
        <select class="form-select" id="cycle-project">
          <option value="">Sin proyecto</option>
          ${projects.map(p => `<option value="${p.id}" ${p.id === defaultProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Objetivo del ciclo</label>
        <textarea class="form-textarea" id="cycle-goal" placeholder="¿Qué quieres lograr en este bloque temporal?" rows="2"></textarea>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Fecha de inicio</label>
          <input class="form-input" type="date" id="cycle-start">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha de cierre</label>
          <input class="form-input" type="date" id="cycle-end">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="cycle-save"><i data-feather="check"></i> Crear ciclo</button>
    </div>`);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#cycle-save').addEventListener('click', async () => {
    const name = modal.querySelector('#cycle-name').value.trim();
    if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }
    await store.dispatch('ADD_CYCLE', {
      name,
      projectId: modal.querySelector('#cycle-project').value || null,
      goal: modal.querySelector('#cycle-goal').value,
      startDate: modal.querySelector('#cycle-start').value || null,
      endDate: modal.querySelector('#cycle-end').value || null,
      status: 'activo',
    });
    closeModal();
    refreshCurrentView();
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Decision Modal
// ────────────────────────────────────────────────────────────────────────────

function openDecisionModal(defaultProjectId) {
  const projects = store.get.projects();
  const today = new Date().toISOString().slice(0, 10);

  const modal = openModal(`
    <div class="modal-header">
      <h2><i data-feather="zap"></i> Nueva Decisión</h2>
      <button class="btn btn-icon" id="modal-close"><i data-feather="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Título de la decisión *</label>
        <input class="form-input" id="dec-title" placeholder="ej. Enfocar artículo en adultos mayores" autofocus>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Proyecto</label>
          <select class="form-select" id="dec-project">
            <option value="">Sin proyecto</option>
            ${projects.map(p => `<option value="${p.id}" ${p.id === defaultProjectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Impacto</label>
          <select class="form-select" id="dec-impact">
            <option value="alta">Alto</option>
            <option value="media" selected>Medio</option>
            <option value="baja">Bajo</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Contexto</label>
        <textarea class="form-textarea" id="dec-context" placeholder="¿Cuál era la situación que requería esta decisión?" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Decisión tomada *</label>
        <textarea class="form-textarea" id="dec-decision" placeholder="Describe la decisión con precisión" rows="2"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input class="form-input" type="date" id="dec-date" value="${today}">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="dec-save"><i data-feather="check"></i> Registrar decisión</button>
    </div>`);

  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('#dec-save').addEventListener('click', async () => {
    const title = modal.querySelector('#dec-title').value.trim();
    const decision = modal.querySelector('#dec-decision').value.trim();
    if (!title || !decision) { showToast('Título y decisión son obligatorios.', 'error'); return; }
    await store.dispatch('ADD_DECISION', {
      title,
      projectId: modal.querySelector('#dec-project').value || null,
      context: modal.querySelector('#dec-context').value,
      decision,
      impact: modal.querySelector('#dec-impact').value,
      date: modal.querySelector('#dec-date').value,
      ownerId: 'u1',
    });
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

window.openModal = openModal;
window.closeModal = closeModal;
window.openTaskModal = openTaskModal;
window.openProjectModal = openProjectModal;
window.openCycleModal = openCycleModal;
window.openDecisionModal = openDecisionModal;
window.openProfileModal = openProfileModal;
window.updateUserProfileUI = updateUserProfileUI;

