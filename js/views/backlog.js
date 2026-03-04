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
      </div>

      <div id="backlog-table-wrap">
        ${renderBacklogTable(store.get.allTasks())}
      </div>
    </div>`;

  feather.replace();
  bindInlineStatus(root);
  bindTaskCheckboxes(root);

  root.querySelector('#backlog-new-btn').addEventListener('click', () => openTaskModal());
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
  if (!tasks.length) return emptyState('inbox', 'El backlog está vacío.');
  return `
    <table class="list-table">
      <thead>
        <tr>
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
    sel.addEventListener('change', async () => {
      const id = sel.dataset.taskId;
      await store.dispatch('UPDATE_TASK', { id, status: sel.value });
    });
  });
}
