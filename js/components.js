/**
 * components.js — Shared UI components used across views
 */

// ── Shared Utilities (UI Helpers) ──────────────────────────────────────────
/**
 * Renders a circular avatar with initials or an image.
 */
function renderAvatar(userId, name, size = 30) {
  const initials = (name || userId || '—').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const color = stringToColor(name || userId || 'user');
  return `<div class="avatar" title="${esc(name || userId)}" style="width:${size}px; height:${size}px; background:${color}; font-size:${size * 0.4}px;">
    ${initials}
  </div>`;
}

/**
 * Renders a capsule-style tag with pastel coloring.
 */
function renderTag(label, type = 'neutral') {
  const colors = {
    primary: 'var(--accent-primary-bg), var(--accent-primary)',
    success: 'var(--accent-success-bg), var(--accent-success)',
    warning: 'var(--accent-warning-bg), var(--accent-warning)',
    danger: 'var(--accent-danger-bg), var(--accent-danger)',
    purple: 'var(--accent-purple-bg), var(--accent-purple)',
    teal: 'var(--accent-teal-bg), var(--accent-teal)',
    neutral: 'var(--bg-input), var(--text-muted)'
  };
  const [bg, fg] = (colors[type] || colors.neutral).split(', ');
  return `<span class="capsule-tag" style="background:${bg}; color:${fg};">${esc(label)}</span>`;
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 45%)`;
}


// ── Stat Pill (Dashboard) ────────────────────────────────────────────────────
/**
 * Renderiza una pequeña "píldora" estadística para tableros de resumen.
 * @param {number|string} count - El valor numérico o texto a destacar.
 * @param {string} label - La etiqueta descriptiva.
 * @param {string} icon - Nombre del icono Feather.
 * @param {string} color - Código de color opcional (hex, rgb o var).
 * @returns {string} HTML generado.
 */
function statPill(count, label, icon, color) {
  return `<div class="stat-pill" style="${color ? `color:${color};` : ''}">
    <i data-feather="${icon}" style="width:13px;height:13px;"></i>
    <strong>${count}</strong> ${esc(label)}
  </div>`;
}

// ── Task Item (Dashboard, Project Detail, etc.) ──────────────────────────────
/**
 * Genera el HTML para un elemento individual de Tarea (ListItem).
 * Evalúa internamente el estado de urgencia basado en las fechas límites (dueDate).
 * @param {Object} t - El objeto de la Tarea.
 * @returns {string} HTML generado representando la fila de la tarea.
 */
function taskItem(t) {
  const proj = store.get.projectById(t.projectId);
  const isDone = t.status === 'Terminado' || t.status === 'Archivado';

  // Urgent logic
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = t.dueDate ? new Date(t.dueDate) : null;
  const isOverdue = dueDate && dueDate < today && !isDone;
  // 7 days window for urgent
  const isUrgent = dueDate && !isOverdue && !isDone && (dueDate - today) <= (7 * 24 * 60 * 60 * 1000);
  const urgentClass = isOverdue ? 'task-overdue' : (isUrgent ? 'task-urgent' : '');

  return `
    <li class="task-item ${urgentClass}" data-task-id="${t.id}">
      <div class="task-checkbox ${isDone ? 'checked' : ''}" data-id="${t.id}"></div>
      <div class="task-details">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <span class="task-title ${isDone ? 'done' : ''}">${esc(t.title)}</span>
          ${t.assigneeId ? renderAvatar(t.assigneeId, t.assigneeName, 22) : ''}
        </div>
        <span class="task-meta">
          ${proj ? `<span style="color:${proj.color || 'var(--accent-primary)'}">● ${esc(proj.name)}</span>` : ''}
          ${t.dueDate ? `<i data-feather="calendar"></i><span style="${isOverdue ? 'color:var(--accent-danger)' : (isUrgent ? 'color:var(--accent-warning)' : '')}">${fmtDate(t.dueDate)}</span>` : ''}
          ${t.tags ? t.tags.split(',').map(tag => renderTag(tag.trim(), 'neutral')).join('') : ''}
          ${statusBadge(t.status)}
        </span>
      </div>
      <div class="priority-pip ${t.priority || 'baja'}"></div>
    </li>`;
}

// ── Cycle Widget (Dashboard) ─────────────────────────────────────────────────
/**
 * Genera un widget compacto iterativo con la barra de progreso de un ciclo específico.
 * Mapea visualmente el porcentaje completado vs el planeado temporalmente.
 * @param {Object} c - El objeto lógico del Ciclo.
 * @returns {string} Tarjeta HTML compilada.
 */
function cycleWidget(c) {
  const proj = store.get.projectById(c.projectId);
  const pct = store.get.cycleProgress(c.id);
  const end = c.endDate ? `Hasta ${fmtDate(c.endDate)}` : '';
  return `
    <div class="cycle-progress">
      <div class="cycle-info">
        <span class="cycle-name">${esc(c.name)}</span>
        <span class="cycle-pct">${pct}%</span>
      </div>
      ${proj ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:-6px;">
        <span style="color:${proj.color || 'var(--accent-primary)'}">●</span> ${esc(proj.name)}</div>` : ''}
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="font-size:0.72rem;color:var(--text-muted);">${end}</div>
    </div>`;
}

