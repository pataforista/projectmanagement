/**
 * views/backlog.js — Backlog view
 */

const STATUSES = ['Capturado', 'Definido', 'En preparación', 'En elaboración', 'En revisión', 'En espera', 'Terminado', 'Archivado'];
const PRIORITIES = ['alta', 'media', 'baja'];
const TASK_TYPES = ['tarea', 'subtarea', 'entregable', 'hito', 'idea', 'decisión', 'recurso'];

function renderBacklog(root) {
  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Backlog</h1>
          <p class="view-subtitle">Captura y priorización de todo el trabajo pendiente.</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-secondary" id="backlog-archive-done-btn" title="Archivar todas las tareas Terminadas">
            <i data-feather="archive"></i> Archivar completadas
          </button>
          <button class="btn btn-primary" id="backlog-new-btn"><i data-feather="plus"></i> Nueva tarea</button>
        </div>
      </div>

      <!-- Filters + Search bar -->
      <div class="filter-bar" id="backlog-filters" style="flex-wrap:wrap; gap:8px;">
        <input class="form-input" id="bl-search" placeholder="Buscar tareas…" style="max-width:200px; padding:6px 10px; font-size:0.82rem;">
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
        <button class="btn btn-secondary bl-quick-filter" id="bl-today" data-active="false" title="Solo tareas que vencen hoy">
          <i data-feather="sun"></i> Hoy
        </button>
        <button class="btn btn-secondary bl-quick-filter" id="bl-overdue" data-active="false" title="Solo tareas vencidas">
          <i data-feather="alert-circle"></i> Vencidas
        </button>
      </div>

      <!-- Bulk actions bar (hidden until selection) -->
      <div id="bulk-bar" style="display:none; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-sm); margin-bottom:8px;">
        <span id="bulk-count" style="font-size:0.82rem; color:var(--text-secondary);"></span>
        <select class="filter-select" id="bulk-status-select" style="font-size:0.78rem; padding:4px 24px 4px 8px;">
          <option value="">Cambiar estado…</option>
          ${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <button class="btn btn-secondary" id="bulk-apply-status" style="font-size:0.78rem; padding:5px 12px;">Aplicar</button>
        <button class="btn btn-danger"    id="bulk-delete"       style="font-size:0.78rem; padding:5px 12px; background:var(--accent-danger); color:#fff; border-color:var(--accent-danger);">
          <i data-feather="trash-2"></i> Eliminar
        </button>
        <button class="btn btn-icon" id="bulk-clear" style="margin-left:auto;" title="Cancelar selección">
          <i data-feather="x"></i>
        </button>
      </div>

      <div id="backlog-table-wrap">
        ${renderBacklogTable(store.get.allTasks())}
      </div>
    </div>`;

  feather.replace();
  bindInlineStatus(root);
  bindTaskCheckboxes(root);

  // New task
  root.querySelector('#backlog-new-btn').addEventListener('click', () => openTaskModal());

  // Archive completed
  root.querySelector('#backlog-archive-done-btn').addEventListener('click', async () => {
    const done = store.get.allTasks().filter(t => t.status === 'Terminado');
    if (!done.length) { showToast('No hay tareas terminadas.', 'info'); return; }
    for (const t of done) {
      await store.dispatch('UPDATE_TASK', { id: t.id, status: 'Archivado' });
    }
    showToast(`${done.length} tarea(s) archivadas.`, 'success');
    refreshBacklog(root);
  });

  // Filters
  ['bl-search', 'bl-proj', 'bl-status', 'bl-priority'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('input', () => refreshBacklog(root));
    root.querySelector(`#${id}`)?.addEventListener('change', () => refreshBacklog(root));
  });

  // Quick filter buttons (toggle)
  ['bl-today', 'bl-overdue'].forEach(id => {
    root.querySelector(`#${id}`)?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const isActive = btn.dataset.active === 'true';
      btn.dataset.active = (!isActive).toString();
      btn.classList.toggle('btn-primary', !isActive);
      btn.classList.toggle('btn-secondary', isActive);
      refreshBacklog(root);
    });
  });

  // Bulk action bindings
  _bindBulkActions(root);
}

function _bindBulkActions(root) {
  // Select all checkbox in header
  root.addEventListener('change', e => {
    if (e.target.id === 'bl-select-all') {
      const checked = e.target.checked;
      root.querySelectorAll('.bl-row-check').forEach(cb => {
        cb.checked = checked;
      });
      _updateBulkBar(root);
    } else if (e.target.classList.contains('bl-row-check')) {
      _updateBulkBar(root);
    }
  });

  root.querySelector('#bulk-apply-status')?.addEventListener('click', async () => {
    const newStatus = root.querySelector('#bulk-status-select')?.value;
    if (!newStatus) { showToast('Selecciona un estado.', 'info'); return; }
    const ids = _getSelectedIds(root);
    for (const id of ids) {
      await store.dispatch('UPDATE_TASK', { id, status: newStatus });
    }
    showToast(`${ids.length} tarea(s) actualizadas.`, 'success');
    refreshBacklog(root);
  });

  root.querySelector('#bulk-delete')?.addEventListener('click', async () => {
    const ids = _getSelectedIds(root);
    if (!ids.length) return;
    if (!confirm(`¿Eliminar ${ids.length} tarea(s) seleccionadas?`)) return;
    for (const id of ids) {
      await store.dispatch('DELETE_TASK', { id });
    }
    showToast(`${ids.length} tarea(s) eliminadas.`, 'info');
    refreshBacklog(root);
  });

  root.querySelector('#bulk-clear')?.addEventListener('click', () => {
    root.querySelectorAll('.bl-row-check').forEach(cb => { cb.checked = false; });
    const selectAll = root.querySelector('#bl-select-all');
    if (selectAll) selectAll.checked = false;
    _updateBulkBar(root);
  });
}

