/**
 * app.js
 * SPA core: routing, view rendering, and DB integration.
 * Views: Dashboard, Projects, Cycles.
 */

// --- Utilities ---

const generateId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return 'Hoy';
    if (date.toDateString() === tomorrow.toDateString()) return 'Mañana';
    return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function offsetDateStr(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// Wait for IndexedDB to be ready (db.js sets window.dbReady = true after seeding)
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

// --- State ---
let currentView = 'dashboard';

// --- View Definitions ---
const views = {
    dashboard: {
        title: 'Dashboard',
        subtitle: 'Resumen de tu actividad y próximos entregables.',
        render: renderDashboard
    },
    projects: {
        title: 'Proyectos',
        subtitle: 'Gestión de tus proyectos activos y archivados.',
        render: renderProjects
    },
    cycles: {
        title: 'Ciclos',
        subtitle: 'Planificación temporal y timeboxing.',
        render: renderCycles
    }
};

// --- Router ---
async function navigate(viewName) {
    if (!views[viewName]) return;
    currentView = viewName;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update breadcrumb and view header
    const view = views[viewName];
    const breadcrumb = document.querySelector('.breadcrumbs .current');
    const headerTitle = document.querySelector('.view-header h1');
    const headerSubtitle = document.querySelector('.view-header .subtitle');
    if (breadcrumb) breadcrumb.textContent = view.title;
    if (headerTitle) headerTitle.textContent = view.title;
    if (headerSubtitle) headerSubtitle.textContent = view.subtitle;

    // Show loading state and render view
    const container = document.getElementById('view-content');
    if (!container) return;
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
    await view.render(container);
}

// --- Dashboard View ---
async function renderDashboard(container) {
    const [tasks, cycles] = await Promise.all([
        dbAPI.getAll('tasks'),
        dbAPI.getAll('cycles')
    ]);

    const activeTasks = tasks.filter(t => t.status !== 'done');
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
                        ? '<div class="empty-state"><i data-feather="check-circle" class="c-green"></i><p>Todas las tareas completadas.</p></div>'
                        : `<ul class="task-list">${activeTasks.map(renderTaskHTML).join('')}</ul>`
                    }
                </div>
            </div>

            <div class="card glass-panel">
                <div class="card-header">
                    <h3>Ciclos en Curso</h3>
                </div>
                <div class="card-body">
                    ${activeCycles.length === 0
                        ? '<div class="empty-state"><i data-feather="refresh-cw"></i><p>No hay ciclos activos.</p></div>'
                        : activeCycles.map(renderCycleProgressHTML).join('')
                    }
                </div>
            </div>

            <div class="card glass-panel highlight-danger">
                <div class="card-header">
                    <h3>Bloqueos</h3>
                </div>
                <div class="card-body">
                    ${blockedTasks.length === 0
                        ? '<div class="empty-state"><i data-feather="check-circle" class="c-green"></i><p>No hay bloqueos activos.</p></div>'
                        : `<ul class="task-list">${blockedTasks.map(renderTaskHTML).join('')}</ul>`
                    }
                </div>
            </div>

            <div class="card glass-panel">
                <div class="card-header">
                    <h3>Progreso General</h3>
                </div>
                <div class="card-body">
                    ${renderProgressStats(tasks)}
                </div>
            </div>
        </div>
    `;

    feather.replace();
    bindTaskEvents(container);

    container.querySelector('[data-action="create-task"]')?.addEventListener('click', () => {
        openCreateModal('task');
    });
}

function renderProgressStats(tasks) {
    const total = tasks.length;
    if (total === 0) {
        return '<div class="empty-state"><p>Sin datos aún.</p></div>';
    }
    const done = tasks.filter(t => t.status === 'done').length;
    const pct = Math.round((done / total) * 100);
    return `
        <div class="progress-stats">
            <div class="stat-row">
                <span class="stat-label">Completadas</span>
                <span class="stat-value c-green">${done} / ${total}</span>
            </div>
            <div class="progress-bar" style="margin-top:12px;">
                <div class="progress-fill" style="width:${pct}%;"></div>
            </div>
            <div class="stat-row" style="margin-top:8px;">
                <span class="stat-label">Progreso total</span>
                <span class="stat-value">${pct}%</span>
            </div>
        </div>
    `;
}

// --- Task Rendering ---
const STATUS_BADGES = {
    todo:        '<span class="badge badge-secondary">Pendiente</span>',
    in_progress: '<span class="badge badge-warning">En elaboración</span>',
    in_review:   '<span class="badge badge-info">En preparación</span>',
    done:        '<span class="badge badge-success">Completada</span>',
    blocked:     '<span class="badge badge-danger">Bloqueada</span>'
};

function renderTaskHTML(task) {
    const isDone = task.status === 'done';
    const badge = STATUS_BADGES[task.status] || '';
    return `
        <li class="task-item${isDone ? ' completed' : ''}" data-task-id="${task.id}">
            <div class="task-checkbox${isDone ? ' checked' : ''}"
                 data-action="toggle-task"
                 data-task-id="${task.id}"
                 title="${isDone ? 'Marcar como pendiente' : 'Marcar como completada'}">
            </div>
            <div class="task-details">
                <span class="task-title">${escapeHtml(task.title)}</span>
                ${task.dueDate
                    ? `<span class="task-meta"><i data-feather="calendar"></i>${formatDate(task.dueDate)}</span>`
                    : ''}
            </div>
            ${badge}
        </li>
    `;
}

function renderCycleProgressHTML(cycle) {
    const start = new Date(cycle.startDate);
    const end = new Date(cycle.endDate);
    const now = new Date();
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
        </div>
    `;
}

