/**
 * app.js — Workspace de Producción SPA
 * Views: Dashboard · Backlog · Board · Projects · Cycles · Decisions
 */

// ── Utilities ──────────────────────────────────────────────────────────────

const generateId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

function isOverdue(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr + 'T23:59:59') < new Date();
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function offsetDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function waitForDB(timeout = 6000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (window.dbReady) return resolve();
            if (Date.now() - start > timeout) return reject(new Error('DB timeout'));
            setTimeout(check, 50);
        };
        check();
    });
}

// ── Domain constants ────────────────────────────────────────────────────────

const STATUS_LABELS = {
    backlog:     'Backlog',
    todo:        'Definido',
    in_progress: 'En elaboración',
    in_review:   'En revisión',
    blocked:     'Bloqueada',
    done:        'Terminado'
};

const STATUS_BADGES = {
    backlog:     '<span class="badge badge-secondary">Backlog</span>',
    todo:        '<span class="badge badge-secondary">Definido</span>',
    in_progress: '<span class="badge badge-warning">En elaboración</span>',
    in_review:   '<span class="badge badge-info">En preparación</span>',
    blocked:     '<span class="badge badge-danger">Bloqueada</span>',
    done:        '<span class="badge badge-success">Terminado</span>'
};

const PRIORITY_LABELS = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' };
const PRIORITY_CLASS  = { urgent: 'p-urgent', high: 'p-high', medium: 'p-medium', low: 'p-low' };

const TYPE_LABELS = { task: 'Tarea', deliverable: 'Entregable', milestone: 'Hito', idea: 'Idea' };

const BOARD_COLUMNS = [
    { status: 'backlog',     label: 'Backlog',         cls: 'col-backlog'  },
    { status: 'todo',        label: 'Definido',        cls: 'col-todo'     },
    { status: 'in_progress', label: 'En elaboración',  cls: 'col-progress' },
    { status: 'in_review',   label: 'En revisión',     cls: 'col-review'   },
    { status: 'blocked',     label: 'Bloqueada',       cls: 'col-blocked'  },
    { status: 'done',        label: 'Terminado',       cls: 'col-done'     },
];

// ── App state ───────────────────────────────────────────────────────────────

let currentView = 'dashboard';

// ── View registry ───────────────────────────────────────────────────────────

const views = {
    dashboard: {
        title: 'Dashboard',
        subtitle: 'Resumen de tu actividad y próximos entregables.',
        render: renderDashboard
    },
    backlog: {
        title: 'Backlog',
        subtitle: 'Todo el trabajo capturado, ordenado y priorizado.',
        render: renderBacklog
    },
    board: {
        title: 'Tablero',
        subtitle: 'Vista kanban del flujo de trabajo activo.',
        render: renderBoard
    },
    projects: {
        title: 'Proyectos',
        subtitle: 'Gestión de proyectos activos y archivados.',
        render: renderProjects
    },
    cycles: {
        title: 'Ciclos',
        subtitle: 'Planificación temporal y timeboxing.',
        render: renderCycles
    },
    decisions: {
        title: 'Decisiones',
        subtitle: 'Registro de decisiones clave y su contexto.',
        render: renderDecisions
    }
};

// ── Router ──────────────────────────────────────────────────────────────────

async function navigate(viewName) {
    if (!views[viewName]) return;
    currentView = viewName;

    document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(el => {
        el.classList.toggle('active', el.dataset.view === viewName);
    });

    const v = views[viewName];
    const bc = document.querySelector('.breadcrumbs .current');
    const h1 = document.querySelector('.view-header h1');
    const sub = document.querySelector('.view-header .subtitle');
    if (bc)  bc.textContent  = v.title;
    if (h1)  h1.textContent  = v.title;
    if (sub) sub.textContent = v.subtitle;

    const container = document.getElementById('view-content');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
    await v.render(container);
}

// ── Shared renderers ────────────────────────────────────────────────────────

function priorityDot(priority) {
    const cls = PRIORITY_CLASS[priority] || 'p-low';
    const lbl = PRIORITY_LABELS[priority] || priority;
    return `<span class="priority-dot ${cls}" title="${lbl}"></span>`;
}