function _getSelectedIds(root) {
  return Array.from(root.querySelectorAll('.bl-row-check:checked'))
    .map(cb => cb.dataset.id)
    .filter(Boolean);
}

function _updateBulkBar(root) {
  const ids = _getSelectedIds(root);
  const bar = root.querySelector('#bulk-bar');
  const countEl = root.querySelector('#bulk-count');
  if (!bar) return;
  if (ids.length > 0) {
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = `${ids.length} seleccionada(s)`;
  } else {
    bar.style.display = 'none';
  }
}

function getBacklogFilters(root) {
  return {
    search:    (root.querySelector('#bl-search')?.value || '').toLowerCase().trim(),
    projectId: root.querySelector('#bl-proj')?.value || '',
    status:    root.querySelector('#bl-status')?.value || '',
    priority:  root.querySelector('#bl-priority')?.value || '',
    today:     root.querySelector('#bl-today')?.dataset.active === 'true',
    overdue:   root.querySelector('#bl-overdue')?.dataset.active === 'true',
  };
}

function refreshBacklog(root) {
  const f = getBacklogFilters(root);
  const todayStr = new Date().toISOString().split('T')[0];
  let tasks = store.get.allTasks();

  if (f.search) {
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(f.search) ||
      (t.description && t.description.toLowerCase().includes(f.search)) ||
      (t.tags && t.tags.some(tag => tag.toLowerCase().includes(f.search)))
    );
  }
  if (f.projectId) tasks = tasks.filter(t => t.projectId === f.projectId);
  if (f.status)    tasks = tasks.filter(t => t.status === f.status);
  if (f.priority)  tasks = tasks.filter(t => t.priority === f.priority);
  if (f.today)     tasks = tasks.filter(t => t.dueDate === todayStr);
  if (f.overdue)   tasks = tasks.filter(t => t.dueDate && t.dueDate < todayStr && t.status !== 'Terminado' && t.status !== 'Archivado');

  root.querySelector('#backlog-table-wrap').innerHTML = renderBacklogTable(tasks);
  feather.replace();
  bindInlineStatus(root);
  bindTaskCheckboxes(root);
  _bindBulkActions(root);
}

function renderBacklogTable(tasks) {
  if (!tasks.length) return emptyState('inbox', 'No hay tareas que coincidan con los filtros.');
  return `
    <table class="list-table">
      <thead>
        <tr>
          <th style="width:28px;padding:6px 4px;">
            <input type="checkbox" id="bl-select-all" title="Seleccionar todas" style="cursor:pointer;">
          </th>
          <th style="width:32px;"></th>
          <th>Título</th>
          <th>Proyecto</th>
          <th>Estado</th>
          <th>Prioridad</th>
          <th>Tipo</th>
          <th>Fecha límite</th>
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
  return `
    <tr data-task-id="${t.id}">
      <td style="padding:6px 4px;">
        <input type="checkbox" class="bl-row-check" data-id="${t.id}" style="cursor:pointer;">
      </td>
      <td>
        <div class="task-checkbox ${isDone ? 'checked' : ''}" data-id="${t.id}" style="margin:0 auto;"></div>
      </td>
      <td>
        <span class="task-title ${isDone ? 'done' : ''}">${esc(t.title)}</span>
        ${t.tags && t.tags.length ? `
          <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">
            ${t.tags.map(tag => `<span class="badge badge-neutral" style="font-size:0.6rem; padding:1px 5px; opacity:0.7;">${esc(tag)}</span>`).join('')}
          </div>
        ` : ''}
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
    </tr>`;
}

function bindInlineStatus(root) {
  root.querySelectorAll('.inline-status-select').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const tr = sel.closest('tr');
      const taskId = tr.dataset.taskId;
      await store.dispatch('UPDATE_TASK', { id: taskId, status: e.target.value });
      refreshBacklog(root);
    });
  });

  // Open modal on row click (excluding interactive elements)
  root.querySelectorAll('table.list-table tbody tr').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.task-checkbox') ||
          e.target.closest('.inline-status-select') ||
          e.target.closest('.bl-row-check')) return;

      const taskId = row.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === taskId);
      if (task) openTaskModal(task);
    });
  });
}