// --- Projects View ---
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
                ? '<div class="empty-state full-empty"><i data-feather="briefcase"></i><p>No hay proyectos. Crea uno para comenzar.</p></div>'
                : projects.map(renderProjectCardHTML).join('')
            }
        </div>
    `;

    feather.replace();
    container.querySelectorAll('[data-action="open-modal"]').forEach(el => {
        el.addEventListener('click', () => openCreateModal(el.dataset.type));
    });
}

function renderProjectCardHTML(project) {
    const colorClass = { research: 'c-blue', course: 'c-purple', personal: 'c-green' }[project.type] || 'c-blue';
    const statusLabel = { active: 'Activo', archived: 'Archivado', paused: 'Pausado' }[project.status] || project.status;
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
                    <span class="project-type"><i data-feather="tag"></i>${project.type || 'general'}</span>
                </div>
            </div>
        </div>
    `;
}

// --- Cycles View ---
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
                ? '<div class="empty-state full-empty"><i data-feather="refresh-cw"></i><p>No hay ciclos. Crea uno para comenzar.</p></div>'
                : cycles.map(renderCycleCardHTML).join('')
            }
        </div>
    `;

    feather.replace();
    container.querySelectorAll('[data-action="open-modal"]').forEach(el => {
        el.addEventListener('click', () => openCreateModal(el.dataset.type));
    });
}

function renderCycleCardHTML(cycle) {
    const start = new Date(cycle.startDate);
    const end = new Date(cycle.endDate);
    const now = new Date();
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
                    <span>
                        ${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        &rarr;
                        ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
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
        </div>
    `;
}

// --- Event Binding ---
function bindTaskEvents(container) {
    container.querySelectorAll('[data-action="toggle-task"]').forEach(el => {
        el.addEventListener('click', async () => {
            const taskId = el.dataset.taskId;
            const task = await dbAPI.getById('tasks', taskId);
            if (!task) return;
            task.status = task.status === 'done' ? 'in_progress' : 'done';
            task.updatedAt = new Date().toISOString();
            await dbAPI.updateRecord('tasks', task);
            await navigate(currentView);
        });
    });
}

// --- Create Modal ---
function openCreateModal(type) {
    const existing = document.getElementById('create-modal');
    if (existing) existing.remove();

    const typeLabels = { task: 'Tarea', project: 'Proyecto', cycle: 'Ciclo' };
    const formFields = {
        task: `
            <div class="form-group">
                <label class="form-label">Título *</label>
                <input type="text" id="field-title" class="form-input" placeholder="¿Qué hay que hacer?" autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">Estado</label>
                <select id="field-status" class="form-input">
                    <option value="todo">Pendiente</option>
                    <option value="in_progress">En elaboración</option>
                    <option value="in_review">En preparación</option>
                    <option value="blocked">Bloqueada</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Fecha límite</label>
                <input type="date" id="field-due" class="form-input">
            </div>
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
            <div class="form-group">
                <label class="form-label">Fecha de inicio</label>
                <input type="date" id="field-start" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Fecha de fin</label>
                <input type="date" id="field-end" class="form-input">
            </div>
        `
    };

    const modal = document.createElement('div');
    modal.id = 'create-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal glass-panel">
            <div class="modal-header">
                <h3>Nuevo ${typeLabels[type] || 'Elemento'}</h3>
                <button class="btn btn-icon" id="close-modal"><i data-feather="x"></i></button>
            </div>
            <div class="modal-body">
                <form id="create-form">
                    ${formFields[type] || ''}
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancel-modal">Cancelar</button>
                <button class="btn btn-primary" id="submit-modal">Crear ${typeLabels[type] || ''}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    feather.replace();

    // Set sensible default dates
    const fieldDue = modal.querySelector('#field-due');
    const fieldStart = modal.querySelector('#field-start');
    const fieldEnd = modal.querySelector('#field-end');
    if (fieldDue) fieldDue.value = todayStr();
    if (fieldStart) fieldStart.value = todayStr();
    if (fieldEnd) fieldEnd.value = offsetDateStr(7);

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
                status: modal.querySelector('#field-status')?.value || 'todo',
                dueDate: modal.querySelector('#field-due')?.value || null,
                createdAt: now,
                updatedAt: now
            };
            await dbAPI.addRecord('tasks', record);
        } else if (type === 'project') {
            record = {
                id: generateId(),
                name: title,
                description: modal.querySelector('#field-desc')?.value.trim() || '',
                type: modal.querySelector('#field-type')?.value || 'personal',
                status: 'active',
                createdAt: now,
                updatedAt: now
            };
            await dbAPI.addRecord('projects', record);
        } else if (type === 'cycle') {
            record = {
                id: generateId(),
                name: title,
                startDate: modal.querySelector('#field-start')?.value || todayStr(),
                endDate: modal.querySelector('#field-end')?.value || offsetDateStr(7),
                status: 'active',
                createdAt: now,
                updatedAt: now
            };
            await dbAPI.addRecord('cycles', record);
        }

        closeModal();
        await navigate(currentView);
    });

    // Submit on Enter in title field
    modal.querySelector('#field-title')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') modal.querySelector('#submit-modal').click();
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    feather.replace();

    try {
        await waitForDB();
    } catch (e) {
        console.error('DB not ready in time:', e);
    }

    // Sidebar navigation
    document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            navigate(item.dataset.view);
        });
    });

    // Topbar "Nuevo" button → create task
    document.querySelector('.topbar .btn-primary')?.addEventListener('click', () => {
        openCreateModal('task');
    });

    // Initial render
    await navigate('dashboard');
});