function renderTaskHTML(task) {
    const isDone = task.status === 'done';
    const overdue = !isDone && isOverdue(task.dueDate);
    return `
        <li class="task-item${isDone ? ' completed' : ''}" data-task-id="${task.id}">
            <div class="task-checkbox${isDone ? ' checked' : ''}"
                 data-action="toggle-task" data-task-id="${task.id}"
                 title="${isDone ? 'Reabrir' : 'Marcar completada'}"></div>
            <div class="task-details">
                <span class="task-title">${escapeHtml(task.title)}</span>
                ${task.dueDate
                    ? `<span class="task-meta${overdue ? ' overdue' : ''}">
                           <i data-feather="calendar"></i>${formatDate(task.dueDate)}
                       </span>`
                    : ''}
            </div>
            ${priorityDot(task.priority)}
            ${STATUS_BADGES[task.status] || ''}
        </li>`;
}

function renderCycleProgressHTML(cycle) {
    const start = new Date(cycle.startDate);
    const end   = new Date(cycle.endDate);
    const now   = new Date();
    const pct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    return `
        <div class="cycle-progress">
            <div class="cycle-info">
                <span class="cycle-name">${escapeHtml(cycle.name)}</span>
                <span class="cycle-days">${daysLeft} día${daysLeft !== 1 ? 's' : ''} rest.</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:${pct}%;"></div>
            </div>
        </div>`;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

async function renderDashboard(container) {
    const [tasks, cycles] = await Promise.all([
        dbAPI.getAll('tasks'),
        dbAPI.getAll('cycles')
    ]);

    const activeTasks  = tasks.filter(t => t.status !== 'done');
    const blockedTasks = tasks.filter(t => t.status === 'blocked');
    const activeCycles = cycles.filter(c => c.status === 'active');

    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="card glass-panel col-span-2">
                <div class="card-header">
                    <h3>Mis Tareas Activas <span class="badge badge-info">${activeTasks.length}</span></h3>
                    <button class="btn btn-sm btn-ghost" data-action="create-task">
                        <i data-feather="plus"></i> Añadir
                    </button>
                </div>
                <div class="card-body">
                    ${activeTasks.length === 0
                        ? '<div class="empty-state"><i data-feather="check-circle" class="c-green"></i><p>Todo al día.</p></div>'
                        : `<ul class="task-list">${activeTasks.slice(0, 6).map(renderTaskHTML).join('')}</ul>`
                    }
                </div>
            </div>

            <div class="card glass-panel">
                <div class="card-header">
                    <h3>Ciclos en Curso</h3>
                </div>
                <div class="card-body">
                    ${activeCycles.length === 0
                        ? '<div class="empty-state"><i data-feather="refresh-cw"></i><p>Sin ciclos activos.</p></div>'
                        : activeCycles.map(renderCycleProgressHTML).join('')
                    }
                </div>
            </div>

            <div class="card glass-panel highlight-danger">
                <div class="card-header">
                    <h3>Bloqueos <span class="badge badge-danger">${blockedTasks.length}</span></h3>
                </div>
                <div class="card-body">
                    ${blockedTasks.length === 0
                        ? '<div class="empty-state"><i data-feather="check-circle" class="c-green"></i><p>Sin bloqueos.</p></div>'
                        : `<ul class="task-list">${blockedTasks.map(renderTaskHTML).join('')}</ul>`
                    }
                </div>
            </div>

            <div class="card glass-panel">
                <div class="card-header"><h3>Progreso General</h3></div>
                <div class="card-body">${renderProgressStats(tasks)}</div>
            </div>
        </div>`;

    feather.replace();
    bindTaskEvents(container);
    container.querySelector('[data-action="create-task"]')
        ?.addEventListener('click', () => openCreateModal('task'));
}

function renderProgressStats(tasks) {
    if (!tasks.length) return '<div class="empty-state"><p>Sin datos aún.</p></div>';
    const done = tasks.filter(t => t.status === 'done').length;
    const pct  = Math.round((done / tasks.length) * 100);
    return `
        <div class="progress-stats">
            <div class="stat-row">
                <span class="stat-label">Completadas</span>
                <span class="stat-value c-green">${done} / ${tasks.length}</span>
            </div>
            <div class="progress-bar" style="margin-top:12px;">
                <div class="progress-fill" style="width:${pct}%;"></div>
            </div>
            <div class="stat-row" style="margin-top:8px;">
                <span class="stat-label">Progreso total</span>
                <span class="stat-value">${pct}%</span>
            </div>
        </div>`;
}

// ── Backlog ─────────────────────────────────────────────────────────────────

async function renderBacklog(container) {
    const [tasks, projects] = await Promise.all([
        dbAPI.getAll('tasks'),
        dbAPI.getAll('projects')
    ]);

    const projMap = Object.fromEntries(projects.map(p => [p.id, p]));

    // Filter state
    let filterProject  = '';
    let filterStatus   = '';
    let filterPriority = '';

    const doRender = () => {
        let items = [...tasks].filter(t => t.status !== 'done');
        if (filterProject)  items = items.filter(t => t.projectId === filterProject);
        if (filterStatus)   items = items.filter(t => t.status === filterStatus);
        if (filterPriority) items = items.filter(t => t.priority === filterPriority);

        // Sort: urgent→high→medium→low, then overdue first
        const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        items.sort((a, b) => {
            const po = (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9);
            if (po !== 0) return po;
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
        });

        const tbody = container.querySelector('#backlog-tbody');
        if (!tbody) return;
        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">
                <div class="empty-state"><i data-feather="inbox"></i><p>Sin ítems en backlog.</p></div>
            </td></tr>`;
        } else {
            tbody.innerHTML = items.map(t => {
                const proj = projMap[t.projectId];
                const overdue = isOverdue(t.dueDate);
                return `<tr class="backlog-row${t.status === 'blocked' ? ' row-blocked' : ''}" data-task-id="${t.id}">
                    <td>${priorityDot(t.priority)}</td>
                    <td class="cell-title">
                        <span class="task-title-text">${escapeHtml(t.title)}</span>
                    </td>
                    <td>${t.type ? `<span class="badge badge-secondary">${TYPE_LABELS[t.type] || t.type}</span>` : ''}</td>
                    <td>${proj ? `<span class="proj-chip" style="--dot:${proj.type === 'research' ? 'var(--accent-info)' : proj.type === 'course' ? '#8e44ad' : 'var(--accent-success)'}">${escapeHtml(proj.name)}</span>` : '—'}</td>
                    <td>${STATUS_BADGES[t.status] || ''}</td>
                    <td class="${overdue ? 'overdue' : ''}">${t.dueDate ? formatDate(t.dueDate) : '—'}</td>
                </tr>`;
            }).join('');
        }
        feather.replace();
    };

    container.innerHTML = `
        <div class="view-toolbar backlog-toolbar">
            <select id="bl-proj" class="filter-select">
                <option value="">Todos los proyectos</option>
                ${projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
            <select id="bl-status" class="filter-select">
                <option value="">Todos los estados</option>
                ${Object.entries(STATUS_LABELS).filter(([k]) => k !== 'done').map(([k, v]) =>
                    `<option value="${k}">${v}</option>`).join('')}
            </select>
            <select id="bl-priority" class="filter-select">
                <option value="">Todas las prioridades</option>
                ${Object.entries(PRIORITY_LABELS).map(([k, v]) =>
                    `<option value="${k}">${v}</option>`).join('')}
            </select>
            <button class="btn btn-primary" data-action="open-modal" data-type="task">
                <i data-feather="plus"></i> Nueva tarea
            </button>
        </div>
        <div class="backlog-table-wrap">
            <table class="backlog-table">
                <thead>
                    <tr>
                        <th class="th-priority"></th>
                        <th>Título</th>
                        <th>Tipo</th>
                        <th>Proyecto</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                    </tr>
                </thead>
                <tbody id="backlog-tbody"></tbody>
            </table>
        </div>`;

    feather.replace();
    doRender();

    container.querySelector('#bl-proj').addEventListener('change', e => { filterProject  = e.target.value; doRender(); });
    container.querySelector('#bl-status').addEventListener('change', e => { filterStatus   = e.target.value; doRender(); });
    container.querySelector('#bl-priority').addEventListener('change', e => { filterPriority = e.target.value; doRender(); });
    container.querySelector('[data-action="open-modal"]')
        ?.addEventListener('click', () => openCreateModal('task'));
}

