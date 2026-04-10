import { RoleManager } from '../scripts/roles.js';
import { getCurrentWorkspaceUser, esc, statusBadge, fmtDate, isTaskAssignedToCurrentUser, safeExternalUrl } from '../utils.js';
import { store } from '../store.js';
import { openTaskModal, openTaskDetail } from '../modals.js';

/**
 * views/backlog.js — Backlog view
 */

const PRIORITIES = ['alta', 'media', 'baja'];
const BACKLOG_STATUSES = window.STATUSES || ['Capturado', 'Definido', 'En preparación', 'En elaboración', 'En revisión', 'En espera', 'Terminado', 'Archivado'];

function renderBacklog(root) {
  const user = getCurrentWorkspaceUser();
  const role = user.role;
  const canModify = RoleManager.can('ADD_TASK', role);

  root.innerHTML = `
    <div class="view-inner glass-panel" style="margin:20px; border-radius:var(--radius-lg); padding:24px; min-height:calc(100vh - 120px); border:1px solid var(--surface-glass-border);">
      <div class="view-header" style="margin-bottom:32px;">
        <div class="view-header-text">
          <h1 style="font-size:2.2rem; font-weight:800; letter-spacing:-0.04em;">Backlog</h1>
          <p class="view-subtitle" style="font-size:1.05rem; opacity:0.8;">Captura y priorización de todo el trabajo pendiente.</p>
        </div>
        <div class="view-actions">
          ${canModify ? `<button class="btn btn-primary playful-pop" id="backlog-new-btn" style="background:var(--accent-vibrant); border:none; box-shadow:var(--glow-primary);"><i data-feather="plus"></i> Nueva tarea</button>` : ''}
        </div>
      </div>

      <div class="filter-bar glass-panel" id="backlog-filters" style="background:var(--bg-surface-2); padding:12px 20px; border-radius:var(--radius-md); margin-bottom:24px; display:flex; align-items:center; gap:16px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <i data-feather="filter" style="width:16px; color:var(--text-muted);"></i>
          <select class="filter-select" id="bl-proj" style="background:transparent; border:none; color:var(--text-primary); cursor:pointer;">
            <option value="">Todos los proyectos</option>
            ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <span id="backlog-drive-link-container"></span>
        <select class="filter-select" id="bl-status" style="background:transparent; border:none; color:var(--text-primary); cursor:pointer;">
          <option value="">Todos los estados</option>
          ${BACKLOG_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select class="filter-select" id="bl-priority" style="background:transparent; border:none; color:var(--text-primary); cursor:pointer;">
          <option value="">Todas las prioridades</option>
          ${PRIORITIES.map(p => `<option value="${p}">${p.charAt(0).toUpperCase() + p.slice(1)}</option>`).join('')}
        </select>
      </div>

      <div id="backlog-table-wrap" style="overflow-x:auto;">
        ${renderBacklogTable(store.get.allTasks(), role)}
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
  const user = getCurrentWorkspaceUser();
  const f = getBacklogFilters(root);
  let tasks = store.get.allTasks();
  if (f.projectId) tasks = tasks.filter(t => t.projectId === f.projectId);
  if (f.status) tasks = tasks.filter(t => t.status === f.status);
  if (f.priority) tasks = tasks.filter(t => t.priority === f.priority);
  root.querySelector('#backlog-table-wrap').innerHTML = renderBacklogTable(tasks, user.role);
  feather.replace();
  bindInlineStatus(root);
}

function renderBacklogTable(tasks, role) {
  const canModify = RoleManager.can('ADD_TASK', role);
  
  return `
    <table class="notion-table" style="width:100%; border-collapse:separate; border-spacing:0 4px;">
      <thead>
        <tr style="background:var(--accent-vibrant); color:white;">
          <th style="width:48px; border-radius:12px 0 0 12px; padding:12px;"></th>
          <th style="padding:12px;">Título</th>
          <th>Proyecto</th>
          <th>Estado</th>
          <th>Asignado</th>
          <th>Prioridad</th>
          <th>Tipo</th>
          <th>Fecha límite</th>
          <th style="width:48px; border-radius:0 12px 12px 0;"></th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map(t => backlogRow(t, role)).join('')}
        ${canModify ? `
          <tr class="quick-add-row" style="background:var(--bg-surface-2); border-radius:12px; transition:all 0.2s;">
            <td></td>
            <td colspan="7" style="padding:12px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:24px; height:24px; background:var(--bg-surface-hover); border-radius:50%; display:flex; align-items:center; justify-content:center;">
                  <i data-feather="plus" style="width:14px; height:14px; color:var(--accent-primary);"></i>
                </div>
                <input type="text" id="quick-add-input" placeholder="Añadir nueva tarea rápidamente..." style="background:transparent; border:none; color:var(--text-primary); outline:none; font-size:0.95rem; width:100%; font-weight:500;">
              </div>
            </td>
            <td></td>
          </tr>
        ` : ''}
      </tbody>
    </table>
    ${tasks.length === 0 ? `
      <div class="backlog-empty" style="text-align:center; padding:40px; color:var(--text-muted); opacity:0.5;">
        <p>No hay tareas que coincidan con los filtros. ¡Añade una arriba!</p>
      </div>
    ` : ''}
  `;
}

function backlogRow(t, role) {
  const canModify = RoleManager.can('UPDATE_TASK', role);
  const canDelete = RoleManager.can('DELETE_MEMBER', role); // Re-using delete member permission level or similar
  const proj = store.get.projectById(t.projectId);
  const isDone = t.status === 'Terminado' || t.status === 'Archivado';
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && !isDone;
  const ownershipLabel = isTaskAssignedToCurrentUser(t) ? 'Mía' : 'Equipo';
  const ownershipStyle = isTaskAssignedToCurrentUser(t)
    ? 'background:var(--accent-success-bg); color:var(--accent-success); border:1px solid rgba(34,197,94,0.2);'
    : 'background:var(--accent-info-bg); color:var(--accent-info); border:1px solid rgba(56,189,248,0.2);';
  
  return `
    <tr data-task-id="${t.id}" style="background:var(--bg-surface-2); transition:transform 0.2s, background 0.2s;" class="playful-pop">
      <td style="padding:16px; border-radius:12px 0 0 12px;">
        <div class="task-checkbox ${isDone ? 'checked' : ''}" data-id="${t.id}" style="margin:0 auto; width:22px; height:22px; border-radius:8px;"></div>
      </td>
      <td style="max-width: 300px;">
        <div style="display:flex; align-items:center;">
            <span class="task-title ${isDone ? 'done' : ''}" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">${esc(t.title)}</span>
            <button class="hover-open-btn" data-open="${t.id}">⤢ Abrir</button>
        </div>
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
        ${canModify ? `
          <select class="notion-pill-select inline-status-select" data-task-id="${t.id}" style="padding:4px 10px; background:var(--bg-surface-hover); border-radius:8px; border:none; font-size:0.8rem; font-weight:600; color:var(--text-primary);">
            ${BACKLOG_STATUSES.map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        ` : statusBadge(t.status)}
      </td>
      <td>
        ${t.assigneeId ? `<span class="badge badge-neutral" style="font-size:0.68rem; background:var(--bg-surface-2);">${esc(store.get.memberById(t.assigneeId)?.name || '—')}</span>` : '<span style="color:var(--text-muted); font-size:0.7rem;">—</span>'}
        <span style="display:inline-block; margin-left:6px; padding:1px 7px; border-radius:999px; font-size:0.62rem; font-weight:700; ${ownershipStyle}">${ownershipLabel}</span>
      </td>
      <td>
        ${canModify ? `
          <select class="notion-pill-select inline-priority-select" data-task-id="${t.id}" style="text-transform:capitalize; padding:4px 10px; background:var(--bg-surface-hover); border-radius:8px; border:none; font-size:0.8rem; font-weight:600;">
            ${PRIORITIES.map(p => `<option value="${p}" ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        ` : `<span class="badge badge-neutral" style="text-transform:capitalize;">${esc(t.priority || 'media')}</span>`}
      </td>
      <td><span class="badge badge-neutral" style="font-size:0.68rem;">${esc(t.type || 'tarea')}</span></td>
      <td style="font-size:0.78rem; ${isOverdue ? 'color:var(--accent-danger);font-weight:600;' : 'color:var(--text-muted);'}">
        ${t.dueDate ? fmtDate(t.dueDate) : '—'}
      </td>
      <td style="padding-right:16px; border-radius:0 12px 12px 0;">
        ${canDelete ? `
          <button class="btn btn-icon btn-sm task-quick-delete" data-id="${t.id}" title="Eliminar" style="color:var(--accent-danger); opacity:0.3; transition:opacity 0.2s;"><i data-feather="trash-2" style="width:16px;height:16px;"></i></button>
        ` : ''}
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

  root.querySelectorAll('.inline-priority-select').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const tr = sel.closest('tr');
      const taskId = tr.dataset.taskId;
      await store.dispatch('UPDATE_TASK', { id: taskId, priority: e.target.value });
      refreshBacklog(root);
    });
  });

  // Open button explicitly wired
  root.querySelectorAll('.hover-open-btn').forEach(btn => {
      btn.addEventListener('click', e => {
          e.stopPropagation();
          const taskId = btn.dataset.open;
          const task = store.get.allTasks().find(t => t.id === taskId);
          if (task) openTaskDetail(task);
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
        refreshBacklog(root);
        setTimeout(() => root.querySelector('#quick-add-input')?.focus(), 100);
      }
    });
  }

  // Row click functionality (mimic generic "open" when clicking empty space)
  root.querySelectorAll('.notion-table tbody tr').forEach(row => {
    if (row.classList.contains('quick-add-row')) return;
    row.addEventListener('click', e => {
      if (e.target.closest('.task-checkbox') || e.target.closest('.notion-pill-select') || e.target.closest('.task-quick-delete') || e.target.closest('.hover-open-btn')) return;

      const taskId = row.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === taskId);
      if (task) openTaskDetail(task);
    });
  });
}

window.renderBacklog = renderBacklog;
