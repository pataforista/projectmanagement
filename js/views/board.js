import { RoleManager } from '../scripts/roles.js';
import { getCurrentWorkspaceUser, esc, statusBadge, fmtDate, isTaskAssignedToCurrentUser, safeExternalUrl } from '../utils.js';
import { store } from '../store.js';
import { openTaskModal, openTaskDetail } from '../modals.js';

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
  const user = getCurrentWorkspaceUser();
  const role = user.role;
  const canAdd = RoleManager.can('ADD_TASK', role);

  root.innerHTML = `
    <div class="view-inner glass-panel" style="margin:20px; border-radius:var(--radius-lg); padding:24px; min-height:calc(100vh - 120px); border:1px solid var(--surface-glass-border);">
      <div class="view-header" style="margin-bottom:32px;">
        <div class="view-header-text">
          <h1 style="font-size:2.2rem; font-weight:800; letter-spacing:-0.04em;">Tablero</h1>
          <p class="view-subtitle" style="font-size:1.05rem; opacity:0.8;">Vista Kanban por estado del trabajo clínico.</p>
        </div>
        <div class="view-actions" style="gap:16px;">
          <select class="filter-select glass-panel" id="board-proj-filter" style="background:var(--bg-surface-2); border-radius:var(--radius-sm); padding:8px 12px; border:1px solid var(--border-color); color:var(--text-primary);">
            <option value="">Todos los proyectos</option>
            ${store.get.projects().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
          </select>
          <span id="board-drive-link-container"></span>
          ${canAdd ? `<button class="btn btn-primary playful-pop" id="board-new-btn" style="background:var(--accent-vibrant); border:none; box-shadow:var(--glow-primary);"><i data-feather="plus"></i> Nueva tarea</button>` : ''}
        </div>
      </div>
      <div class="board-container" id="board-columns" style="display:flex; overflow-x:auto; gap:20px; padding-bottom:12px; height: calc(100% - 120px);"></div>
    </div>`;

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
  const user = getCurrentWorkspaceUser();
  const role = user.role;
  const canModify = RoleManager.can('ADD_TASK', role);
  
  const container = root.querySelector('#board-columns') || document.getElementById('board-columns');
  let tasks = store.get.allTasks();
  if (projectId) tasks = tasks.filter(t => t.projectId === projectId);

  container.innerHTML = BOARD_STATUSES.map(col => {
    const colTasks = tasks.filter(t => t.status === col.id);
    return `
      <div class="board-column glass-panel" data-status="${col.id}" style="min-width:300px; background:rgba(255,255,255,0.01); border-radius:var(--radius-md); display:flex; flex-direction:column; border:1px solid var(--border-color);">
        <div class="board-column-header" style="padding:16px; border-bottom:1px solid var(--border-color); background:rgba(0,0,0,0.1); border-radius:var(--radius-md) var(--radius-md) 0 0;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="board-status-dot" style="width:10px;height:10px;border-radius:50%;background:${col.color}; box-shadow:0 0 8px ${col.color}80;"></span>
            <span class="board-column-title" style="font-weight:700; font-size:0.95rem; letter-spacing:0.01em;">${col.id.toUpperCase()}</span>
            <span class="board-column-count" style="margin-left:auto; background:var(--bg-surface-hover); padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:700; color:var(--text-muted);">${colTasks.length}</span>
          </div>
        </div>
        <div class="board-cards" data-status="${col.id}" style="flex:1; padding:12px; display:flex; flex-direction:column; gap:12px; min-height:100px;">
          ${colTasks.map(t => kanbanCard(t, role)).join('')}
        </div>
        ${canModify ? `
          <div class="board-add-btn playful-pop" data-status="${col.id}" style="margin:12px; padding:10px; border-radius:12px; border:1px dashed var(--border-color); text-align:center; color:var(--text-muted); cursor:pointer; font-size:0.85rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;">
            <i data-feather="plus" style="width:14px;"></i> Añadir Tarea
          </div>
        ` : ''}
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
function kanbanCard(t, role) {
  const canModify = RoleManager.can('UPDATE_TASK', role);
  const canDelete = RoleManager.can('DELETE_MEMBER', role); // Re-using delete member permission level
  const proj = store.get.projectById(t.projectId);
  const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'Terminado';
  const ownershipLabel = isTaskAssignedToCurrentUser(t) ? 'Mía' : 'Equipo';

  return `
    <div class="kanban-card glass-panel playful-pop" data-task-id="${t.id}" data-status="${t.status}" draggable="${canModify}" style="background:var(--bg-surface-2); border-radius:16px; padding:16px; border:1px solid var(--border-color); cursor:pointer; position:relative; overflow:hidden;">
      <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:${proj ? (proj.color || 'var(--accent-primary)') : 'transparent'}; opacity:0.8;"></div>
      
      <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:12px;">
        ${proj ? `
          <div class="kanban-card-project" style="color:var(--text-muted); font-size:0.75rem; font-weight:700; text-transform:uppercase; letter-spacing:0.02em; display:flex; align-items:center; gap:6px;">
            <span class="project-dot" style="width:6px; height:6px; background:${proj.color || 'var(--accent-primary)'}; border-radius:50%;"></span>
            ${esc(proj.name)}
          </div>` : '<div></div>'}
          
        <div class="card-pills" style="display:flex; gap:6px;">
          <span style="font-size:0.6rem; padding:2px 8px; border-radius:8px; font-weight:800; text-transform:uppercase; ${ownershipLabel === 'Mía' ? 'background:var(--accent-success-bg); color:var(--accent-success);' : 'background:var(--accent-info-bg); color:var(--accent-info);'}">
            ${ownershipLabel}
          </span>
          <span class="priority-pip ${t.priority || 'media'}" style="width:8px; height:8px; border-radius:50%; margin-top:4px;"></span>
        </div>
      </div>

      <div class="kanban-card-title" style="font-weight:700; line-height:1.2; margin-bottom:16px; font-size:0.95rem; color:var(--text-primary);">${esc(t.title)}</div>

      <div class="kanban-card-foot" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="kanban-card-date ${isOverdue ? 'overdue' : ''}" style="display:flex; align-items:center; gap:6px; font-size:0.75rem; ${isOverdue ? 'color:var(--accent-danger); font-weight:700;' : 'color:var(--text-muted);'}">
          ${t.dueDate ? `<i data-feather="calendar" style="width:14px; height:14px;"></i> <span>${fmtDate(t.dueDate)}</span>` : ''}
        </div>
        
        <div class="kanban-card-meta" style="display:flex; align-items:center; gap:8px;">
          ${t.assigneeId ? `
            <div class="member-avatar-xs" style="width:24px; height:24px; border-radius:50%; border:1px solid var(--border-color); overflow:hidden;" title="${esc(store.get.memberById(t.assigneeId)?.name)}">
              ${esc(store.get.memberById(t.assigneeId)?.avatar || '?')}
            </div>` : ''}
          ${canDelete ? `
            <button class="btn btn-icon btn-sm task-quick-delete" data-id="${t.id}" title="Eliminar" style="color:var(--accent-danger); opacity:0; transition:opacity 0.2s;">
              <i data-feather="trash-2" style="width:14px; height:14px;"></i>
            </button>
          ` : ''}
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
      
      const user = getCurrentWorkspaceUser();
      if (!RoleManager.can('UPDATE_TASK', user.role)) {
          showToast('No tienes permisos para mover tareas.', 'error');
          return;
      }

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