// ── Board ───────────────────────────────────────────────────────────────────

async function renderBoard(container) {
    const [tasks, projects] = await Promise.all([
        dbAPI.getAll('tasks'),
        dbAPI.getAll('projects')
    ]);

    const projMap = Object.fromEntries(projects.map(p => [p.id, p]));

    const renderColumn = (col) => {
        const colTasks = tasks.filter(t => t.status === col.status);
        return `
            <div class="board-column ${col.cls}">
                <div class="column-header">
                    <span class="column-label">${col.label}</span>
                    <span class="column-count">${colTasks.length}</span>
                </div>
                <div class="column-cards">
                    ${colTasks.length === 0
                        ? '<div class="col-empty">—</div>'
                        : colTasks.map(t => renderBoardCard(t, projMap)).join('')
                    }
                </div>
            </div>`;
    };

    container.innerHTML = `
        <div class="view-toolbar">
            <button class="btn btn-primary" data-action="open-modal" data-type="task">
                <i data-feather="plus"></i> Nueva tarea
            </button>
        </div>
        <div class="board-container">
            ${BOARD_COLUMNS.map(renderColumn).join('')}
        </div>`;

    feather.replace();

    container.querySelector('[data-action="open-modal"]')
        ?.addEventListener('click', () => openCreateModal('task'));

    // Status change selects
    container.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', async (e) => {
            const taskId = e.currentTarget.dataset.taskId;
            const task = await dbAPI.getById('tasks', taskId);
            if (!task) return;
            task.status = e.currentTarget.value;
            task.updatedAt = new Date().toISOString();
            await dbAPI.updateRecord('tasks', task);
            await navigate('board');
        });
    });
}

