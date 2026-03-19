/**
 * views/projects.js — Projects list + detail view
 */


function renderProjects(root, params) {
  const projects = store.get.projects();
  const currentView = localStorage.getItem('projects_view_mode') || 'grid';

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

      <div style="display:flex; gap:16px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
        <div class="filter-bar" style="flex:1; display:flex; gap:8px;">
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
        <div class="view-switcher" style="background:var(--bg-surface-2); padding:4px; border-radius:8px; display:flex; gap:4px;">
          <button class="btn btn-xs ${currentView === 'grid' ? 'btn-primary' : 'btn-ghost'}" id="view-grid-btn" title="Vista de cuadrícula"><i data-feather="grid" style="width:14px;"></i></button>
          <button class="btn btn-xs ${currentView === 'kanban' ? 'btn-primary' : 'btn-ghost'}" id="view-kanban-btn" title="Vista Kanban"><i data-feather="trello" style="width:14px;"></i></button>
          <button class="btn btn-xs ${currentView === 'calendar' ? 'btn-primary' : 'btn-ghost'}" id="view-calendar-btn" title="Vista Calendario"><i data-feather="calendar" style="width:14px;"></i></button>
        </div>
      </div>

      <div id="projects-container">
        ${renderProjectsByView(projects, currentView)}
      </div>
    </div>`;

  feather.replace();

  root.querySelector('#new-project-btn').addEventListener('click', () => openProjectModal());

  root.querySelector('#view-grid-btn').addEventListener('click', () => {
    localStorage.setItem('projects_view_mode', 'grid');
    renderProjects(root, params);
  });
  root.querySelector('#view-kanban-btn').addEventListener('click', () => {
    localStorage.setItem('projects_view_mode', 'kanban');
    renderProjects(root, params);
  });
  root.querySelector('#view-calendar-btn').addEventListener('click', () => {
    localStorage.setItem('projects_view_mode', 'calendar');
    renderProjects(root, params);
  });

  ['proj-filter-status', 'proj-filter-type'].forEach(id => {
    root.querySelector(`#${id}`).addEventListener('change', () => {
      const status = root.querySelector('#proj-filter-status').value;
      const type = root.querySelector('#proj-filter-type').value;
      let filtered = store.get.projects();
      if (status) filtered = filtered.filter(p => p.status === status);
      if (type) filtered = filtered.filter(p => p.type === type);
      const container = root.querySelector('#projects-container');
      container.innerHTML = renderProjectsByView(filtered, currentView);
      feather.replace();
      bindProjectCards(root);
    });
  });

  bindProjectCards(root);
}

