/**
 * views/board.js — Kanban board view
 */

const BOARD_STATUSES = [
  { id: 'Capturado', color: '#64748b' },
  { id: 'Definido', color: '#3b82f6' },
  { id: 'En preparación', color: '#8b5cf6' },
  { id: 'En elaboración', color: '#f59e0b' },
  { id: 'En revisión', color: '#06b6d4' },
  { id: 'En espera', color: '#ef4444' },
  { id: 'Terminado', color: '#22c55e' },
  { id: 'Archivado', color: '#4b5563' },
];

let _dragTaskId = null;
let _dragSourceStatus = null;

function renderBoard(root) {
  root.innerHTML = `
    <div class="view-inner" style="padding-bottom:0;">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Tablero</h1>
          <p class="view-subtitle">Vista Kanban por estado del trabajo.</p>
        </div>
        <div class="view-actions">
          <select class="filter-select" id="board-proj-filter">
            <option value="">Todos los proyectos</option>
            ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <span id="board-drive-link-container"></span>
          <button class="btn btn-primary" id="board-new-btn"><i data-feather="plus"></i> Nueva tarea</button>
        </div>
      </div>
    </div>
    <div class="board-container" id="board-columns" style="padding: 0 36px 24px;"></div>`;

  feather.replace();
  renderBoardColumns(root, '');

  root.querySelector('#board-proj-filter').addEventListener('change', e => {
    const pid = e.target.value;
    const p = store.get.projectById(pid);
    const linkWrap = root.querySelector('#board-drive-link-container');
    if (p && p.driveUrl) {
      linkWrap.innerHTML = `<a href="${esc(p.driveUrl)}" target="_blank" class="btn btn-icon btn-secondary" title="Abrir Google Drive" style="margin:0 8px;"><i data-feather="external-link"></i></a>`;
      feather.replace();
    } else {
      linkWrap.innerHTML = '';
    }
    renderBoardColumns(root, pid);
  });
  root.querySelector('#board-new-btn').addEventListener('click', () => openTaskModal());
}

function renderBoardColumns(root, projectId) {
  const container = root.querySelector('#board-columns') || document.getElementById('board-columns');
  let tasks = store.get.allTasks();
  if (projectId) tasks = tasks.filter(t => t.projectId === projectId);

  container.innerHTML = BOARD_STATUSES.map(col => {
    const colTasks = tasks.filter(t => t.status === col.id);
    return `
      <div class="board-column" data-status="${col.id}">
        <div class="board-column-header">
          <span class="board-status-dot" style="width:8px;height:8px;border-radius:50%;background:${col.color};flex-shrink:0;"></span>
          <span class="board-column-title">${col.id}</span>
          <span class="board-column-count">${colTasks.length}</span>
        </div>
        <div class="board-cards" data-status="${col.id}">
          ${colTasks.map(t => kanbanCard(t)).join('')}
        </div>
        <div class="board-add-btn" data-status="${col.id}">
          <i data-feather="plus"></i> Añadir
        </div>
      </div>`;
  }).join('');

  feather.replace();
  bindDragDrop(container);

  container.querySelectorAll('.board-add-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(null, btn.dataset.status));
  });
}

function kanbanCard(t) {
  const proj = store.get.projectById(t.projectId);
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'Terminado';
  return `
    <div class="kanban-card" draggable="true" data-task-id="${t.id}" data-status="${t.status}">
      ${proj ? `<div style="font-size:0.68rem;display:flex;align-items:center;gap:4px;color:${proj.color || 'var(--accent-primary)'};">
        <span style="width:5px;height:5px;border-radius:50%;background:currentColor;"></span>${esc(proj.name)}
      </div>` : ''}
      <div class="kanban-card-title">${esc(t.title)}</div>
      <div class="kanban-card-foot">
        <div class="kanban-card-date ${isOverdue ? 'overdue' : ''}">
          ${t.dueDate ? `<i data-feather="calendar"></i>${fmtDate(t.dueDate)}` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          ${t.assigneeId ? `<div class="member-avatar-xs" title="${esc(store.get.memberById(t.assigneeId)?.name)}" style="width:18px;height:18px;font-size:0.6rem;background:var(--accent-primary);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;">${(store.get.memberById(t.assigneeId)?.avatar || '?')}</div>` : ''}
          <span class="priority-pip ${t.priority || 'baja'}"></span>
          <button class="btn btn-icon btn-sm task-quick-delete" data-id="${t.id}" title="Eliminar" style="padding:2px; margin-left:4px; opacity:0; transition:opacity 0.2s; color:var(--text-muted);"><i data-feather="trash-2" style="width:12px;height:12px;"></i></button>
        </div>
      </div>
    </div>`;
}

function bindDragDrop(container) {
  container.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      const btn = card.querySelector('.task-quick-delete');
      if (btn) btn.style.opacity = '1';
    });
    card.addEventListener('mouseleave', () => {
      const btn = card.querySelector('.task-quick-delete');
      if (btn) btn.style.opacity = '0';
    });

    card.addEventListener('click', async e => {
      // Don't open if dragging
      if (card.classList.contains('dragging')) return;

      if (e.target.closest('.task-quick-delete')) {
        const taskId = card.dataset.taskId;
        const task = store.get.allTasks().find(t => t.id === taskId);
        if (task && confirm(`¿Eliminar la tarea "${task.title}"?`)) {
          await store.dispatch('DELETE_TASK', { id: taskId });
          const projFilter = document.getElementById('board-proj-filter');
          renderBoardColumns(document.getElementById('board-view'), projFilter?.value || '');
        }
        return;
      }

      const tId = card.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === tId);
      if (task) openTaskModal(task);
    });

    card.addEventListener('dragstart', e => {
      _dragTaskId = card.dataset.taskId;
      _dragSourceStatus = card.dataset.status;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      container.querySelectorAll('.board-cards').forEach(c => c.classList.remove('drag-over'));
    });
  });

  container.querySelectorAll('.board-cards').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const newStatus = col.dataset.status;
      if (_dragTaskId && newStatus !== _dragSourceStatus) {
        await store.dispatch('UPDATE_TASK', { id: _dragTaskId, status: newStatus });
        // Re-render board columns with same filter
        const projFilter = container.closest('.content-view') || document;
        const selVal = (projFilter.querySelector ? projFilter.querySelector('#board-proj-filter')?.value : '') || '';
        renderBoardColumns({ querySelector: s => document.querySelector(s), querySelectorAll: s => document.querySelectorAll(s) }, selVal);
        const boardCols = document.getElementById('board-columns');
        if (boardCols) {
          // Re-render inline
          const tasks = selVal ? store.get.allTasks().filter(t => t.projectId === selVal) : store.get.allTasks();
          boardCols.querySelectorAll('.board-cards').forEach(col => {
            const colStatus = col.dataset.status;
            const colTasks = tasks.filter(t => t.status === colStatus);
            col.innerHTML = colTasks.map(t => kanbanCard(t)).join('');
            col.closest('.board-column').querySelector('.board-column-count').textContent = colTasks.length;
          });
          feather.replace();
          bindDragDrop(boardCols);
        }
      }
      _dragTaskId = null;
    });
  });
}

window.renderBoard = renderBoard;