function renderBoardCard(task, projMap) {
    const proj = projMap[task.projectId];
    const overdue = task.status !== 'done' && isOverdue(task.dueDate);
    const statusOptions = BOARD_COLUMNS.map(col =>
        `<option value="${col.status}" ${task.status === col.status ? 'selected' : ''}>${col.label}</option>`
    ).join('');

    return `
        <div class="board-card glass-panel${overdue ? ' card-overdue' : ''}">
            <div class="board-card-top">
                ${priorityDot(task.priority)}
                ${task.type ? `<span class="badge badge-secondary" style="font-size:0.7rem;">${TYPE_LABELS[task.type] || task.type}</span>` : ''}
            </div>
            <div class="board-card-title">${escapeHtml(task.title)}</div>
            <div class="board-card-meta">
                ${proj ? `<span class="proj-label">${escapeHtml(proj.name)}</span>` : ''}
                ${task.dueDate ? `<span class="${overdue ? 'overdue' : ''}">${formatDate(task.dueDate)}</span>` : ''}
            </div>
            <select class="status-select" data-task-id="${task.id}" title="Cambiar estado">
                ${statusOptions}
            </select>
        </div>`;
}

// ── Projects ─────────────────────────────────────────────────────────────────

async function renderProjects(container) {
    const projects = await dbAPI.getAll('projects');

    container.innerHTML = `
        <div class="view-toolbar">
            <button class="btn btn-primary" data-action="open-modal" data-type="project">
                <i data-feather="plus"></i> Nuevo Proyecto
            </button>
        </div>
        <div class="projects-grid">
            ${projects.length === 0
                ? '<div class="empty-state full-empty"><i data-feather="briefcase"></i><p>No hay proyectos aún.</p></div>'
                : projects.map(renderProjectCardHTML).join('')
            }
        </div>`;

    feather.replace();
    container.querySelectorAll('[data-action="open-modal"]').forEach(el => {
        el.addEventListener('click', () => openCreateModal(el.dataset.type));
    });
}

