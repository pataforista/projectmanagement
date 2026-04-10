/**
 * views/collaboration.js — Team collaboration diagnostics and protocol guide
 */

async function renderCollaboration(root) {
  const members = store.get.members();
  const tasks = store.get.allTasks();
  const messages = store.get.messages ? store.get.messages() : [];

  const currentUser = getCurrentWorkspaceUser();
  const linkedMember = getCurrentWorkspaceMember();

  const now = Date.now();
  const last24h = now - (24 * 60 * 60 * 1000);

  // FIX: Use identity key (updatedById) as the map key instead of the display name.
  // If a user changes their name between devices, the previous activity would appear
  // as a different person when keyed by name. Identity key is stable across renames.
  const activityByUser = new Map(); // key: identityKey → { name, interactions }

  tasks.forEach(task => {
    if (task.updatedAt && task.updatedAt >= last24h && task.updatedBy) {
      const key = task.updatedById || `name:${task.updatedBy}`;
      const entry = activityByUser.get(key) || { name: task.updatedBy, interactions: 0 };
      entry.interactions += 1;
      activityByUser.set(key, entry);
    }
  });

  messages.forEach(msg => {
    if (msg.timestamp && msg.timestamp >= last24h && msg.sender) {
      const key = msg.senderId || `name:${msg.sender}`;
      const entry = activityByUser.get(key) || { name: msg.sender, interactions: 0 };
      entry.interactions += 1;
      activityByUser.set(key, entry);
    }
  });

  const activeUsers = Array.from(activityByUser.values())
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

  // SECURITY: Import hasMemberId helper and RoleManager
  const { hasMemberId, setCurrentMemberId } = await import('../utils.js');
  const { RoleManager } = await import('../../scripts/roles.js');

  const canManageMembers = RoleManager.can('ADD_MEMBER', currentUser.role);

  const conflictRiskTasks = tasks.filter(task => {
    if (!task.updatedAt || !task.updatedBy) return false;
    if (task.updatedById && task.updatedById === currentUser.identityKey) return false;
    if (!task.updatedById && task.updatedBy === currentUser.name) return false;
    return (now - task.updatedAt) <= (15 * 60 * 1000);
  });

  // WARNING: If no memberId configured, show alert banner
  const memberIdWarning = !hasMemberId() ? `
    <div style="background:var(--accent-warning);color:#000;padding:12px 16px;margin-bottom:16px;border-radius:8px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:1.5rem;">⚠️</span>
      <div>
        <strong>Identidad no configurada</strong><br/>
        Tu perfil de usuario no está vinculado a un miembro del equipo. Esto afecta a la autoría de cambios y la trazabilidad. Selecciona tu miembro en la sección "Usuario activo" abajo.
      </div>
    </div>
  ` : '';

  root.innerHTML = `
    <div class="view-inner">
      ${memberIdWarning}
      <div class="view-header">
        <div class="view-header-text">
          <h1>Colaboración de Equipo</h1>
          <p class="view-subtitle">Claridad operativa sobre asignaciones, protocolos y usuarios activos.</p>
        </div>
        ${canManageMembers ? `<button class="btn btn-primary" id="btn-add-member"><i data-feather="user-plus"></i> Nuevo Miembro</button>` : ''}
      </div>

      <div class="dashboard-grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:20px;">
        <div class="glass-panel" style="padding:20px; border-radius:var(--radius-lg); background:var(--surface-glass); backdrop-filter:var(--blur-premium); border:1px solid var(--surface-glass-border);">
          <h3 style="margin-bottom:14px; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Usuario activo</h3>
          <div style="display:flex;align-items:center;gap:16px;">
            <div class="avatar" style="width:56px;height:56px; border:2px solid var(--accent-primary); box-shadow:var(--glow-primary);">${esc(currentUser.avatar)}</div>
            <div>
              <div style="font-weight:700; font-size:1.1rem; color:var(--text-primary);">${esc(currentUser.name)}</div>
              <div style="font-size:0.85rem; font-weight:500; color:var(--accent-primary);">${esc(currentUser.role)}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">${currentUser.email ? esc(currentUser.email) : 'Sin enlace de identidad'}</div>
            </div>
          </div>
          <p style="margin:16px 0 0; color:var(--text-secondary); font-size:0.82rem; line-height:1.5;">Este perfil firma tus cambios y mensajes. La identidad escopada asegura que tus tokens de Todoist y Zotero sean privados.</p>
          ${!linkedMember ? `
            <button id="selectMemberBtn" class="btn btn-primary playful-pop" style="margin-top:16px; width:100%; justify-content:center; background:var(--accent-vibrant); border:none;">
              Vincular Miembro del Equipo
            </button>
          ` : `<div style="margin-top:16px; font-size:0.75rem; padding:8px; background:var(--bg-surface-2); border-radius:var(--radius-sm); border:1px solid var(--border-color); color:var(--text-secondary);">
                <i data-feather="link" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i> Miembro: <strong>${esc(linkedMember.name)}</strong>
              </div>`}
        </div>

        <div class="glass-panel" style="padding:20px; border-radius:var(--radius-lg); background:var(--surface-glass); backdrop-filter:var(--blur-premium); border:1px solid var(--surface-glass-border);">
          <h3 style="margin-bottom:14px; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted);">Indicadores de coordinación</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="kpi-card" style="padding:14px; background:var(--bg-surface-2); border-radius:var(--radius-md); border-left:4px solid var(--accent-warning);">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">Sin asignar</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--accent-warning);">${unassignedTasks}</div>
            </div>
            <div class="kpi-card" style="padding:14px; background:var(--bg-surface-2); border-radius:var(--radius-md); border-left:4px solid var(--accent-teal);">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">En revisión</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--accent-teal);">${inReviewTasks}</div>
            </div>
            <div class="kpi-card" style="padding:14px; background:var(--bg-surface-2); border-radius:var(--radius-md); border-left:4px solid var(--accent-primary);">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">Mis tareas</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--text-primary); text-shadow:var(--glow-primary);">${myTasks}</div>
            </div>
            <div class="kpi-card" style="padding:14px; background:var(--bg-surface-2); border-radius:var(--radius-md); border-left:4px solid var(--text-muted);">
              <div style="font-size:0.72rem; color:var(--text-muted); font-weight:600;">Equipo</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--text-secondary);">${teamTasks}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="glass-panel" style="padding:16px; margin-top:16px;">
        <h3 style="margin-bottom:12px;">Carga de trabajo por miembro</h3>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border-bottom:1px solid var(--border-color);">Miembro</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color);">Activas</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color);">Terminadas</th>
              <th style="text-align:right;padding:8px;border-bottom:1px solid var(--border-color);">Total</th>
              ${canManageMembers ? `<th style="text-align:center;padding:8px;border-bottom:1px solid var(--border-color);">Acciones</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${workloadRows.map(row => `
                  <tr data-member-id="${row.member.id}" style="border-bottom:1px solid var(--border-color); transition:background 0.2s;">
                    <td style="padding:12px 8px;">
                      <div style="display:flex;align-items:center;gap:12px;">
                        <div class="avatar" style="width:32px;height:32px;font-size:0.8rem; background:var(--surface-tonal);">${esc(row.member.avatar)}</div>
                        <div style="display:flex; flex-direction:column;">
                          <span style="font-weight:600; color:var(--text-primary);">${esc(row.member.name)}</span>
                          <span style="font-size:0.75rem; color:var(--accent-primary);">${esc(row.member.role)}</span>
                        </div>
                      </div>
                    </td>
                    <td style="padding:12px 8px;text-align:right; font-weight:600;">${row.inProgress}</td>
                    <td style="padding:12px 8px;text-align:right; color:var(--accent-success);">${row.done}</td>
                    <td style="padding:12px 8px;text-align:right; font-weight:700;">${row.total}</td>
                    ${canManageMembers ? `
                    <td style="padding:12px 8px;text-align:center;">
                      <button class="btn btn-icon edit-member playful-pop" title="Configurar" data-member-id="${row.member.id}"><i data-feather="settings" style="width:18px;height:18px;"></i></button>
                      <button class="btn btn-icon delete-member playful-pop" title="Eliminar" data-member-id="${row.member.id}" style="color:var(--accent-danger);"><i data-feather="user-x" style="width:18px;height:18px;"></i></button>
                    </td>` : ''}
                  </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="glass-panel" style="padding:20px; margin-top:20px; border-radius:var(--radius-lg); background:var(--bg-surface); border:1px solid var(--border-color);">
        <h3 style="margin-bottom:12px; font-size:1rem; color:var(--text-primary);"><i data-feather="info" style="width:16px;height:16px;vertical-align:text-bottom;margin-right:6px;"></i> Protocolos de Identidad</h3>
        <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:8px; color:var(--text-secondary); font-size:0.85rem;">
          <li><b>Mía</b>: la tarea tiene <b>assigneeId</b> igual a tu miembro vinculado.</li>
          <li><b>Equipo</b>: está asignada a otra persona o no está asignada.</li>
          <li>La identidad escopada evita fugas de credenciales entre cuentas de un mismo navegador.</li>
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

      <div class="glass-panel" style="padding:16px; margin-top:16px; border:1px solid var(--accent-primary-alpha);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0;"><i data-feather="activity" style="width:18px;height:18px;vertical-align:text-bottom;margin-right:6px;"></i> El Ojo de Horus: Actividad Viva</h3>
          <span class="badge badge-success pulse" style="font-size:0.7rem;">Live</span>
        </div>
        <div id="activity-feed-container">
          ${renderActivityFeed(store.get.logs())}
        </div>
      </div>
    </div>`;

  // Start real-time activity subscription
  const activityUnsub = store.subscribe('logs', (newLogs) => {
    const container = root.querySelector('#activity-feed-container');
    if (container) {
      container.innerHTML = renderActivityFeed(newLogs);
      feather.replace();
      
      // Re-bind view detail buttons
      container.querySelectorAll('.view-entity').forEach(btn => {
        btn.onclick = () => handleEntityView(btn.dataset.type, btn.dataset.id);
      });
    }
  });

  // Ensure cleanup if view changes
  const observer = new MutationObserver((mutations) => {
    if (!document.contains(root)) {
      activityUnsub();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Handle entity navigation
  async function handleEntityView(type, id) {
    if (type === 'task') {
      const task = store.get.allTasks().find(t => t.id === id);
      if (task && window.openTaskDetail) {
        window.openTaskDetail(task);
      } else {
        showToast('Tarea no encontrada o eliminada', 'warning');
      }
    } else if (type === 'project') {
       if (window.renderProjects) {
         // Quick navigation logic could be added here
         showToast('Navegando al proyecto...', 'info');
       }
    }
  }

  // Setup entity detail buttons
  root.querySelectorAll('.view-entity').forEach(btn => {
    btn.onclick = () => handleEntityView(btn.dataset.type, btn.dataset.id);
  });

  // Setup member selector button
  const selectBtn = root.querySelector('#selectMemberBtn');
  if (selectBtn) {
    selectBtn.onclick = async () => {
      const modal = openModal(`
        <div class="modal-header">
          <h2><i data-feather="users"></i> Selecciona tu Miembro</h2>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary); margin-bottom:16px;">Elige el miembro del equipo que corresponde a tu usuario:</p>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${members.map(m => `
              <button class="btn btn-secondary" style="width:100%; justify-content:flex-start; gap:12px;" data-member-id="${m.id}">
                <div class="avatar" style="width:32px; height:32px; font-size:0.85rem;">${esc(m.avatar)}</div>
                <div style="text-align:left;">
                  <div style="font-weight:600;">${esc(m.name)}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${esc(m.role || 'Colaborador')}</div>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      `);
      feather.replace();

      modal.querySelectorAll('[data-member-id]').forEach(btn => {
        btn.onclick = () => {
          const memberId = btn.dataset.memberId;
          const selected = members.find(m => m.id === memberId);
          if (selected) {
            setCurrentMemberId(selected.id);
            closeModal();
            showToast(`✓ Miembro configurado: ${selected.name}`, 'success');
            renderCollaboration(root);
          }
        };
      });
    };
  }

  // Setup add member button
  const addMemberBtn = root.querySelector('#btn-add-member');
  if (addMemberBtn) {
    addMemberBtn.onclick = async () => {
    const modal = openModal(`
      <div class="modal-header">
        <h2><i data-feather="user-plus"></i> Nuevo Miembro</h2>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Nombre del Miembro</label>
          <input class="form-input" id="new-member-name" placeholder="ej. María García" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">Rol</label>
          <select class="form-select" id="new-member-role">
            <option value="Administrador">Administrador</option>
            <option value="Colaborador" selected>Colaborador</option>
            <option value="Revisor">Revisor</option>
            <option value="Observador">Observador</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Email (opcional)</label>
          <input class="form-input" id="new-member-email" type="email" placeholder="email@ejemplo.com" autocomplete="off">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="new-member-cancel">Cancelar</button>
        <button class="btn btn-primary" id="new-member-save"><i data-feather="check"></i> Crear Miembro</button>
      </div>
    `);
    feather.replace();

    const nameInput = modal.querySelector('#new-member-name');
    nameInput.focus();

    const saveBtn = modal.querySelector('#new-member-save');
    const cancelBtn = modal.querySelector('#new-member-cancel');

    const doSave = async () => {
      const name = nameInput.value.trim();
      if (!name) {
        showToast('El nombre es obligatorio', 'warning');
        return;
      }
      if (name.length < 2) {
        showToast('El nombre debe tener al menos 2 caracteres', 'warning');
        return;
      }

      const role = modal.querySelector('#new-member-role').value;
      const email = modal.querySelector('#new-member-email').value.trim() || null;

      try {
        await store.dispatch('ADD_MEMBER', { name, role, email });
        closeModal();
        showToast(`✓ Miembro "${name}" añadido`, 'success');
        renderCollaboration(root);
      } catch (err) {
        console.error('Error adding member:', err);
        showToast('Error al crear el miembro', 'error');
      }
    };

    saveBtn.onclick = doSave;
    cancelBtn.onclick = closeModal;
    nameInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') doSave();
    });
  };
}

  // Setup edit member buttons
  root.querySelectorAll('.edit-member').forEach(btn => {
    btn.onclick = () => {
      const memberId = btn.dataset.memberId;
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      const modal = openModal(`
        <div class="modal-header">
          <h2><i data-feather="edit-2"></i> Editar Miembro</h2>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre</label>
            <input class="form-input" id="edit-member-name" value="${esc(member.name)}">
          </div>
          <div class="form-group">
            <label class="form-label">Rol</label>
            <select class="form-select" id="edit-member-role">
              <option value="Administrador" ${member.role === 'Administrador' ? 'selected' : ''}>Administrador</option>
              <option value="Colaborador" ${member.role === 'Colaborador' ? 'selected' : ''}>Colaborador</option>
              <option value="Revisor" ${member.role === 'Revisor' ? 'selected' : ''}>Revisor</option>
              <option value="Observador" ${member.role === 'Observador' ? 'selected' : ''}>Observador</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Email (opcional)</label>
            <input class="form-input" id="edit-member-email" type="email" value="${esc(member.email || '')}">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="edit-member-cancel">Cancelar</button>
          <button class="btn btn-primary" id="edit-member-save"><i data-feather="check"></i> Guardar</button>
        </div>
      `);
      feather.replace();

      const nameInput = modal.querySelector('#edit-member-name');
      nameInput.focus();

      const doSave = async () => {
        const name = nameInput.value.trim();
        if (!name) {
          showToast('El nombre es obligatorio', 'warning');
          return;
        }
        const role = modal.querySelector('#edit-member-role').value;
        const email = modal.querySelector('#edit-member-email').value.trim() || null;

        try {
          await store.dispatch('UPDATE_MEMBER', { id: memberId, name, role, email });
          closeModal();
          showToast(`✓ Miembro actualizado`, 'success');
          renderCollaboration(root);
        } catch (err) {
          console.error('Error updating member:', err);
          showToast('Error al actualizar el miembro', 'error');
        }
      };

      modal.querySelector('#edit-member-save').onclick = doSave;
      modal.querySelector('#edit-member-cancel').onclick = closeModal;
      nameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') doSave();
      });
    };
  });

  // Setup delete member buttons
  root.querySelectorAll('.delete-member').forEach(btn => {
    btn.onclick = async () => {
      const memberId = btn.dataset.memberId;
      const member = members.find(m => m.id === memberId);
      if (!member) return;

      if (confirm(`¿Eliminar al miembro "${member.name}"? Esta acción no se puede deshacer.`)) {
        try {
          await store.dispatch('DELETE_MEMBER', { id: memberId });
          showToast(`✓ Miembro eliminado`, 'success');
          renderCollaboration(root);
        } catch (err) {
          console.error('Error deleting member:', err);
          showToast('Error al eliminar el miembro', 'error');
        }
      }
    };
  });

  feather.replace();
}

function renderActivityFeed(logs) {
  if (!logs || logs.length === 0) {
    return `<p style="color:var(--text-muted);margin:0;font-size:0.85rem;">No hay actividad reciente registrada.</p>`;
  }

  // Sort logs by timestamp descending
  const sortedLogs = [...logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50);

  return `
    <div class="activity-timeline" style="display:flex; flex-direction:column; gap:12px; max-height:400px; overflow-y:auto; padding-right:8px;">
      ${sortedLogs.map(log => {
        const icon = getLogIcon(log.action, log.entityType);
        const color = getLogColor(log.action);
        return `
          <div class="activity-item" style="display:flex; gap:12px; position:relative; padding-bottom:4px;">
            <div class="activity-icon-wrapper" style="flex-shrink:0; width:28px; height:28px; border-radius:50%; background:${color}22; color:${color}; display:flex; align-items:center; justify-content:center;">
              <i data-feather="${icon}" style="width:14px; height:14px;"></i>
            </div>
            <div class="activity-content" style="flex-grow:1; font-size:0.82rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <span style="font-weight:600; color:var(--text-primary);">${esc(log.updatedBy || 'Usuario')}</span>
                <span style="font-size:0.72rem; color:var(--text-muted);">${timeAgo(log.timestamp)}</span>
              </div>
              <div style="color:var(--text-secondary); margin-top:2px; line-height:1.4;">
                ${esc(log.message || 'Realizó una acción')}
              </div>
              ${log.entityId ? `<button class="btn-link view-entity" data-type="${log.entityType}" data-id="${log.entityId}" style="font-size:0.75rem; padding:0; margin-top:4px; color:var(--accent-primary); border:none; background:none; cursor:pointer;">Ver detalle →</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function getLogIcon(action, type) {
  if (action === 'DELETE') return 'trash-2';
  if (action === 'CREATE') return 'plus-circle';
  if (type === 'task' && action === 'UPDATE') return 'edit-3';
  if (type === 'project') return 'folder';
  return 'circle';
}

function getLogColor(action) {
  if (action === 'DELETE') return 'var(--accent-danger)';
  if (action === 'CREATE') return 'var(--accent-success)';
  return 'var(--accent-primary)';
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
