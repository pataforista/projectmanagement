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

/**
 * Inicializa y renderiza el cascarón principal de la vista Tablero Kanban.
 * @param {HTMLElement} root - El nodo DOM donde se inyectará la vista.
 */
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
      linkWrap.innerHTML = `<a href="${esc(safeExternalUrl(p.driveUrl))}" target="_blank" rel="noopener noreferrer" class="btn btn-icon btn-secondary" title="Abrir Google Drive" style="margin:0 8px;"><i data-feather="external-link"></i></a>`;
      feather.replace();
    } else {
      linkWrap.innerHTML = '';
    }
    renderBoardColumns(root, pid);
  });
  root.querySelector('#board-new-btn').addEventListener('click', () => openTaskModal());
}

/**
 * Renderiza las columnas del tablero y ubica las tareas según su estado.
 * @param {HTMLElement|Object} root - El nodo contenedor del tablero.
 * @param {string} projectId - Filtro opcional para mostrar solo tareas de un proyecto.
 */
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

/**
 * Crea el HTML individual para una tarjeta arrastrable en el tablero Kanban.
 * @param {Object} t - El objeto de la Tarea.
 * @returns {string} Cadena HTML de la tarjeta.
 */
function kanbanCard(t) {
  const proj = store.get.projectById(t.projectId);
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'Terminado';
  const ownershipLabel = isTaskAssignedToCurrentUser(t) ? 'Mía' : 'Equipo';
  
  return `
    <div class="kanban-card" draggable="true" data-task-id="${t.id}" data-status="${t.status}">
      ${proj ? `
        <div class="kanban-card-project" style="color:${proj.color || 'var(--accent-primary)'};">
          <span class="project-dot" style="background:currentColor;"></span>
          ${esc(proj.name)}
        </div>` : ''}
      
      <div class="kanban-card-title">${esc(t.title)}</div>
      
      <div class="kanban-card-tags">
        <span class="status-pill ${ownershipLabel === 'Mía' ? 'status-terminado' : 'status-definido'}" style="font-size:0.6rem; padding:1px 6px; opacity:0.8;">
          ${ownershipLabel}
        </span>
        <span class="priority-pip ${t.priority || 'baja'}"></span>
      </div>

      <div class="kanban-card-foot">
        <div class="kanban-card-date ${isOverdue ? 'overdue' : ''}">
          ${t.dueDate ? `<i data-feather="calendar"></i>${fmtDate(t.dueDate)}` : ''}
        </div>
        <div class="kanban-card-meta">
          ${t.assigneeId ? `
            <div class="member-avatar-xs" title="${esc(store.get.memberById(t.assigneeId)?.name)}">
              ${esc(store.get.memberById(t.assigneeId)?.avatar || '?')}
            </div>` : ''}
          <button class="btn btn-icon btn-sm task-quick-delete" data-id="${t.id}" title="Eliminar">
            <i data-feather="trash-2"></i>
          </button>
        </div>
      </div>
    </div>`;
}

/**
 * Configura los event listeners para el pipeline de "Drag and Drop"
 * permitiendo mover las tarjetas Kanban entre columnas de estado.
 * @param {HTMLElement} container - El contenedor padre del tablero.
 */
function bindDragDrop(container) {
  container.querySelectorAll('.kanban-card').forEach(card => {
    // Show/hide quick delete on hover (for mouse users)
    card.addEventListener('mouseenter', () => {
      const btn = card.querySelector('.task-quick-delete');
      if (btn) btn.style.opacity = '1';
    });
    card.addEventListener('mouseleave', () => {
      const btn = card.querySelector('.task-quick-delete');
      if (btn) btn.style.opacity = '0';
    });

    // Handle clicks for different actions
    card.addEventListener('click', async e => {
      // Don't open if dragging
      if (card.classList.contains('dragging')) return;

      const taskId = card.dataset.taskId;
      const task = store.get.allTasks().find(t => t.id === taskId);
      if (!task) return;

      // 1. Handle Quick Delete
      if (e.target.closest('.task-quick-delete')) {
        e.stopPropagation();
        if (confirm(`¿Eliminar la tarea "${task.title}"?`)) {
          store.dispatch('DELETE_TASK', taskId);
          showToast('Tarea eliminada');
        }
        return;
      }

      // 2. Handle Status Move (Touch alternative to Drag)
      if (e.target.closest('.task-move-btn')) {
        e.stopPropagation();
        openStatusPicker(task, e.target.closest('.task-move-btn'));
        return;
      }

      // 3. Open full task modal (now detail sidebar)
      openTaskDetail(task);

    });

    // Drag support
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
          boardCols.querySelectorAll('.board-column').forEach(col => {
            const colStatus = col.dataset.status;
            const colTasks = tasks.filter(t => t.status === colStatus);
            const cardsContainer = col.querySelector('.board-cards');
            if (cardsContainer) cardsContainer.innerHTML = colTasks.map(t => kanbanCard(t)).join('');
            const countEl = col.querySelector('.board-column-count');
            if (countEl) countEl.textContent = colTasks.length;
          });
          feather.replace();
          bindDragDrop(boardCols);
        }
      }
      _dragTaskId = null;
    });
  });
}

/**
 * Abre un selector de estado compacto para mover tareas en dispositivos táctiles.
 * @param {Object} task - La tarea a mover.
 * @param {HTMLElement} anchor - El botón que disparó el selector.
 */
function openStatusPicker(task, anchor) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.background = 'transparent';
  overlay.style.zIndex = '1000';

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'status-picker-menu';
  menu.style.cssText = `
    position: fixed;
    top: ${Math.min(rect.bottom + 5, window.innerHeight - 300)}px;
    left: ${Math.max(10, Math.min(rect.left, window.innerWidth - 170))}px;
    background: var(--bg-surface-2);
    border: 1px solid var(--border-highlight);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xl);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 1001;
    min-width: 160px;
    animation: fadeIn var(--dur-fast) ease;
  `;

  menu.innerHTML = `
    <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); padding:4px 8px; margin-bottom:4px; border-bottom:1px solid var(--border-color);">MOVER A...</div>
    ${BOARD_STATUSES.map(s => `
      <button class="status-opt-btn" data-id="${s.id}" style="
        display:flex; align-items:center; gap:8px; padding:6px 8px; border:none; background:none; color:var(--text-secondary); cursor:pointer; font-size:0.8rem; border-radius:4px; transition:background 0.2s;
        ${task.status === s.id ? 'background:rgba(94,106,210, 0.1); color:var(--accent-primary); font-weight:600;' : ''}
      ">
        <span style="width:8px; height:8px; border-radius:50%; background:${s.color};"></span>
        ${s.id}
      </button>
    `).join('')}
  `;

  overlay.appendChild(menu);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => overlay.remove());
  menu.querySelectorAll('.status-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newStatus = btn.dataset.id;
      if (newStatus !== task.status) {
        store.dispatch('UPDATE_TASK', { id: task.id, status: newStatus });
        showToast(`Tarea movida a ${newStatus}`);
        // Refresh board
        const projFilter = document.getElementById('board-proj-filter');
        renderBoardColumns(document.getElementById('app-root'), projFilter?.value || '');
      }
      overlay.remove();
    });
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--bg-surface-hover)');
    btn.addEventListener('mouseleave', () => {
      if (task.status !== btn.dataset.id) btn.style.background = 'none';
      else btn.style.background = 'rgba(94,106,210, 0.1)';
    });
  });
}

window.renderBoard = renderBoard;