function renderProjectCardHTML(project) {
    const colorClass = { research: 'c-blue', course: 'c-purple', personal: 'c-green' }[project.type] || 'c-blue';
    const statusLabel = { active: 'Activo', archived: 'Archivado', paused: 'Pausado' }[project.status] || project.status;
    const typeLabel   = { research: 'Investigación', course: 'Curso', personal: 'Personal' }[project.type] || project.type;
    return `
        <div class="project-card card glass-panel">
            <div class="project-card-accent ${colorClass}"></div>
            <div class="card-body">
                <div class="project-header">
                    <h3 class="project-name">${escapeHtml(project.name)}</h3>
                    <span class="badge badge-info">${statusLabel}</span>
                </div>
                ${project.description ? `<p class="project-desc">${escapeHtml(project.description)}</p>` : ''}
                <div class="project-meta">
                    <span class="project-type"><i data-feather="tag"></i>${typeLabel}</span>
                </div>
            </div>
        </div>`;
}

// ── Cycles ────────────────────────────────────────────────────────────────────

async function renderCycles(container) {
    const cycles = await dbAPI.getAll('cycles');

    container.innerHTML = `
        <div class="view-toolbar">
            <button class="btn btn-primary" data-action="open-modal" data-type="cycle">
                <i data-feather="plus"></i> Nuevo Ciclo
            </button>
        </div>
        <div class="cycles-list">
            ${cycles.length === 0
                ? '<div class="empty-state full-empty"><i data-feather="refresh-cw"></i><p>No hay ciclos aún.</p></div>'
                : cycles.map(renderCycleCardHTML).join('')
            }
        </div>`;

    feather.replace();
    container.querySelectorAll('[data-action="open-modal"]').forEach(el => {
        el.addEventListener('click', () => openCreateModal(el.dataset.type));
    });
}

function renderCycleCardHTML(cycle) {
    const start = new Date(cycle.startDate);
    const end   = new Date(cycle.endDate);
    const now   = new Date();
    const pct = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
    const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    const statusLabel = { active: 'Activo', completed: 'Completado', upcoming: 'Próximo' }[cycle.status] || cycle.status;
    return `
        <div class="cycle-card card glass-panel">
            <div class="card-body">
                <div class="cycle-card-header">
                    <h3>${escapeHtml(cycle.name)}</h3>
                    <span class="badge badge-info">${statusLabel}</span>
                </div>
                <div class="cycle-dates">
                    <i data-feather="calendar"></i>
                    <span>${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} &rarr;
                          ${end.toLocaleDateString('es-ES',   { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div class="cycle-progress" style="margin-top:16px;">
                    <div class="cycle-info">
                        <span class="cycle-name">Progreso</span>
                        <span class="cycle-days">${daysLeft} día${daysLeft !== 1 ? 's' : ''} rest.</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${pct}%;"></div>
                    </div>
                </div>
            </div>
        </div>`;
}

// ── Decisions ─────────────────────────────────────────────────────────────────

async function renderDecisions(container) {
    const [decisions, projects] = await Promise.all([
        dbAPI.getAll('decisions'),
        dbAPI.getAll('projects')
    ]);

    const projMap = Object.fromEntries(projects.map(p => [p.id, p]));

    // Sort newest first
    decisions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    container.innerHTML = `
        <div class="view-toolbar">
            <button class="btn btn-primary" data-action="open-modal" data-type="decision">
                <i data-feather="plus"></i> Nueva Decisión
            </button>
        </div>
        <div class="decisions-list">
            ${decisions.length === 0
                ? '<div class="empty-state full-empty"><i data-feather="book-open"></i><p>No hay decisiones registradas.</p></div>'
                : decisions.map(d => renderDecisionCard(d, projMap)).join('')
            }
        </div>`;

    feather.replace();
    container.querySelector('[data-action="open-modal"]')
        ?.addEventListener('click', () => openCreateModal('decision'));
}

function renderDecisionCard(dec, projMap) {
    const proj = projMap[dec.projectId];
    return `
        <div class="decision-card card glass-panel">
            <div class="decision-header">
                <div>
                    <h3 class="decision-title">${escapeHtml(dec.title)}</h3>
                    ${proj ? `<span class="decision-project">${escapeHtml(proj.name)}</span>` : ''}
                </div>
                <span class="decision-date">${dec.date ? formatDate(dec.date) : ''}</span>
            </div>
            ${dec.context ? `
                <div class="decision-section">
                    <span class="decision-label">Contexto</span>
                    <p>${escapeHtml(dec.context)}</p>
                </div>` : ''}
            <div class="decision-section decision-outcome">
                <span class="decision-label">Decisión</span>
                <p>${escapeHtml(dec.decision)}</p>
            </div>
            ${dec.impact ? `
                <div class="decision-section">
                    <span class="decision-label">Impacto</span>
                    <p>${escapeHtml(dec.impact)}</p>
                </div>` : ''}
        </div>`;
}

