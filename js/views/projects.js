/**
 * views/projects.js — Projects list + detail view
 */


function renderProjects(root, params) {
  const projects = store.get.projects();

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Proyectos</h1>
          <p class="view-subtitle">Gestión de proyectos activos y archivados.</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="new-project-btn"><i data-feather="plus"></i> Nuevo proyecto</button>
        </div>
      </div>

      <div class="filter-bar">
        <select class="filter-select" id="proj-filter-status">
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="planificado">Planificado</option>
          <option value="pausado">Pausado</option>
          <option value="archivado">Archivado</option>
        </select>
        <select class="filter-select" id="proj-filter-type">
          <option value="">Todos los tipos</option>
          ${Object.entries(PROJECT_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>

      <div class="projects-grid" id="projects-grid">
        ${renderProjectCards(projects)}
      </div>
    </div>`;

  feather.replace();

  root.querySelector('#new-project-btn').addEventListener('click', () => openProjectModal());

  ['proj-filter-status', 'proj-filter-type'].forEach(id => {
    root.querySelector(`#${id}`).addEventListener('change', () => {
      const status = root.querySelector('#proj-filter-status').value;
      const type = root.querySelector('#proj-filter-type').value;
      let filtered = store.get.projects();
      if (status) filtered = filtered.filter(p => p.status === status);
      if (type) filtered = filtered.filter(p => p.type === type);
      root.querySelector('#projects-grid').innerHTML = renderProjectCards(filtered);
      feather.replace();
      bindProjectCards(root);
    });
  });

  bindProjectCards(root);
}

function renderProjectCards(projects) {
  if (!projects.length) return emptyState('briefcase', 'No hay proyectos. Crea tu primero.');
  return projects.map(p => {
    const meta = PROJECT_TYPES[p.type] || PROJECT_TYPES.libre;
    const tasks = store.get.tasksByProject(p.id);
    const done = tasks.filter(t => t.status === 'Terminado').length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const cycle = store.get.activeCycles().find(c => c.projectId === p.id);
    return `
      <div class="project-card" style="--project-color:${p.color || meta.color};" data-project-id="${p.id}">
        <div class="project-card-top">
          <div class="project-icon" style="--project-color:${p.color || meta.color};">
            <i data-feather="${meta.icon}"></i>
          </div>
          <span class="badge badge-neutral">${meta.label}</span>
        </div>
        <div>
          <div class="project-card-name">${esc(p.name)}</div>
          ${p.goal ? `<div class="project-card-goal" style="margin-top:6px;">${esc(p.goal)}</div>` : ''}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-muted);margin-bottom:5px;">
            <span>${done}/${tasks.length} tareas</span><span>${pct}%</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="project-card-meta">
          ${cycle ? `<span><i data-feather="refresh-cw" style="width:10px;height:10px;"></i> ${esc(cycle.name)}</span>` : ''}
          ${p.endDate ? `<span><i data-feather="calendar" style="width:10px;height:10px;"></i> ${fmtDate(p.endDate)}</span>` : ''}
          ${statusBadge(p.status)}
        </div>
      </div>`;
  }).join('');
}