// ── Mini Project Card (Dashboard) ────────────────────────────────────────────
/**
 * Crea la representación visual simplificada de los datos de un Proyecto.
 * @param {Object} p - El objeto Proyecto extraído de store.
 * @returns {string} HTML a inyectar en grillas.
 */
function miniProjectCard(p) {
  const pTasks = store.get.tasksByProject(p.id) || [];
  const done = pTasks.filter(t => t.status === 'Terminado').length;
  const pct = pTasks.length ? Math.round(done / pTasks.length * 100) : 0;
  return `
    <div class="project-card" style="--project-color:${p.color || 'var(--accent-primary)'}; cursor:pointer;"
         onclick="router.navigate('/project/${p.id}')">
      <div class="project-card-name" style="font-size:0.82rem;">
        ${p.visibility === 'local' ? '<i data-feather="lock" style="width:12px;height:12px;margin-right:4px;vertical-align:text-bottom;"></i>' : '<i data-feather="cloud" style="width:12px;height:12px;margin-right:4px;vertical-align:text-bottom;"></i>'}
        ${esc(p.name)}
      </div>
      <div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div style="font-size:0.7rem;color:var(--text-muted);">${done}/${pTasks.length} tareas · ${pct}%</div>
    </div>`;
}

// ── Cycle Card (Cycles View, Project Detail) ─────────────────────────────────
/**
 * Renderiza una tarjeta ampliada y detallada de un Ciclo, enumerando
 * internamente la progresión actual, tareas finalizadas y atajos rápidos. 
 * @param {Object} c - Entidad de estado "Ciclo".
 * @returns {string} Cadena HTML para inyección.
 */
