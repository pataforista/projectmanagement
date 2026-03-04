/**
 * views/backlog.js — Backlog view
 */

const STATUSES = ['Capturado', 'Definido', 'En preparación', 'En elaboración', 'En revisión', 'En espera', 'Terminado', 'Archivado'];
const PRIORITIES = ['alta', 'media', 'baja'];
const TASK_TYPES = ['tarea', 'subtarea', 'entregable', 'hito', 'idea', 'decisión', 'recurso'];

// Track selected task IDs for bulk operations
let _backlogSelected = new Set();
let _backlogShowRestricted = false;

function renderBacklog(root) {
  _backlogSelected = new Set();

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Backlog</h1>
          <p class="view-subtitle">Captura y priorización de todo el trabajo pendiente.</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-secondary" id="bulk-delete-btn" style="display:none;color:var(--accent-danger);border-color:rgba(239,68,68,0.3);">
            <i data-feather="trash-2"></i> Eliminar selección (<span id="sel-count">0</span>)
          </button>
          <button class="btn btn-primary" id="backlog-new-btn"><i data-feather="plus"></i> Nueva tarea</button>
        </div>
      </div>

      <div class="filter-bar" id="backlog-filters">
        <select class="filter-select" id="bl-proj">
          <option value="">Todos los proyectos</option>
          ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <select class="filter-select" id="bl-status">
          <option value="">Todos los estados</option>
          ${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select class="filter-select" id="bl-priority">
          <option value="">Todas las prioridades</option>
          ${PRIORITIES.map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
        </select>
        <label class="filter-toggle" title="Mostrar u ocultar tareas de proyectos restringidos">
          <input type="checkbox" id="bl-show-restricted" ${_backlogShowRestricted ? 'checked' : ''}>
          <i data-feather="lock" style="width:12px;height:12px;"></i> Mostrar restringidos
        </label>
      </div>

      <div id="backlog-table-wrap">
        ${renderBacklogTable(getFilteredTasks(root))}
      </div>
    </div>`;

  feather.replace();
  bindInlineStatus(root);
  bindTaskCheckboxes(root);
  bindBacklogRowDelete(root);
  bindBulkSelect(root);

  root.querySelector('#backlog-new-btn').addEventListener('click', () => openTaskModal());
  root.querySelector('#bulk-delete-btn').addEventListener('click', () => bulkDeleteTasks(root));
  root.querySelector('#bl-show-restricted').addEventListener('change', e => {
    _backlogShowRestricted = e.target.checked;
    refreshBacklog(root);
  });

  ['bl-proj', 'bl-status', 'bl-priority'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('change', () => refreshBacklog(root));
  });
}

function getBacklogFilters(root) {
  return {
    projectId: root.querySelector('#bl-proj')?.value || '',
    status: root.querySelector('#bl-status')?.value || '',
    priority: root.querySelector('#bl-priority')?.value || '',
  };
}

function getFilteredTasks(root) {
  const f = getBacklogFilters(root);
  // Base: visible tasks (excludes locked restricted projects unless show-restricted is ON)
  let tasks = _backlogShowRestricted ? store.get.allTasks() : store.get.visibleTasks();
  if (f.projectId) tasks = tasks.filter(t => t.projectId === f.projectId);
  if (f.status) tasks = tasks.filter(t => t.status === f.status);
  if (f.priority) tasks = tasks.filter(t => t.priority === f.priority);
  return tasks;
}

function refreshBacklog(root) {
  const tasks = getFilteredTasks(root);
  root.querySelector('#backlog-table-wrap').innerHTML = renderBacklogTable(tasks);
  feather.replace();
  bindInlineStatus(root);
  bindTaskCheckboxes(root);
  bindBacklogRowDelete(root);
  bindBulkSelect(root);
  _backlogSelected = new Set();
  updateBulkUI(root);
}

function renderBacklogTable(tasks) {
  if (!tasks.length) return emptyState('inbox', 'El backlog está vacío.');
  return `
    <table class="list-table" id="backlog-list-table">
      <thead>
        <tr>
          <th style="width:32px;">
            <div class="task-checkbox" id="select-all-cb" title="Seleccionar todo" style="margin:0 auto;"></div>
          </th>
          <th>Título</th>
          <th>Proyecto</th>
          <th>Estado</th>
          <th>Prioridad</th>
          <th>Tipo</th>
          <th>Fecha límite</th>
          <th style="width:36px;"></th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(t => backlogRow(t)).join('')}
      </tbody>
    </table>`;
}

function backlogRow(t) {
  const proj = store.get.projectById(t.projectId);
  const isDone = t.status === 'Terminado' || t.status === 'Archivado';
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && !isDone;
  const isRestricted = proj && proj.visibility === 'restricted' && !store.isProjectUnlocked(t.projectId);
  return `
    <tr data-task-id="${t.id}" class="${isRestricted ? 'row-restricted' : ''}">
      <td>
        <div class="task-checkbox bulk-select-cb ${_backlogSelected.has(t.id) ? 'checked' : ''}"
          data-id="${t.id}" style="margin:0 auto;" title="Seleccionar tarea"></div>
      </td>
      <td>
        <span class="task-title ${isDone ? 'done' : ''}">${esc(t.title)}</span>
        ${isRestricted ? `<span style="font-size:0.65rem;color:var(--accent-warning);margin-left:6px;">🔒</span>` : ''}
        ${t.tags && t.tags.length ? `
          <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
            ${t.tags.map(tag => `<span class="badge badge-neutral" style="font-size:0.6rem; padding:1px 5px; opacity:0.7;">${esc(tag)}</span>`).join('')}
          </div>` : ''}
      </td>
      <td>
        ${proj ? `<span style="font-size:0.78rem; display:inline-flex; align-items:center; gap:4px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${proj.color || 'var(--accent-primary)'};display:inline-block;"></span>
          ${esc(proj.name)}
        </span>` : '<span style="color:var(--text-muted);">—</span>'}
      </td>
      <td>
        <select class="filter-select inline-status-select" data-task-id="${t.id}" style="font-size:0.75rem; padding:3px 22px 3px 7px;">
          ${STATUSES.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px;">
          <span class="priority-pip ${t.priority || 'baja'}"></span>
          <span style="font-size:0.78rem;text-transform:capitalize;">${esc(t.priority || 'baja')}</span>
        </span>
      </td>
      <td><span class="badge badge-neutral" style="font-size:0.68rem;">${esc(t.type || 'tarea')}</span></td>
      <td style="font-size:0.78rem; ${isOverdue ? 'color:var(--accent-danger);font-weight:600;' : 'color:var(--text-muted);'}">
        ${t.dueDate ? fmtDate(t.dueDate) : '—'}
      </td>
      <td>
        <button class="btn btn-icon row-delete-btn" data-task-id="${t.id}" title="Eliminar tarea"
          style="padding:4px;color:var(--text-muted);opacity:0;transition:opacity 0.15s;">
          <i data-feather="trash-2" style="width:13px;height:13px;"></i>
        </button>
      </td>
    </tr>`;
}

function bindInlineStatus(root) {
  root.querySelectorAll('.inline-status-select').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const taskId = sel.dataset.taskId;
      await store.dispatch('UPDATE_TASK', { id: taskId, status: e.target.value });
      refreshBacklog(root);
    });
  });

  // Open modal on row click (excluding checkbox, status select, delete btn)
  root.querySelectorAll('table.list-table tbody tr').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.task-checkbox') ||
          e.target.closest('.inline-status-select') ||
          e.target.closest('.row-delete-btn')) return;
      const taskId = row.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === taskId);
      if (task) openTaskModal(task);
    });

    // Show delete button on row hover
    const delBtn = row.querySelector('.row-delete-btn');
    if (delBtn) {
      row.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
      row.addEventListener('mouseleave', () => delBtn.style.opacity = '0');
    }
  });
}

function bindBacklogRowDelete(root) {
  root.querySelectorAll('.row-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === taskId);
      if (!task) return;
      confirmDialog(`¿Eliminar la tarea "${task.title}"?`, async () => {
        await store.dispatch('DELETE_TASK', { id: taskId });
        refreshBacklog(root);
      });
    });
  });
}

function bindBulkSelect(root) {
  // Per-row checkboxes
  root.querySelectorAll('.bulk-select-cb').forEach(cb => {
    cb.addEventListener('click', e => {
      e.stopPropagation();
      const id = cb.dataset.id;
      if (_backlogSelected.has(id)) {
        _backlogSelected.delete(id);
        cb.classList.remove('checked');
      } else {
        _backlogSelected.add(id);
        cb.classList.add('checked');
      }
      updateBulkUI(root);
    });
  });

  // Select all
  const selectAll = root.querySelector('#select-all-cb');
  if (selectAll) {
    selectAll.addEventListener('click', e => {
      e.stopPropagation();
      const allIds = [...root.querySelectorAll('.bulk-select-cb')].map(cb => cb.dataset.id);
      const allSelected = allIds.every(id => _backlogSelected.has(id));
      if (allSelected) {
        allIds.forEach(id => _backlogSelected.delete(id));
        selectAll.classList.remove('checked');
        root.querySelectorAll('.bulk-select-cb').forEach(cb => cb.classList.remove('checked'));
      } else {
        allIds.forEach(id => _backlogSelected.add(id));
        selectAll.classList.add('checked');
        root.querySelectorAll('.bulk-select-cb').forEach(cb => cb.classList.add('checked'));
      }
      updateBulkUI(root);
    });
  }
}

function updateBulkUI(root) {
  const count = _backlogSelected.size;
  const btn = root.querySelector('#bulk-delete-btn');
  const countEl = root.querySelector('#sel-count');
  if (btn) btn.style.display = count > 0 ? 'inline-flex' : 'none';
  if (countEl) countEl.textContent = count;
}

async function bulkDeleteTasks(root) {
  const count = _backlogSelected.size;
  if (!count) return;
  confirmDialog(`¿Eliminar ${count} tarea${count > 1 ? 's' : ''} seleccionada${count > 1 ? 's' : ''}? Esta acción no se puede deshacer.`, async () => {
    for (const id of _backlogSelected) {
      await store.dispatch('DELETE_TASK', { id });
    }
    _backlogSelected = new Set();
    refreshBacklog(root);
    showToast(`${count} tarea${count > 1 ? 's eliminadas' : ' eliminada'}.`, 'info');
  });
}