function bindProjectCards(root) {
  root.querySelectorAll('.project-card[data-project-id]').forEach(card => {
    card.addEventListener('click', () => {
      router.navigate(`/project/${card.dataset.projectId}`);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Project Detail with tabs
// ──────────────────────────────────────────────────────────────────────────────

function renderProjectDetail(root, params) {
  const { projectId } = params;
  const p = store.get.projectById(projectId);
  if (!p) { root.innerHTML = `<div class="view-inner">${emptyState('briefcase', 'Proyecto no encontrado.')}</div>`; return; }

  const meta = PROJECT_TYPES[p.type] || PROJECT_TYPES.libre;
  const tasks = store.get.tasksByProject(p.id);
  const done = tasks.filter(t => t.status === 'Terminado').length;
  const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const cycles = store.get.cyclesByProject(p.id);
  const decisions = store.get.decisionsByProject(p.id);

  root.innerHTML = `
    <div class="view-inner">
      <div style="margin-bottom:16px;">
        <a href="#/projects" class="btn btn-ghost btn-sm" style="gap:4px;"><i data-feather="arrow-left"></i> Proyectos</a>
      </div>

      <div style="display:flex; align-items:center; gap:14px; margin-bottom:24px;">
        <div class="project-icon" style="--project-color:${p.color || meta.color}; width:44px; height:44px; border-radius:10px;">
          <i data-feather="${meta.icon}" style="width:22px;height:22px;"></i>
        </div>
        <div style="flex:1;">
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
            <h1 style="font-size:1.4rem;font-weight:700;letter-spacing:-0.02em;">${esc(p.name)}</h1>
            ${statusBadge(p.status)}
            <button class="btn btn-ghost btn-xs" id="edit-project-btn" style="margin-left:auto; padding:2px 8px; font-size:0.7rem;">
               <i data-feather="edit-2" style="width:11px;height:11px;"></i> Editar
            </button>
          </div>
          ${p.goal ? `<p style="color:var(--text-secondary);font-size:0.85rem;margin-top:3px;">${esc(p.goal)}</p>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.5rem;font-weight:700;color:${p.color || meta.color};">${pct}%</div>
          <div style="font-size:0.72rem;color:var(--text-muted);">${done}/${tasks.length} tareas</div>
          <div class="progress-bar" style="margin-top:6px; width:120px;"><div class="progress-fill" style="width:${pct}%;"></div></div>
        </div>
      </div>

      <div class="tabs" id="proj-tabs">
        <button class="tab-btn active" data-tab="overview">Resumen</button>
        <button class="tab-btn" data-tab="tasks">Tareas (${tasks.length})</button>
        <button class="tab-btn" data-tab="cycles">Ciclos (${cycles.length})</button>
        <button class="tab-btn" data-tab="document">Documento</button>
        <button class="tab-btn" data-tab="decisions">Decisiones (${decisions.length})</button>
      </div>

      <div id="proj-tab-content"></div>
    </div>`;

  feather.replace();
  showProjectTab(root, p, 'overview');

  root.querySelector('#edit-project-btn')?.addEventListener('click', () => openProjectModal(p));

  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showProjectTab(root, p, btn.dataset.tab);
    });
  });
}

function showProjectTab(root, p, tab) {
  const content = root.querySelector('#proj-tab-content');
  const tasks = store.get.tasksByProject(p.id);
  const cycles = store.get.cyclesByProject(p.id);
  const decisions = store.get.decisionsByProject(p.id);

  if (tab === 'overview') {
    let extCard = '';
    if (p.obsidianUri) {
      const isZotero = p.obsidianUri.startsWith('zotero://');
      const icon = isZotero ? 'book' : 'external-link';
      const title = isZotero ? 'Conexión con Zotero' : 'Conexión Ext (Obsidian/Local)';
      const btnText = isZotero ? 'Abrir en Zotero' : `Abrir: ${esc(getObsidianFileName(p.obsidianUri))}`;

      extCard = `
      <div class="card glass-panel" style="margin-top:20px; grid-column: span 2;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3>${title}</h3>
          <a href="${p.obsidianUri}" class="btn btn-secondary btn-sm" style="gap:6px;">
            <i data-feather="${icon}"></i> ${btnText}
          </a>
        </div>
      </div>`;
    }

    const thoughts = p.thoughts || [];

    content.innerHTML = `
      <div class="two-col-grid">
        <div class="card glass-panel">
          <div class="card-header"><h3>Detalles</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
            ${detailRow('Tipo', esc(PROJECT_TYPES[p.type]?.label || p.type))}
            ${detailRow('Estado', statusBadge(p.status))}
            ${p.startDate ? detailRow('Inicio', fmtDate(p.startDate)) : ''}
            ${p.endDate ? detailRow('Fin', fmtDate(p.endDate)) : ''}
          </div>
        </div>
        <div class="card glass-panel">
          <div class="card-header"><h3>Progreso</h3></div>
          <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
            ${detailRow('Total tareas', tasks.length)}
            ${detailRow('Terminadas', tasks.filter(t => t.status === 'Terminado').length)}
            ${detailRow('En elaboración', tasks.filter(t => t.status === 'En elaboración').length)}
            ${detailRow('Bloqueadas', tasks.filter(t => t.status === 'En espera').length)}
          </div>
        </div>

        <div class="card glass-panel" style="grid-column: span 2;">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3>Pensamientos y Notas Rápidas</h3>
            <span style="font-size:0.7rem; color:var(--text-muted);">${thoughts.length} pensamientos</span>
          </div>
          <div class="card-body">
            <div style="display:flex; gap:8px; margin-bottom:16px;">
              <input type="text" class="form-input" id="new-thought-input" placeholder="¿Qué estás pensando sobre este proyecto?">
              <button class="btn btn-primary" id="add-thought-btn"><i data-feather="plus"></i></button>
            </div>
            <div id="thoughts-list" style="display:flex; flex-direction:column; gap:12px;">
              ${thoughts.length ? thoughts.sort((a, b) => b.ts - a.ts).map(t => `
                <div style="padding:10px; background:var(--bg-surface-2); border-radius:var(--radius-sm); border-left:3px solid var(--accent-primary);">
                  <div style="font-size:0.86rem; line-height:1.4;">${esc(t.text)}</div>
                  <div style="font-size:0.68rem; color:var(--text-muted); margin-top:6px; display:flex; justify-content:space-between;">
                    <span>${new Date(t.ts).toLocaleString()}</span>
                    <button class="btn-text del-thought-btn" data-ts="${t.ts}" style="color:var(--accent-danger); font-size:0.65rem;">Eliminar</button>
                  </div>
                </div>
              `).join('') : '<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:20px;">No has capturado pensamientos aún.</div>'}
            </div>
          </div>
        </div>

        ${extCard}
      </div>`;

    feather.replace();

    const thoughtBtn = content.querySelector('#add-thought-btn');
    const thoughtInput = content.querySelector('#new-thought-input');

    const addThoughtFn = async () => {
      const text = thoughtInput.value.trim();
      if (!text) return;
      const newThought = { text, ts: Date.now() };
      const updatedThoughts = [newThought, ...(p.thoughts || [])];
      await store.dispatch('UPDATE_PROJECT', { id: p.id, thoughts: updatedThoughts });
      showProjectTab(root, p, 'overview');
    };

    thoughtBtn?.addEventListener('click', addThoughtFn);
    thoughtInput?.addEventListener('keypress', e => { if (e.key === 'Enter') addThoughtFn(); });

    content.querySelectorAll('.del-thought-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ts = parseInt(btn.dataset.ts);
        const updatedThoughts = (p.thoughts || []).filter(t => t.ts !== ts);
        await store.dispatch('UPDATE_PROJECT', { id: p.id, thoughts: updatedThoughts });
        showProjectTab(root, p, 'overview');
      });
    });
  } else if (tab === 'tasks') {
    content.innerHTML = `
      <div style="margin-bottom:12px; display:flex; justify-content:flex-end;">
        <button class="btn btn-primary btn-sm" id="proj-new-task-btn"><i data-feather="plus"></i> Nueva tarea</button>
      </div>
      <ul class="task-list">${tasks.length ? tasks.map(t => taskItem(t)).join('') : emptyState('check-square', 'Sin tareas aún.')}</ul>`;
    feather.replace();
    bindTaskCheckboxes(content);
    content.querySelector('#proj-new-task-btn')?.addEventListener('click', () => openTaskModal(p.id));
  } else if (tab === 'cycles') {
    content.innerHTML = `
      <div style="margin-bottom:12px; display:flex; justify-content:flex-end;">
        <button class="btn btn-primary btn-sm" id="proj-new-cycle-btn"><i data-feather="plus"></i> Nuevo ciclo</button>
      </div>
      <div class="cycles-grid">${cycles.length ? cycles.map(c => cycleCard(c)).join('') : emptyState('refresh-cw', 'Sin ciclos.')}</div>`;
    feather.replace();
    content.querySelector('#proj-new-cycle-btn')?.addEventListener('click', () => openCycleModal(p.id));
  } else if (tab === 'document') {
    renderDocumentView(content, { projectId: p.id });
    return;
  } else if (tab === 'decisions') {
    content.innerHTML = `
      <div style="margin-bottom:12px; display:flex; justify-content:flex-end;">
        <button class="btn btn-primary btn-sm" id="proj-new-dec-btn"><i data-feather="plus"></i> Nueva decisión</button>
      </div>
      <div class="decisions-list">${decisions.length ? decisions.map(d => decisionCard(d)).join('') : emptyState('zap', 'Sin decisiones.')}</div>`;
    feather.replace();
    content.querySelector('#proj-new-dec-btn')?.addEventListener('click', () => openDecisionModal(p.id));
  }

  feather.replace();
  bindTaskCheckboxes(content);
}

function detailRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;border-bottom:1px solid var(--border-color);padding-bottom:8px;">
    <span style="color:var(--text-muted);">${label}</span>
    <span style="font-weight:500;">${value}</span>
  </div>`;
}