function renderProjectsByView(projects, view) {
  if (view === 'kanban') return renderProjectsKanban(projects);
  if (view === 'calendar') return renderProjectsCalendar(projects);
  return `<div class="projects-grid animate-cascade">${renderProjectCards(projects)}</div>`;
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
      <div class="project-card playful-pop" style="--project-color:${p.color || meta.color}; border-radius:var(--radius-xl); box-shadow: 0 8px 16px color-mix(in srgb, ${p.color || meta.color} 10%, transparent);" data-project-id="${p.id}">
        <div class="project-card-top">
          <div class="project-icon" style="--project-color:${p.color || meta.color}; border-radius:var(--shape-md);">
            <i data-feather="${meta.icon}"></i>
          </div>
          <div style="display:flex; gap:4px;">
            <span class="badge ${p.ownerId === getCurrentWorkspaceUser().memberId ? 'badge-primary' : 'badge-neutral'}" style="font-size:0.6rem; border-radius:10px;">
              ${p.ownerId === getCurrentWorkspaceUser().memberId ? 'Tuyo ✨' : 'Equipo 👥'}
            </span>
            <span class="badge badge-neutral" style="font-size:0.6rem; border-radius:10px;">${meta.label}</span>
          </div>
        </div>
        <div>
          <div class="project-card-name" style="font-weight:700; font-size:1.05rem;">
            ${p.visibility === 'local' ? '<i data-feather="lock" style="width:14px;height:14px;margin-right:4px;"></i>' : '<i data-feather="cloud" style="width:14px;height:14px;margin-right:4px;"></i>'}
            ${esc(p.name)}
          </div>
          ${p.goal ? `<div class="project-card-goal" style="margin-top:6px; font-style:italic; opacity:0.8;">${esc(p.goal)}</div>` : ''}
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px; font-weight:600;">
            <span>${done}/${tasks.length} completadas</span><span>${pct}%</span>
          </div>
          <div class="progress-bar" style="height:6px; border-radius:10px;"><div class="progress-fill" style="width:${pct}%; border-radius:10px; background:var(--project-color); box-shadow: 0 0 8px var(--project-color);"></div></div>
        </div>
        <div class="project-card-meta">
          ${cycle ? `<span style="display:flex; align-items:center; gap:4px;"><i data-feather="refresh-cw" style="width:11px;"></i> ${esc(cycle.name)}</span>` : ''}
          ${p.status === 'activo' ? '<span class="badge badge-success" style="padding:2px 8px; font-size:0.65rem;">En marcha 🚀</span>' : statusBadge(p.status)}
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
        <button class="tab-btn" data-tab="discussions">Discusión</button>
        <button class="tab-btn" data-tab="reports">Reportes</button>
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
            <div id="thoughts-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">
              ${thoughts.length ? thoughts.sort((a, b) => b.ts - a.ts).map(t => {
                const rotation = (Math.random() * 4 - 2).toFixed(1);
                return `
                <div class="playful-pop" style="padding:16px; background:var(--bg-surface-2); border-radius:var(--radius-md); border-top:4px solid var(--accent-primary); transform: rotate(${rotation}deg); box-shadow: var(--shadow-md); transition: transform 0.2s var(--ease);">
                  <div style="font-size:0.9rem; line-height:1.5; color:var(--text-primary);">${esc(t.text)}</div>
                  <div style="font-size:0.65rem; color:var(--text-muted); margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
                    <span>${fmtDate(t.ts)}</span>
                    <button class="btn-text del-thought-btn" data-ts="${t.ts}" style="color:var(--accent-danger); font-weight:700;">Borrar</button>
                  </div>
                </div>
              `}).join('') : '<div style="grid-column: 1/-1; font-size:0.8rem; color:var(--text-muted); text-align:center; padding:20px;">No hay notas aún. ¡Captura lo que piensas! 💡</div>'}
            </div>
          </div>
        </div>

        ${extCard}

        <div class="card glass-panel" style="grid-column: span 2;">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="display:flex;align-items:center;gap:6px;"><i data-feather="hard-drive" style="width:16px;height:16px;"></i> Archivos de Google Drive</h3>
            <button class="btn btn-secondary btn-sm" id="btn-add-drive-file"><i data-feather="plus"></i> Agregar archivo</button>
          </div>
          <div class="card-body" id="drive-files-list">
            ${renderDriveFilesList(p.driveFiles || [])}
          </div>
        </div>
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

    content.querySelector('#btn-add-drive-file')?.addEventListener('click', () => openDriveFilePicker(p, content));
    bindDriveFileDeleteBtns(content, p);

    content.querySelectorAll('.del-thought-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ts = parseInt(btn.dataset.ts, 10);
        const updatedThoughts = (p.thoughts || []).filter(t => t.ts !== ts);
        await store.dispatch('UPDATE_PROJECT', { id: p.id, thoughts: updatedThoughts });
        showProjectTab(root, p, 'overview');
      });
    });
  } else if (tab === 'tasks') {
    const view = content.dataset.view || 'list';
    content.innerHTML = `
      <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
        <div class="view-switcher" style="background:var(--bg-surface-2); padding:4px; border-radius:8px; display:flex; gap:4px;">
          <button class="btn btn-xs ${view === 'list' ? 'btn-primary' : 'btn-ghost'}" id="view-list-btn" title="Lista"><i data-feather="list" style="width:14px;"></i></button>
          <button class="btn btn-xs ${view === 'board' ? 'btn-primary' : 'btn-ghost'}" id="view-board-btn" title="Tablero"><i data-feather="trello" style="width:14px;"></i></button>
        </div>
        <button class="btn btn-primary btn-sm" id="proj-new-task-btn"><i data-feather="plus"></i> Nueva tarea</button>
      </div>
      <div id="tasks-container">
        ${view === 'list'
        ? `<ul class="task-list">${tasks.length ? tasks.map(t => taskItem(t)).join('') : emptyState('check-square', 'Sin tareas aún.')}</ul>`
        : renderKanban(tasks)
      }
      </div>`;

    feather.replace();

    content.querySelector('#view-list-btn').onclick = () => { content.dataset.view = 'list'; showProjectTab(root, p, 'tasks'); };
    content.querySelector('#view-board-btn').onclick = () => { content.dataset.view = 'board'; showProjectTab(root, p, 'tasks'); };

    bindTaskCheckboxes(content);
    content.querySelector('#proj-new-task-btn')?.addEventListener('click', () => openTaskModal(p.id));
  } else if (tab === 'cycles') {
    content.innerHTML = `
      <div style="margin-bottom:12px; display:flex; justify-content:flex-end;">
        <button class="btn btn-primary btn-sm" id="proj-new-cycle-btn"><i data-feather="plus"></i> Nuevo ciclo</button>
      </div>
      <div class="cycles-grid animate-cascade">${cycles.length ? cycles.map(c => cycleCard(c)).join('') : emptyState('refresh-cw', 'Sin ciclos.')}</div>`;
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
  } else if (tab === 'discussions') {
    const messages = store.get.messagesByProject(p.id).sort((a, b) => a.timestamp - b.timestamp);
    content.innerHTML = `
      <div class="chat-container card glass-panel" style="display:flex; flex-direction:column; height:500px;">
        <div class="chat-messages" id="chat-messages" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:12px;">
          ${messages.length ? messages.map(m => `
            <div class="chat-msg ${m.from === 'me' ? 'msg-me' : 'msg-other'}" style="max-width:80%; align-self: ${m.from === 'me' ? 'flex-end' : 'flex-start'};">
              <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:4px; text-align:${m.from === 'me' ? 'right' : 'left'};">
                ${esc(m.author || 'Autor')} • ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style="padding:10px 14px; border-radius:12px; background: ${m.from === 'me' ? 'var(--accent-primary)' : 'var(--bg-surface-2)'}; color: ${m.from === 'me' ? '#fff' : 'var(--text-primary)'}; font-size:0.88rem; line-height:1.4;">
                ${esc(m.text)}
              </div>
            </div>
          `).join('') : '<div style="text-align:center; color:var(--text-muted); margin-top:40px;">No hay mensajes aún. Inicia la conversación.</div>'}
        </div>
        <div class="chat-input-wrap" style="padding:16px; border-top:1px solid var(--border-color); display:flex; gap:10px;">
          <input type="text" class="form-input" id="chat-input" placeholder="Escribe un mensaje..." style="flex:1;">
          <button class="btn btn-primary" id="chat-send"><i data-feather="send"></i></button>
        </div>
      </div>
    `;
    feather.replace();
    const chatMsgScroll = content.querySelector('#chat-messages');
    chatMsgScroll.scrollTop = chatMsgScroll.scrollHeight;

    const sendMsg = async () => {
      const input = content.querySelector('#chat-input');
      const text = input.value.trim();
      if (!text) return;
      await store.dispatch('ADD_MESSAGE', {
        projectId: p.id,
        text,
        author: getCurrentWorkspaceActor().label,
        from: 'me'
      });
      input.value = '';
      showProjectTab(root, p, 'discussions');
    };

    content.querySelector('#chat-send').onclick = sendMsg;
    content.querySelector('#chat-input').onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };
  } else if (tab === 'reports') {
    content.innerHTML = `
        <div class="reports-view" style="display:flex; flex-direction:column; gap:20px;">
          <div class="card glass-panel" style="padding:20px; border-radius:12px; border:1px solid var(--border-color); background:var(--bg-surface-2);">
            <h3 style="font-size:1rem; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
              <i data-feather="zap" style="width:18px;"></i> Reportes con IA
            </h3>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:16px;">
              <button class="btn btn-secondary btn-sm" id="btn-summarize-project" style="justify-content:center; gap:8px; display:flex; align-items:center;"><i data-feather="zap" style="width:14px;"></i> Resumir proyecto</button>
              <button class="btn btn-secondary btn-sm" id="btn-suggest-tasks" style="justify-content:center; gap:8px; display:flex; align-items:center;"><i data-feather="help-circle" style="width:14px;"></i> Sugerir tareas</button>
              <button class="btn btn-secondary btn-sm" id="btn-generate-report" style="justify-content:center; gap:8px; display:flex; align-items:center;"><i data-feather="file-text" style="width:14px;"></i> Generar reporte</button>
            </div>
            <div id="ai-results" style="min-height:80px; padding:12px; background:var(--bg-card); border-radius:8px; border:1px solid var(--border-color); font-size:0.85rem; line-height:1.5;"></div>
          </div>

          <div class="card glass-panel" style="padding:20px; border-radius:12px; border:1px solid var(--border-color); background:var(--bg-surface-2);">
            <h3 style="font-size:1rem; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
              <i data-feather="terminal" style="width:18px;"></i> Dataview-Lite
            </h3>
            <textarea id="report-query" class="form-textarea" style="font-family:monospace; min-height:80px; font-size:0.85rem; border:1px solid var(--border-color); background:var(--bg-card); margin-bottom:15px;" placeholder="LIST TAREAS"></textarea>
            <button class="btn btn-primary" id="btn-run-report" style="width:100%;">Ejecutar</button>
          </div>
          <div id="report-results" style="margin-top:0;"></div>
        </div>
      `;
    feather.replace();

    const aiResults = content.querySelector('#ai-results');

    content.querySelector('#btn-summarize-project').onclick = async () => {
      aiResults.innerHTML = '<div style="color:var(--text-muted); text-align:center;"><i data-feather="loader"></i> Resumiendo proyecto...</div>';
      feather.replace();
      try {
        const tasks = store.get.tasksByProject(p.id);
        const summary = await window.ollamaApi.summarizeProject(p, tasks);
        aiResults.innerHTML = `<div style="color:var(--text-primary);">${esc(summary)}</div>
          <button class="btn btn-ghost btn-xs" id="copy-summary" style="margin-top:12px; float:right;"><i data-feather="copy"></i> Copiar</button>`;
        feather.replace();
        content.querySelector('#copy-summary')?.addEventListener('click', () => {
          navigator.clipboard.writeText(summary);
          showToast('Resumen copiado al portapapeles.', 'success');
        });
      } catch (e) {
        aiResults.innerHTML = `<div style="color:var(--accent-danger);">Error: ${esc(e.message)}</div>`;
      }
    };

    content.querySelector('#btn-suggest-tasks').onclick = async () => {
      aiResults.innerHTML = '<div style="color:var(--text-muted); text-align:center;"><i data-feather="loader"></i> Generando sugerencias...</div>';
      feather.replace();
      try {
        const suggestions = await window.ollamaApi.suggestTasks(p);
        aiResults.innerHTML = `<div style="color:var(--text-primary); margin-bottom:12px;"><strong>Tareas sugeridas:</strong></div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${suggestions.map((t, i) => `<div style="display:flex; align-items:center; gap:8px; padding:8px; background:var(--bg-surface-2); border-radius:6px; border-left:3px solid var(--accent-primary);">
              <input type="checkbox" id="suggest-${i}" class="suggest-task-cb" data-task="${esc(t)}" style="flex-shrink:0;">
              <label for="suggest-${i}" style="flex:1; cursor:pointer;">${esc(t)}</label>
            </div>`).join('')}
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-suggested" style="margin-top:12px;">Agregar seleccionadas</button>`;
        feather.replace();
        content.querySelector('#btn-add-suggested')?.addEventListener('click', async () => {
          const selected = Array.from(content.querySelectorAll('.suggest-task-cb:checked')).map(cb => cb.dataset.task);
          for (const title of selected) {
            await store.dispatch('ADD_TASK', {
              projectId: p.id,
              title,
              status: 'Capturado',
              priority: 'media',
              visibility: 'shared'
            });
          }
          showToast(`${selected.length} tarea${selected.length !== 1 ? 's' : ''} agregada${selected.length !== 1 ? 's' : ''}.`, 'success');
          showProjectTab(root, p, 'tasks');
        });
      } catch (e) {
        aiResults.innerHTML = `<div style="color:var(--accent-danger);">Error: ${esc(e.message)}</div>`;
      }
    };

    content.querySelector('#btn-generate-report').onclick = async () => {
      aiResults.innerHTML = '<div style="color:var(--text-muted); text-align:center;"><i data-feather="loader"></i> Generando reporte...</div>';
      feather.replace();
      try {
        const logs = store.get.logsByProject?.(p.id) || [];
        const report = await window.ollamaApi.generateProjectReport(p, logs, 'month');
        aiResults.innerHTML = `<div style="color:var(--text-primary); white-space:pre-wrap; line-height:1.6;">${esc(report)}</div>
          <button class="btn btn-ghost btn-xs" id="copy-report" style="margin-top:12px; float:right;"><i data-feather="copy"></i> Copiar</button>
          <button class="btn btn-ghost btn-xs" id="download-report" style="margin-top:12px; float:right; margin-right:8px;"><i data-feather="download"></i> Descargar</button>`;
        feather.replace();
        content.querySelector('#copy-report')?.addEventListener('click', () => {
          navigator.clipboard.writeText(report);
          showToast('Reporte copiado al portapapeles.', 'success');
        });
        content.querySelector('#download-report')?.addEventListener('click', () => {
          const blob = new Blob([report], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `reporte-${p.name.slugify()}-${new Date().toISOString().split('T')[0]}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        });
      } catch (e) {
        aiResults.innerHTML = `<div style="color:var(--accent-danger);">Error: ${esc(e.message)}</div>`;
      }
    };

    content.querySelector('#btn-run-report').onclick = () => {
      const q = content.querySelector('#report-query').value.trim().toUpperCase();
      if (q === 'LIST TAREAS') {
        const tasks = store.get.tasksByProject(p.id);
        content.querySelector('#report-results').innerHTML = `
                <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
                  <thead><tr style="background:var(--bg-surface-2); text-align:left;"><th style="padding:10px;">Tarea</th><th style="padding:10px;">Estado</th></tr></thead>
                  <tbody>${tasks.map(t => `<tr style="border-top:1px solid var(--border-color);"><td style="padding:10px;">${esc(t.title)}</td><td style="padding:10px;">${esc(t.status)}</td></tr>`).join('')}</tbody>
                </table>`;
      } else {
        content.querySelector('#report-results').innerHTML = `<div class="alert alert-warning">Prueba "LIST TAREAS".</div>`;
      }
    };
  }

  feather.replace();
  bindTaskCheckboxes(content);
}

function renderProjectsKanban(projects) {
  if (!projects.length) return emptyState('briefcase', 'No hay proyectos.');
  const statuses = ['activo', 'planificado', 'pausado', 'archivado'];
  const statusLabels = { activo: 'Activo', planificado: 'Planificado', pausado: 'Pausado', archivado: 'Archivado' };
  const statusColors = { activo: '#22c55e', planificado: '#3b82f6', pausado: '#f59e0b', archivado: '#4b5563' };

  return `
    <div class="kanban-board" style="display:flex; gap:16px; overflow-x:auto; padding-bottom:12px;">
      ${statuses.map(status => {
    const statusProjects = projects.filter(p => (p.status || 'activo') === status);
    return `
          <div class="kanban-column" style="flex:0 0 320px; background:var(--bg-surface-2); border-radius:12px; display:flex; flex-direction:column; max-height:600px;">
            <div style="padding:12px; display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid ${statusColors[status]}; border-bottom-style: solid;">
              <h4 style="font-size:0.8rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">${statusLabels[status]}</h4>
              <span class="badge badge-neutral" style="font-size:0.65rem;">${statusProjects.length}</span>
            </div>
            <div class="kanban-items" style="flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:10px;">
              ${statusProjects.length ? statusProjects.map(p => {
        const meta = PROJECT_TYPES[p.type] || PROJECT_TYPES.libre;
        const tasks = store.get.tasksByProject(p.id);
        const done = tasks.filter(t => t.status === 'Terminado').length;
        const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
        return `
                <div class="card kanban-card" style="padding:12px; cursor:pointer; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; box-shadow:var(--shadow-sm);" onclick="router.navigate('/project/${p.id}')">
                  <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                    <i data-feather="${meta.icon}" style="width:14px;height:14px; color:${p.color || meta.color};"></i>
                    <div style="font-size:0.85rem; font-weight:600; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.name)}</div>
                  </div>
                  <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:8px;">${esc(meta.label)}</div>
                  <div style="font-size:0.68rem; color:var(--text-muted); margin-bottom:6px;">${done}/${tasks.length} tareas</div>
                  <div class="progress-bar" style="height:4px;"><div class="progress-fill" style="width:${pct}%;"></div></div>
                </div>
              `;
      }).join('') : '<div style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:20px;">Sin proyectos</div>'}
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
}

function renderProjectsCalendar(projects) {
  if (!projects.length) return emptyState('briefcase', 'No hay proyectos.');
  const projectsWithDate = projects.filter(p => p.endDate);

  // Get current month/year
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  return `
    <div style="background:var(--bg-surface-2); border-radius:12px; padding:20px;">
      <div style="margin-bottom:16px;">
        <h3 style="font-size:0.95rem; font-weight:600; color:var(--text-primary);">
          ${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][month]} ${year}
        </h3>
      </div>
      <div class="calendar-grid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:8px;">
        ${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => `<div style="text-align:center; font-size:0.7rem; font-weight:700; color:var(--text-muted); padding-bottom:8px; text-transform:uppercase;">${d}</div>`).join('')}
        ${Array.from({ length: 42 }).map((_, i) => {
          const currentDate = new Date(startDate);
          currentDate.setDate(currentDate.getDate() + i);
          const isCurrentMonth = currentDate.getMonth() === month;
          const dayNum = currentDate.getDate();
          const dayProjects = projectsWithDate.filter(p => {
            const pDate = new Date(p.endDate);
            return pDate.toDateString() === currentDate.toDateString();
          });

          const bgColor = isCurrentMonth ? 'var(--bg-card)' : 'var(--bg-surface-3)';
          const textColor = isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)';
          const borderColor = dayProjects.length ? 'var(--accent-primary)' : 'var(--border-color)';

          return `
            <div style="min-height:100px; background:${bgColor}; border-radius:8px; padding:8px; border:1px solid ${borderColor}; opacity:${isCurrentMonth ? '1' : '0.5'}; display:flex; flex-direction:column;">
              <div style="font-size:0.75rem; font-weight:600; color:${textColor}; margin-bottom:6px;">${dayNum}</div>
              <div style="flex:1; display:flex; flex-direction:column; gap:3px; overflow:hidden;">
                ${dayProjects.slice(0, 3).map(p => {
                  const meta = PROJECT_TYPES[p.type] || PROJECT_TYPES.libre;
                  return `<div style="font-size:0.6rem; background:${p.color || meta.color}; color:#fff; padding:2px 4px; border-radius:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;" title="${esc(p.name)}" onclick="router.navigate('/project/${p.id}')">${esc(p.name.substring(0, 12))}</div>`;
                }).join('')}
                ${dayProjects.length > 3 ? `<div style="font-size:0.55rem; color:var(--text-muted);">+${dayProjects.length - 3} más</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderKanban(tasks) {
  const statuses = ['Capturado', 'En elaboración', 'En espera', 'Terminado'];
  return `
    <div class="kanban-board" style="display:flex; gap:16px; overflow-x:auto; padding-bottom:12px;">
      ${statuses.map(status => {
    const statusTasks = tasks.filter(t => t.status === status);
    return `
          <div class="kanban-column" style="flex:0 0 280px; background:var(--bg-surface-2); border-radius:12px; display:flex; flex-direction:column; max-height:600px;">
            <div style="padding:12px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color);">
              <h4 style="font-size:0.8rem; text-transform:uppercase; color:var(--text-muted); font-weight:700;">${status}</h4>
              <span class="badge badge-neutral" style="font-size:0.65rem;">${statusTasks.length}</span>
            </div>
            <div class="kanban-items" style="flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:10px;">
              ${statusTasks.map(t => `
                <div class="card kanban-card" style="padding:12px; cursor:pointer; background:var(--bg-card); border:1px solid var(--border-color); border-radius:8px; box-shadow:var(--shadow-sm);" onclick="openTaskModal('${t.projectId}', '${t.id}')">
                  <div style="font-size:0.88rem; font-weight:500; margin-bottom:8px;">${esc(t.title)}</div>
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:var(--text-muted);">
                    <span>${t.priority}</span>
                    ${t.dueDate ? `<span><i data-feather="calendar" style="width:10px;height:10px;"></i> ${fmtDate(t.dueDate)}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;
}

function renderCalendar(tasks) {
  const tasksWithDate = tasks.filter(t => t.dueDate);
  return `
    <div class="calendar-mini-grid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:8px;">
      ${['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => `<div style="text-align:center; font-size:0.7rem; font-weight:700; color:var(--text-muted); padding-bottom:8px;">${d}</div>`).join('')}
      ${Array.from({ length: 31 }).map((_, i) => {
    const day = i + 1;
    // Simple mock: just showing tasks for "this month" in a list
    const dayTasks = tasksWithDate.filter(t => new Date(t.dueDate).getDate() === day);
    return `
          <div style="min-height:80px; background:var(--bg-surface-2); border-radius:8px; padding:6px; border:1px solid ${dayTasks.length ? 'var(--accent-primary)' : 'var(--border-color)'}">
            <div style="font-size:0.65rem; margin-bottom:4px; opacity:0.6;">${day}</div>
            ${dayTasks.map(t => `<div style="font-size:0.6rem; background:var(--accent-primary); color:#fff; padding:2px 4px; border-radius:4px; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(t.title)}">${esc(t.title)}</div>`).join('')}
          </div>
        `;
  }).join('')}
    </div>
  `;
}

function detailRow(label, value) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.84rem;border-bottom:1px solid var(--border-color);padding-bottom:8px;">
    <span style="color:var(--text-muted);">${label}</span>
    <span style="font-weight:500;">${value}</span>
  </div>`;
}

function renderDriveFilesList(files) {
  if (!files || files.length === 0) {
    return `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px;">No hay archivos vinculados. Agrega un enlace de Google Drive.</div>`;
  }
  return `<div style="display:flex; flex-direction:column; gap:8px;">
    ${files.map(f => `
      <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:var(--bg-surface-2); border-radius:8px; border:1px solid var(--border-color);">
        <i data-feather="${getDriveFileIcon(f.mimeType)}" style="width:16px;height:16px;flex-shrink:0;color:var(--accent-primary);"></i>
        <a href="${esc(f.url)}" target="_blank" rel="noopener" style="flex:1; font-size:0.85rem; font-weight:500; color:var(--text-primary); text-decoration:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(f.name)}">${esc(f.name)}</a>
        <span style="font-size:0.68rem; color:var(--text-muted); flex-shrink:0;">${f.addedAt ? new Date(f.addedAt).toLocaleDateString('es-MX', { day:'2-digit', month:'short' }) : ''}</span>
        <button class="btn btn-icon btn-sm del-drive-file-btn" data-fileid="${esc(f.id)}" title="Quitar enlace" style="flex-shrink:0;"><i data-feather="x" style="width:12px;height:12px;"></i></button>
      </div>
    `).join('')}
  </div>`;
}

function getDriveFileIcon(mimeType) {
  if (!mimeType) return 'file';
  if (mimeType.includes('folder')) return 'folder';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'grid';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'file-text';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'monitor';
  if (mimeType.includes('pdf')) return 'file';
  if (mimeType.includes('image')) return 'image';
  if (mimeType.includes('video')) return 'video';
  if (mimeType.includes('audio')) return 'music';
  return 'file';
}

async function openDriveFilePicker(p, root) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:580px;">
      <div class="modal-header">
        <h2><i data-feather="hard-drive"></i> Vincular archivo de Google Drive</h2>
        <button class="btn btn-icon" id="drivepicker-close"><i data-feather="x"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group" style="padding:12px; background:var(--bg-surface-2); border-radius:8px; margin-bottom:16px;">
          <h3 style="margin:0 0 10px 0; font-size:0.9rem;">Pegar enlace manualmente</h3>
          <div style="display:flex; gap:8px;">
            <input class="form-input" id="drive-manual-url" placeholder="https://drive.google.com/file/d/..." style="flex:1;">
            <button class="btn btn-primary" id="btn-add-manual-link"><i data-feather="link"></i> Agregar</button>
          </div>
          <p style="font-size:0.72rem; color:var(--text-muted); margin-top:6px;">Acepta cualquier enlace de Google Drive, Docs, Sheets, Slides o carpetas.</p>
        </div>

        <div style="padding:12px; background:var(--bg-surface-2); border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h3 style="margin:0; font-size:0.9rem;">Archivos recientes en tu Drive</h3>
            <button class="btn btn-secondary btn-sm" id="btn-load-drive-files"><i data-feather="refresh-cw" style="width:12px;height:12px;"></i> Cargar</button>
          </div>
          <div id="drive-file-browser" style="max-height:280px; overflow-y:auto;">
            <div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:20px;">Presiona "Cargar" para ver tus archivos recientes. Requiere conexión a Google Drive.</div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  feather.replace();

  overlay.querySelector('#drivepicker-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#btn-add-manual-link').addEventListener('click', async () => {
    const url = overlay.querySelector('#drive-manual-url').value.trim();
    if (!url || !url.startsWith('http')) return showToast('Ingresa un enlace válido de Google Drive.', 'error');

    const name = extractDriveLinkName(url);
    const fileEntry = { id: 'manual-' + Date.now(), name, url, mimeType: '', addedAt: Date.now() };
    const updatedFiles = [...(p.driveFiles || []), fileEntry];
    await store.dispatch('UPDATE_PROJECT', { id: p.id, driveFiles: updatedFiles });
    const updated = store.get.projectById(p.id);
    Object.assign(p, updated);
    if (root) {
      const listEl = root.querySelector('#drive-files-list');
      if (listEl) { listEl.innerHTML = renderDriveFilesList(p.driveFiles || []); feather.replace(); }
      bindDriveFileDeleteBtns(root, p);
    }
    overlay.remove();
    showToast('Archivo vinculado al proyecto.', 'success');
  });

  overlay.querySelector('#btn-load-drive-files').addEventListener('click', async () => {
    const token = window.syncManager?.getAccessToken?.();
    if (!token) {
      overlay.querySelector('#drive-file-browser').innerHTML = `<div style="font-size:0.8rem; color:var(--accent-danger); text-align:center; padding:16px;">No conectado a Google Drive. Abre el panel de Sincronización y conecta tu cuenta primero.</div>`;
      return;
    }
    overlay.querySelector('#drive-file-browser').innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px;"><i data-feather="loader"></i> Cargando archivos...</div>`;
    feather.replace();

    const files = await window.syncManager.listDriveFiles();
    if (!files.length) {
      overlay.querySelector('#drive-file-browser').innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:16px;">No se encontraron archivos o hubo un error al cargar.</div>`;
      return;
    }

    overlay.querySelector('#drive-file-browser').innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        ${files.map(f => `
          <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-card); cursor:pointer;" class="drive-file-row" data-id="${esc(f.id)}" data-name="${esc(f.name)}" data-url="${esc(f.webViewLink || '')}" data-mime="${esc(f.mimeType || '')}">
            <img src="${esc(f.iconLink || '')}" width="18" height="18" alt="" style="flex-shrink:0;" onerror="this.style.display='none'">
            <span style="flex:1; font-size:0.82rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(f.name)}">${esc(f.name)}</span>
            <span style="font-size:0.68rem; color:var(--text-muted); flex-shrink:0;">${esc(f.owners?.[0]?.displayName || '')}</span>
            <button class="btn btn-primary btn-xs" style="flex-shrink:0;">Vincular</button>
          </div>
        `).join('')}
      </div>`;

    overlay.querySelectorAll('.drive-file-row').forEach(row => {
      row.querySelector('button').addEventListener('click', async () => {
        const fileEntry = {
          id: row.dataset.id,
          name: row.dataset.name,
          url: row.dataset.url,
          mimeType: row.dataset.mime,
          addedAt: Date.now()
        };
        const updatedFiles = [...(p.driveFiles || []), fileEntry];
        await store.dispatch('UPDATE_PROJECT', { id: p.id, driveFiles: updatedFiles });
        const updated = store.get.projectById(p.id);
        Object.assign(p, updated);
        if (root) {
          const listEl = root.querySelector('#drive-files-list');
          if (listEl) { listEl.innerHTML = renderDriveFilesList(p.driveFiles || []); feather.replace(); }
          bindDriveFileDeleteBtns(root, p);
        }
        overlay.remove();
        showToast(`"${row.dataset.name}" vinculado al proyecto.`, 'success');
      });
    });
  });
}

function extractDriveLinkName(url) {
  try {
    const u = new URL(url);
    // Try to get a meaningful name from the URL
    const pathParts = u.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && lastPart !== 'edit' && lastPart !== 'view' && !lastPart.match(/^[a-zA-Z0-9-_]{25,}$/)) {
      return decodeURIComponent(lastPart);
    }
    return 'Archivo de Drive';
  } catch {
    return 'Archivo de Drive';
  }
}

function bindDriveFileDeleteBtns(root, p) {
  root.querySelectorAll('.del-drive-file-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fileId = btn.dataset.fileid;
      const updatedFiles = (p.driveFiles || []).filter(f => f.id !== fileId);
      await store.dispatch('UPDATE_PROJECT', { id: p.id, driveFiles: updatedFiles });
      const updated = store.get.projectById(p.id);
      Object.assign(p, updated);
      const listEl = root.querySelector('#drive-files-list');
      if (listEl) { listEl.innerHTML = renderDriveFilesList(p.driveFiles || []); feather.replace(); }
      bindDriveFileDeleteBtns(root, p);
    });
  });
}

window.renderProjects = renderProjects;
window.renderProjectDetail = renderProjectDetail;
