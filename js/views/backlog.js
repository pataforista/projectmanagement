/**
 * views/backlog.js — Backlog view
 */

const PRIORITIES = ['alta', 'media', 'baja'];
const BACKLOG_STATUSES = window.STATUSES || ['Capturado', 'Definido', 'En preparación', 'En elaboración', 'En revisión', 'En espera', 'Terminado', 'Archivado'];

function renderBacklog(root) {
  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Backlog</h1>
          <p class="view-subtitle">Captura y priorización de todo el trabajo pendiente.</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="backlog-new-btn"><i data-feather="plus"></i> Nueva tarea</button>
        </div>
      </div>

      <div class="filter-bar" id="backlog-filters">
        <select class="filter-select" id="bl-proj">
          <option value="">Todos los proyectos</option>
          ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
        <span id="backlog-drive-link-container"></span>
        <select class="filter-select" id="bl-status">
          <option value="">Todos los estados</option>
          ${BACKLOG_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select class="filter-select" id="bl-priority">
          <option value="">Todas las prioridades</option>
          ${PRIORITIES.map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
        </select>
      </div>

      <div id="backlog-table-wrap">
        ${renderBacklogTable(store.get.allTasks())}
      </div>
    </div>`;

  feather.replace();
  bindInlineStatus(root);
  bindTaskCheckboxes(root);

  root.querySelector('#backlog-new-btn').addEventListener('click', () => openTaskModal());
  root.querySelector('#bl-proj')?.addEventListener('change', e => {
    const pid = e.target.value;
    const p = store.get.projectById(pid);
    const linkWrap = root.querySelector('#backlog-drive-link-container');
    if (p && p.driveUrl) {
      linkWrap.innerHTML = `<a href="${esc(safeExternalUrl(p.driveUrl))}" target="_blank" rel="noopener noreferrer" class="btn btn-icon btn-secondary" title="Abrir Google Drive" style="margin:0 8px;"><i data-feather="external-link"></i></a>`;
      feather.replace();
    } else {
      linkWrap.innerHTML = '';
    }
    refreshBacklog(root);
  });
  ['bl-status', 'bl-priority'].forEach(id => {
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

function refreshBacklog(root) {
  const f = getBacklogFilters(root);
  let tasks = store.get.allTasks();
  if (f.projectId) tasks = tasks.filter(t => t.projectId === f.projectId);
  if (f.status) tasks = tasks.filter(t => t.status === f.status);
  if (f.priority) tasks = tasks.filter(t => t.priority === f.priority);
  root.querySelector('#backlog-table-wrap').innerHTML = renderBacklogTable(tasks);
  feather.replace();
  bindInlineStatus(root);
}

function renderBacklogTable(tasks) {
  return `
    <table class="list-table">
      <thead>
        <tr>
          <th style="width:32px;"></th>
          <th>Título</th>
          <th>Proyecto</th>
          <th>Estado</th>
          <th>Asignado</th>
          <th>Prioridad</th>
          <th>Tipo</th>
          <th>Fecha límite</th>
          <th style="width:32px;"></th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(t => backlogRow(t)).join('')}
        <tr class="quick-add-row" style="background:var(--bg-surface-2)40;">
          <td></td>
          <td colspan="7">
            <div style="display:flex; align-items:center; gap:8px;">
              <i data-feather="plus" style="width:14px; height:14px; color:var(--accent-primary);"></i>
              <input type="text" id="quick-add-input" placeholder="Añadir tarea rápidamente..." style="background:transparent; border:none; color:var(--text-primary); outline:none; font-size:0.85rem; width:100%; padding:8px 0;">
            </div>
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>
    ${tasks.length === 0 ? `
      <div class="backlog-empty" style="text-align:center; padding:40px; color:var(--text-muted); opacity:0.5;">
        <p>No hay tareas que coincidan con los filtros. ¡Añade una arriba!</p>
      </div>
    ` : ''}
  `;
}

function backlogRow(t) {
  const proj = store.get.projectById(t.projectId);
  const isDone = t.status === 'Terminado' || t.status === 'Archivado';
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && !isDone;
  const ownershipLabel = isTaskAssignedToCurrentUser(t) ? 'Mía' : 'Equipo';
  const ownershipStyle = isTaskAssignedToCurrentUser(t)
    ? 'background:rgba(16,185,129,0.14); color:#86efac;'
    : 'background:rgba(59,130,246,0.14); color:#93c5fd;';
  return `
    <tr data-task-id="${t.id}">
      <td>
        <div class="task-checkbox ${isDone ? 'checked' : ''}" data-id="${t.id}" style="margin:0 auto;"></div>
      </td>
      <td>
        <span class="task-title ${isDone ? 'done' : ''}">${esc(t.title)}</span>
        ${t.tags && t.tags.length ? `
          <div style="display:flex; gap:4px; margin-top:4px;">
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
          ${BACKLOG_STATUSES.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        ${t.assigneeId ? `<span class="badge badge-neutral" style="font-size:0.68rem; background:var(--bg-surface-2);">${esc(store.get.memberById(t.assigneeId)?.name || '—')}</span>` : '<span style="color:var(--text-muted); font-size:0.7rem;">—</span>'}
        <span style="display:inline-block; margin-left:6px; padding:1px 7px; border-radius:999px; font-size:0.62rem; font-weight:700; ${ownershipStyle}">${ownershipLabel}</span>
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
        <button class="btn btn-icon btn-sm task-quick-delete" data-id="${t.id}" title="Eliminar" style="color:var(--text-muted); opacity:0.3; transition:opacity 0.2s;"><i data-feather="trash-2" style="width:14px;height:14px;"></i></button>
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

  root.querySelectorAll('.task-quick-delete').forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.addEventListener('mouseleave', () => btn.style.opacity = '0.3');
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const taskId = btn.dataset.id;
      const task = store.get.allTasks().find(t => t.id === taskId);
      const msg = `¿Eliminar la tarea "${task.title}"?\n\n⚠️ Esto se reflejará en el Google Drive compartido del equipo.`;
      if (task && confirm(msg)) {
        await store.dispatch('DELETE_TASK', { id: taskId });
        refreshBacklog(root);
      }
    });
  });

  // Quick add task
  const quickInput = root.querySelector('#quick-add-input');
  if (quickInput) {
    quickInput.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const title = quickInput.value.trim();
        if (!title) return;
        const currentProjectId = root.querySelector('#bl-proj')?.value || null;
        await store.dispatch('ADD_TASK', { title, projectId: currentProjectId });
        // After add, refresh and refocus? Or just refresh? 
        // For now, refresh and focus back to the new input row (since it will be re-rendered)
        refreshBacklog(root);
        setTimeout(() => root.querySelector('#quick-add-input')?.focus(), 100);
      }
    });
  }

  // Open modal on row click (excluding the status dropdown, checkbox and delete button)
  root.querySelectorAll('table.list-table tbody tr').forEach(row => {
    if (row.classList.contains('quick-add-row')) return;
    row.addEventListener('click', e => {
      if (e.target.closest('.task-checkbox') || e.target.closest('.inline-status-select') || e.target.closest('.task-quick-delete')) return;

      const taskId = row.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === taskId);
      if (task) openTaskDetail(task);

    });
  });
}

window.renderBacklog = renderBacklog;