function cycleCard(c) {
  const proj = store.get.projectById(c.projectId);
  const pct = store.get.cycleProgress(c.id);
  const tasks = store.get.tasksByCycle(c.id);

  return `
    <div class="cycle-card">
      <div class="cycle-card-header">
        <div>
          <div class="cycle-card-title">${esc(c.name)}</div>
          ${proj ? `<div style="font-size:0.75rem;color:${proj.color || 'var(--accent-primary)'};margin-top:3px;">● ${esc(proj.name)}</div>` : ''}
          ${c.goal ? `<div class="cycle-card-goal" style="margin-top:5px;">${esc(c.goal)}</div>` : ''}
        </div>
        ${statusBadge(c.status || 'activo')}
      </div>

      <div class="cycle-card-dates">
        <i data-feather="calendar" style="width:11px;height:11px;"></i>
        ${c.startDate ? fmtDate(c.startDate) : '?'} → ${c.endDate ? fmtDate(c.endDate) : '?'}
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">
          <span>${tasks.length} tareas · ${tasks.filter(t => t.status === 'Terminado').length} terminadas</span>
          <span style="color:var(--accent-primary);font-weight:600;">${pct}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>

      <div>
        <div class="section-label">Tareas en este ciclo</div>
        ${tasks.length === 0
      ? `<div style="font-size:0.78rem;color:var(--text-muted);">Sin tareas asignadas.</div>`
      : `<ul class="task-list" style="gap:5px;">${tasks.slice(0, 4).map(t => `
              <li class="task-item" style="padding:7px 10px;">
                <div class="task-checkbox ${t.status === 'Terminado' ? 'checked' : ''}" data-id="${t.id}"></div>
                <span class="task-title ${t.status === 'Terminado' ? 'done' : ''}" style="font-size:0.8rem;">${esc(t.title)}</span>
                ${statusBadge(t.status)}
              </li>`).join('')}
              ${tasks.length > 4 ? `<li style="font-size:0.75rem;color:var(--text-muted);padding:4px 10px;">+ ${tasks.length - 4} más</li>` : ''}
          </ul>`
    }
      </div>

      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-ghost btn-sm cycle-close-btn" data-id="${c.id}"
          ${c.status === 'cerrado' ? 'disabled' : ''}>
          <i data-feather="check"></i> ${c.status === 'cerrado' ? 'Cerrado' : 'Cerrar ciclo'}
        </button>
      </div>
    </div>`;
}

// ── Decision Card (Decisions View, Project Detail) ───────────────────────────
/**
 * Construye el renderizado visual (tarjeta de lectura) de una Decisión Registrada.
 * Da formato de alerta semántica al nivel de impacto.
 * @param {Object} d - El registro original de la Decisión.
 * @returns {string} HTML formateado.
 */
function decisionCard(d) {
  const proj = store.get.projectById(d.projectId);
  const impactColor = d.impact === 'alta' ? 'badge-danger' : d.impact === 'media' ? 'badge-warning' : 'badge-neutral';
  return `
    <div class="decision-card" data-decision-id="${d.id}">
      <div class="decision-card-header">
        <div style="display:flex; gap:12px; align-items:center;">
          ${renderAvatar(d.ownerId || '?', d.ownerName || 'Unknown', 32)}
          <div>
            <div class="decision-title">${esc(d.title)}</div>
            <div class="decision-meta">
              ${proj ? `<span style="color:${proj.color || 'var(--accent-primary)'};">● ${esc(proj.name)}</span>` : ''}
              <span><i data-feather="calendar" style="width:10px;height:10px;"></i> ${fmtDate(d.date)}</span>
            </div>
          </div>
        </div>
        <div style="display:flex; gap:6px; align-items:flex-start; flex-shrink:0;">
          <span class="badge ${impactColor}">Impacto ${d.impact || '—'}</span>
          <button class="btn btn-icon btn-sm dec-del-btn" data-id="${d.id}" style="padding:4px;">
            <i data-feather="trash-2" style="width:12px;height:12px;"></i>
          </button>
        </div>
      </div>
      ${d.context ? `<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:12px; line-height:1.6;"><strong>Contexto:</strong> ${esc(d.context)}</div>` : ''}
      ${d.decision ? `<div class="decision-body" style="margin-top:8px; padding:12px; background:var(--bg-input); border-radius:var(--radius-sm); border-left:3px solid var(--accent-primary);"><strong>Decisión:</strong> ${esc(d.decision)}</div>` : ''}
    </div>`;
}

// Attach to window
window.statPill = statPill;
window.taskItem = taskItem;
window.cycleWidget = cycleWidget;
window.miniProjectCard = miniProjectCard;
window.cycleCard = cycleCard;
window.decisionCard = decisionCard;
window.renderAvatar = renderAvatar;
window.renderTag = renderTag;