// ── Task event binding ────────────────────────────────────────────────────────

function bindTaskEvents(container) {
    container.querySelectorAll('[data-action="toggle-task"]').forEach(el => {
        el.addEventListener('click', async () => {
            const task = await dbAPI.getById('tasks', el.dataset.taskId);
            if (!task) return;
            task.status = task.status === 'done' ? 'in_progress' : 'done';
            task.updatedAt = new Date().toISOString();
            await dbAPI.updateRecord('tasks', task);
            await navigate(currentView);
        });
    });
}

// ── Create Modal ──────────────────────────────────────────────────────────────

async function openCreateModal(type) {
    const existing = document.getElementById('create-modal');
    if (existing) existing.remove();

    const projects = await dbAPI.getAll('projects');
    const projectOptions = projects.map(p =>
        `<option value="${p.id}">${escapeHtml(p.name)}</option>`
    ).join('');

    const typeLabels = { task: 'Tarea', project: 'Proyecto', cycle: 'Ciclo', decision: 'Decisión' };

    const formFields = {
        task: `
            <div class="form-group">
                <label class="form-label">Título *</label>
                <input type="text" id="field-title" class="form-input" placeholder="¿Qué hay que hacer?" autofocus>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Tipo</label>
                    <select id="field-type" class="form-input">
                        <option value="task">Tarea</option>
                        <option value="deliverable">Entregable</option>
                        <option value="milestone">Hito</option>
                        <option value="idea">Idea</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Prioridad</label>
                    <select id="field-priority" class="form-input">
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                        <option value="urgent">Urgente</option>
                        <option value="low">Baja</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Estado</label>
                    <select id="field-status" class="form-input">
                        <option value="todo">Definido</option>
                        <option value="backlog">Backlog</option>
                        <option value="in_progress">En elaboración</option>
                        <option value="in_review">En revisión</option>
                        <option value="blocked">Bloqueada</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Fecha límite</label>
                    <input type="date" id="field-due" class="form-input">
                </div>
            </div>
            ${projects.length ? `
            <div class="form-group">
                <label class="form-label">Proyecto</label>
                <select id="field-project" class="form-input">
                    <option value="">Sin proyecto</option>
                    ${projectOptions}
                </select>
            </div>` : ''}
        `,
        project: `
            <div class="form-group">
                <label class="form-label">Nombre *</label>
                <input type="text" id="field-title" class="form-input" placeholder="Nombre del proyecto" autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">Descripción</label>
                <textarea id="field-desc" class="form-input form-textarea" placeholder="Descripción opcional"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Tipo</label>
                <select id="field-type" class="form-input">
                    <option value="research">Investigación</option>
                    <option value="course">Curso</option>
                    <option value="personal">Personal</option>
                </select>
            </div>
        `,
        cycle: `
            <div class="form-group">
                <label class="form-label">Nombre *</label>
                <input type="text" id="field-title" class="form-input" placeholder="Ej: Semana de Cierre" autofocus>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Inicio</label>
                    <input type="date" id="field-start" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label">Fin</label>
                    <input type="date" id="field-end" class="form-input">
                </div>
            </div>
        `,
        decision: `
            <div class="form-group">
                <label class="form-label">Título *</label>
                <input type="text" id="field-title" class="form-input" placeholder="¿Qué se decidió?" autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">Contexto</label>
                <textarea id="field-context" class="form-input form-textarea" placeholder="¿Por qué se tomó esta decisión?"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Decisión tomada *</label>
                <textarea id="field-decision" class="form-input form-textarea" placeholder="Describe la decisión concreta"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Impacto esperado</label>
                <input type="text" id="field-impact" class="form-input" placeholder="¿Qué cambia con esta decisión?">
            </div>
            ${projects.length ? `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Proyecto</label>
                    <select id="field-project" class="form-input">
                        <option value="">General</option>
                        ${projectOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Fecha</label>
                    <input type="date" id="field-date" class="form-input">
                </div>
            </div>` : `
            <div class="form-group">
                <label class="form-label">Fecha</label>
                <input type="date" id="field-date" class="form-input">
            </div>`}
        `
    };

    const modal = document.createElement('div');
    modal.id = 'create-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal glass-panel">
            <div class="modal-header">
                <h3>Nuevo/a ${typeLabels[type] || 'Elemento'}</h3>
                <button class="btn btn-icon" id="close-modal"><i data-feather="x"></i></button>
            </div>
            <div class="modal-body">
                <form id="create-form">${formFields[type] || ''}</form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancel-modal">Cancelar</button>
                <button class="btn btn-primary" id="submit-modal">Crear ${typeLabels[type] || ''}</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    feather.replace();

    // Defaults
    if (modal.querySelector('#field-due'))   modal.querySelector('#field-due').value   = todayStr();
    if (modal.querySelector('#field-start')) modal.querySelector('#field-start').value = todayStr();
    if (modal.querySelector('#field-end'))   modal.querySelector('#field-end').value   = offsetDateStr(7);
    if (modal.querySelector('#field-date'))  modal.querySelector('#field-date').value  = todayStr();

    const closeModal = () => modal.remove();
    modal.querySelector('#close-modal').addEventListener('click', closeModal);
    modal.querySelector('#cancel-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    modal.querySelector('#submit-modal').addEventListener('click', async () => {
        const titleEl = modal.querySelector('#field-title');
        const title = titleEl?.value.trim();
        if (!title) { titleEl?.focus(); return; }

        const now = new Date().toISOString();
        let record;

        if (type === 'task') {
            record = {
                id: generateId(),
                title,
                type:      modal.querySelector('#field-type')?.value     || 'task',
                priority:  modal.querySelector('#field-priority')?.value || 'medium',
                status:    modal.querySelector('#field-status')?.value   || 'todo',
                dueDate:   modal.querySelector('#field-due')?.value      || null,
                projectId: modal.querySelector('#field-project')?.value  || null,
                createdAt: now, updatedAt: now
            };
            await dbAPI.addRecord('tasks', record);

        } else if (type === 'project') {
            record = {
                id: generateId(),
                name: title,
                description: modal.querySelector('#field-desc')?.value.trim() || '',
                type:   modal.querySelector('#field-type')?.value || 'personal',
                status: 'active',
                createdAt: now, updatedAt: now
            };
            await dbAPI.addRecord('projects', record);

        } else if (type === 'cycle') {
            record = {
                id: generateId(),
                name: title,
                startDate: modal.querySelector('#field-start')?.value || todayStr(),
                endDate:   modal.querySelector('#field-end')?.value   || offsetDateStr(7),
                status: 'active',
                createdAt: now, updatedAt: now
            };
            await dbAPI.addRecord('cycles', record);

        } else if (type === 'decision') {
            const decisionText = modal.querySelector('#field-decision')?.value.trim();
            if (!decisionText) { modal.querySelector('#field-decision')?.focus(); return; }
            record = {
                id: generateId(),
                title,
                context:   modal.querySelector('#field-context')?.value.trim()  || '',
                decision:  decisionText,
                impact:    modal.querySelector('#field-impact')?.value.trim()   || '',
                projectId: modal.querySelector('#field-project')?.value          || null,
                date:      modal.querySelector('#field-date')?.value             || todayStr(),
                createdAt: now, updatedAt: now
            };
            await dbAPI.addRecord('decisions', record);
        }

        closeModal();
        await navigate(currentView);
    });

    modal.querySelector('#field-title')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && type !== 'decision') modal.querySelector('#submit-modal').click();
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    feather.replace();

    try {
        await waitForDB();
    } catch (e) {
        console.error('DB not ready:', e);
    }

    document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            navigate(item.dataset.view);
        });
    });

    document.querySelector('.topbar .btn-primary')
        ?.addEventListener('click', () => openCreateModal('task'));

    await navigate('dashboard');
});
