/**
 * views/collaboration.js — Team collaboration diagnostics and protocol guide
 */

function renderCollaboration(root) {
  const members = store.get.members();
  const tasks = store.get.allTasks();
  const messages = store.get.messages ? store.get.messages() : [];

  const currentUser = getCurrentWorkspaceUser();
  const linkedMember = getCurrentWorkspaceMember();

  const now = Date.now();
  const last24h = now - (24 * 60 * 60 * 1000);

  const activityByUser = new Map();

  tasks.forEach(task => {
    if (task.updatedAt && task.updatedAt >= last24h && task.updatedBy) {
      activityByUser.set(task.updatedBy, (activityByUser.get(task.updatedBy) || 0) + 1);
    }
  });

  messages.forEach(msg => {
    if (msg.timestamp && msg.timestamp >= last24h && msg.sender) {
      activityByUser.set(msg.sender, (activityByUser.get(msg.sender) || 0) + 1);
    }
  });

  const activeUsers = Array.from(activityByUser.entries())
    .map(([name, interactions]) => ({ name, interactions }))
    .sort((a, b) => b.interactions - a.interactions);

  const unassignedTasks = tasks.filter(t => !t.assigneeId).length;
  const inReviewTasks = tasks.filter(t => t.status === 'En revisión').length;
  const myTasks = linkedMember ? tasks.filter(t => t.assigneeId === linkedMember.id).length : 0;
  const teamTasks = linkedMember ? tasks.filter(t => t.assigneeId && t.assigneeId !== linkedMember.id).length : tasks.filter(t => t.assigneeId).length;

  const workloadRows = members.map(member => {
    const memberTasks = tasks.filter(t => t.assigneeId === member.id);
    const inProgress = memberTasks.filter(t => t.status !== 'Terminado' && t.status !== 'Archivado').length;
    const done = memberTasks.filter(t => t.status === 'Terminado').length;
    return { member, total: memberTasks.length, inProgress, done };
  }).sort((a, b) => b.inProgress - a.inProgress);

  const recentlyEditedByOthers = tasks
    .filter(task => {
    if (!task.updatedAt || !task.updatedBy) return false;
    if (task.updatedById && task.updatedById === currentUser.identityKey) return false;
    return task.updatedBy !== currentUser.name;
  })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 6);

  const conflictRiskTasks = tasks.filter(task => {
    if (!task.updatedAt || !task.updatedBy) return false;
    if (task.updatedById && task.updatedById === currentUser.identityKey) return false;
    if (!task.updatedById && task.updatedBy === currentUser.name) return false;
    return (now - task.updatedAt) <= (15 * 60 * 1000);
  });

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Colaboración de Equipo</h1>
          <p class="view-subtitle">Claridad operativa sobre asignaciones, protocolos y usuarios activos.</p>
        </div>
      </div>

      <div class="dashboard-grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px;">
        <div class="glass-panel" style="padding:16px;">
          <h3 style="margin-bottom:10px;">Usuario activo</h3>
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="avatar" style="width:42px;height:42px;">${esc(currentUser.avatar)}</div>
            <div>
              <div style="font-weight:600;">${esc(currentUser.name)}</div>
              <div style="font-size:0.82rem;color:var(--text-muted);">${esc(currentUser.role)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${linkedMember ? `Miembro vinculado: ${esc(linkedMember.name)}` : 'Miembro sin vincular'}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${currentUser.email ? esc(currentUser.email) : 'Sin correo de identidad'}</div>
            </div>
          </div>
          <p style="margin:12px 0 0;color:var(--text-muted);font-size:0.8rem;">Este perfil controla la autoría de cambios y mensajes del chat. Recomendación: define correo de identidad en Perfil para mantener continuidad aunque cambies de equipo o dispositivo.</p>
        </div>

        <div class="glass-panel" style="padding:16px;">
          <h3 style="margin-bottom:10px;">Indicadores de coordinación</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="kpi-card" style="padding:10px;">
              <div style="font-size:0.76rem;color:var(--text-muted);">Tareas sin asignar</div>
              <div style="font-size:1.35rem;font-weight:700;">${unassignedTasks}</div>
            </div>
            <div class="kpi-card" style="padding:10px;">
              <div style="font-size:0.76rem;color:var(--text-muted);">En revisión</div>
              <div style="font-size:1.35rem;font-weight:700;">${inReviewTasks}</div>
            </div>
            <div class="kpi-card" style="padding:10px;">
              <div style="font-size:0.76rem;color:var(--text-muted);">Mis tareas</div>
              <div style="font-size:1.35rem;font-weight:700;">${myTasks}</div>
            </div>
            <div class="kpi-card" style="padding:10px;">
              <div style="font-size:0.76rem;color:var(--text-muted);">Tareas del equipo</div>
              <div style="font-size:1.35rem;font-weight:700;">${teamTasks}</div>
            </div>
          </div>
          <p style="margin:12px 0 0;color:var(--text-muted);font-size:0.8rem;">Si hay tareas sin dueño, se recomienda asignarlas desde Backlog, Tablero o formularios médicos.</p>
        </div>
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Cómo distinguir "mío" vs "de todos"</h3>
        <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px; color:var(--text-muted); font-size:0.83rem;">
          <li><b>Mía</b>: la tarea tiene <b>assigneeId</b> igual a tu miembro vinculado.</li>
          <li><b>Equipo</b>: está asignada a otra persona o no está asignada.</li>
          <li>Backlog y Tablero muestran chips "Mía/Equipo" para revisar rápido antes de editar.</li>
        </ul>
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">¿Cómo se asignan protocolos de trabajo?</h3>
        <ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">
          <li>La asignación base se guarda en <b>assigneeId</b> de cada tarea/interconsulta.</li>
          <li>Puedes asignar al crear o editar desde <b>Backlog</b>, <b>Tablero</b> y <b>Panel Médico</b>.</li>
          <li>El usuario activo (perfil inferior izquierdo) define quién aparece como autor en cambios y chat.</li>
          <li>La colaboración diaria se monitorea con actividad reciente (tareas + chat) y registro de actividad.</li>
        </ol>
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Estrategia de sincronización recomendada (PWA)</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
          <div class="kpi-card" style="padding:12px;">
            <div style="font-size:0.78rem;color:var(--text-muted);">Resolución de conflictos</div>
            <div style="font-weight:700;margin-top:4px;">CRDT (Yjs / Automerge)</div>
            <p style="margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);">Ideal para trabajo offline + merge automático al reconectar.</p>
          </div>
          <div class="kpi-card" style="padding:12px;">
            <div style="font-size:0.78rem;color:var(--text-muted);">Presencia</div>
            <div style="font-weight:700;margin-top:4px;">Cursores + "está escribiendo"</div>
            <p style="margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);">Reduce colisiones al editar campos o nodos simultáneos.</p>
          </div>
          <div class="kpi-card" style="padding:12px;">
            <div style="font-size:0.78rem;color:var(--text-muted);">Arquitectura</div>
            <div style="font-weight:700;margin-top:4px;">WebSocket + UI optimista</div>
            <p style="margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);">Actualizar primero en UI/IndexedDB y sincronizar en segundo plano.</p>
          </div>
        </div>
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Semáforo de edición (últimos 15 min)</h3>
        ${conflictRiskTasks.length ? `
          <p style="margin:0 0 10px;color:var(--accent-warning);font-size:0.82rem;">Hay ${conflictRiskTasks.length} tarea(s) editada(s) por otra persona recientemente. Se recomienda avisar por chat antes de editar.</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${conflictRiskTasks.slice(0, 5).map(task => `
              <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border-color);border-radius:10px;padding:8px 10px;">
                <span style="font-size:0.82rem;">${esc(task.title)}</span>
                <span class="badge badge-warning">${esc(task.updatedBy)} · ${timeAgo(task.updatedAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<p style="color:var(--text-muted);margin:0;">Sin riesgo alto de colisión en este momento.</p>`}
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Usuarios activos (últimas 24h)</h3>
        ${activeUsers.length ? `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${activeUsers.map(user => `
              <div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--border-color); border-radius:10px; padding:8px 10px;">
                <span>${esc(user.name)}</span>
                <span class="badge badge-neutral">${user.interactions} actividad(es)</span>
              </div>
            `).join('')}
          </div>
        ` : `<p style="color:var(--text-muted);margin:0;">Sin actividad reciente registrada en tareas o chat.</p>`}
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Últimas tareas tocadas por otros</h3>
        ${recentlyEditedByOthers.length ? `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${recentlyEditedByOthers.map(task => `
              <div style="display:flex;justify-content:space-between;align-items:center;border:1px solid var(--border-color);border-radius:10px;padding:8px 10px;">
                <div style="display:flex;flex-direction:column;gap:2px;">
                  <span style="font-size:0.82rem;">${esc(task.title)}</span>
                  <span style="font-size:0.72rem;color:var(--text-muted);">Estado: ${esc(task.status || '—')}</span>
                </div>
                <span class="badge badge-neutral">${esc(task.updatedBy)} · ${timeAgo(task.updatedAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : `<p style="color:var(--text-muted);margin:0;">Aún no hay historial de edición por otros usuarios.</p>`}
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Carga por miembro</h3>
        ${workloadRows.length ? `
          <div style="overflow:auto;">
            <table class="table" style="width:100%; border-collapse:collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border-color);">Miembro</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color);">Activas</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color);">Terminadas</th>
                  <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color);">Total</th>
                </tr>
              </thead>
              <tbody>
                ${workloadRows.map(row => `
                  <tr>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);">${esc(row.member.name)}</td>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);text-align:right;">${row.inProgress}</td>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);text-align:right;">${row.done}</td>
                    <td style="padding:8px;border-bottom:1px solid var(--border-color);text-align:right;">${row.total}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<p style="color:var(--text-muted);margin:0;">No hay miembros cargados aún.</p>`}
      </div>
    </div>`;

  feather.replace();
}

function timeAgo(timestamp) {
  if (!timestamp) return 'sin fecha';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(elapsed / 60000);
  if (mins < 1) return 'justo ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

window.renderCollaboration = renderCollaboration;
