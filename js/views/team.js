/**
 * views/team.js — Team view: member management + project assignments
 */

function renderTeam(root) {
  _renderTeamHTML(root);
}

function _renderTeamHTML(root) {
  const members = store.get.members();
  const projects = store.get.projects();

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Equipo</h1>
          <p class="view-subtitle">Gestiona los miembros del equipo y visualiza la carga de proyectos.</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-primary" id="btn-add-member">
            <i data-feather="user-plus"></i> Agregar miembro
          </button>
        </div>
      </div>

      <!-- Add member inline form (hidden by default) -->
      <div id="team-add-form" class="card glass-panel" style="display:none;margin-bottom:20px;padding:16px;">
        <h4 style="margin:0 0 12px 0;font-size:0.9rem;">Nuevo miembro</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">Nombre *</label>
            <input class="form-input" id="new-member-name" placeholder="Ej. Ana García">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Rol</label>
            <input class="form-input" id="new-member-role" placeholder="Ej. Investigadora, Asistente...">
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-primary" id="btn-save-member"><i data-feather="check"></i></button>
            <button class="btn btn-ghost" id="btn-cancel-member"><i data-feather="x"></i></button>
          </div>
        </div>
      </div>

      ${members.length === 0 ? `
        <div class="card glass-panel" style="text-align:center;padding:48px;">
          ${emptyState('users', 'Aún no hay miembros. Agrega el primero.')}
          <button class="btn btn-primary" style="margin-top:16px;" id="btn-add-member-empty">
            <i data-feather="user-plus"></i> Agregar primer miembro
          </button>
        </div>` : `

      <!-- Member cards grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        ${members.map(m => {
          const assignedProjects = projects.filter(p => (p.memberIds || []).includes(m.id));
          const activePct = assignedProjects.length ? assignedProjects.filter(p => p.status === 'activo').length : 0;
          return `
          <div class="card glass-panel" data-member-id="${m.id}">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
              ${memberAvatarHtml(m, 44)}
              <div style="flex:1;min-width:0;">
                <div id="member-name-display-${m.id}" style="font-weight:600;font-size:0.95rem;">${esc(m.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">${esc(m.role || 'Sin rol asignado')}</div>
              </div>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-icon btn-ghost btn-xs" title="Editar" onclick="openEditMemberForm('${m.id}')">
                  <i data-feather="edit-2" style="width:13px;height:13px;"></i>
                </button>
                <button class="btn btn-icon btn-ghost btn-xs" title="Eliminar" style="color:var(--accent-danger);" onclick="confirmDeleteMember('${m.id}', '${esc(m.name)}')">
                  <i data-feather="trash-2" style="width:13px;height:13px;"></i>
                </button>
              </div>
            </div>

            <!-- Inline edit form -->
            <div id="member-edit-form-${m.id}" style="display:none;margin-bottom:12px;padding:10px;background:var(--bg-surface-2);border-radius:var(--radius-sm);">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                <input class="form-input" id="edit-member-name-${m.id}" value="${esc(m.name)}" placeholder="Nombre">
                <input class="form-input" id="edit-member-role-${m.id}" value="${esc(m.role || '')}" placeholder="Rol">
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn btn-ghost btn-xs" onclick="cancelEditMember('${m.id}')">Cancelar</button>
                <button class="btn btn-primary btn-xs" onclick="saveMemberEdit('${m.id}')">Guardar</button>
              </div>
            </div>

            <div style="border-top:1px solid var(--border-color);padding-top:10px;">
              <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
                Proyectos asignados (${assignedProjects.length})
              </div>
              ${assignedProjects.length ? `
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${assignedProjects.map(p => {
                    const meta = PROJECT_TYPES[p.type] || PROJECT_TYPES.libre;
                    const tasks = store.get.tasksByProject(p.id);
                    const done = tasks.filter(t => t.status === 'Terminado').length;
                    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
                    return `
                    <div style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-color);transition:background 0.15s;"
                         onclick="router.navigate('/project/${p.id}')" class="team-proj-row">
                      <div style="width:8px;height:8px;border-radius:50%;background:${p.color || meta.color};flex-shrink:0;"></div>
                      <span style="font-size:0.82rem;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.name)}</span>
                      <span style="font-size:0.7rem;color:var(--text-muted);flex-shrink:0;">${pct}%</span>
                      ${statusBadge(p.status)}
                    </div>`;
                  }).join('')}
                </div>` : `<p style="font-size:0.78rem;color:var(--text-muted);">Sin proyectos asignados.</p>`}
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Project assignment overview -->
      <div class="card glass-panel" style="margin-top:24px;">
        <div class="card-header">
          <h3>Proyectos sin responsable</h3>
          <span class="badge badge-neutral">${projects.filter(p => !p.memberIds || !p.memberIds.length).length}</span>
        </div>
        <div class="card-body">
          ${(() => {
            const unassigned = projects.filter(p => (!p.memberIds || !p.memberIds.length) && p.status !== 'archivado');
            if (!unassigned.length) return '<p style="font-size:0.82rem;color:var(--text-muted);">Todos los proyectos activos tienen responsable asignado.</p>';
            return `<div style="display:flex;flex-wrap:wrap;gap:8px;">${unassigned.map(p => {
              const meta = PROJECT_TYPES[p.type] || PROJECT_TYPES.libre;
              return `<div onclick="router.navigate('/project/${p.id}')" style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;border:1px solid var(--border-color);font-size:0.8rem;transition:background 0.15s;" class="team-proj-row">
                <div style="width:8px;height:8px;border-radius:50%;background:${p.color || meta.color};"></div>
                ${esc(p.name)} ${statusBadge(p.status)}
              </div>`;
            }).join('')}</div>`;
          })()}
        </div>
      </div>
      `}
    </div>`;

  feather.replace();
  _bindTeamEvents(root);
}

function _bindTeamEvents(root) {
  // Toggle add form
  const showForm = () => {
    root.querySelector('#team-add-form').style.display = 'block';
    root.querySelector('#new-member-name').focus();
  };
  root.querySelector('#btn-add-member')?.addEventListener('click', showForm);
  root.querySelector('#btn-add-member-empty')?.addEventListener('click', showForm);

  root.querySelector('#btn-cancel-member')?.addEventListener('click', () => {
    root.querySelector('#team-add-form').style.display = 'none';
    root.querySelector('#new-member-name').value = '';
    root.querySelector('#new-member-role').value = '';
  });

  const saveMember = async () => {
    const name = root.querySelector('#new-member-name').value.trim();
    if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }
    const role = root.querySelector('#new-member-role').value.trim();
    await store.dispatch('ADD_MEMBER', { name, role });
    showToast(`${name} añadido al equipo.`, 'success');
    _renderTeamHTML(root);
  };

  root.querySelector('#btn-save-member')?.addEventListener('click', saveMember);
  root.querySelector('#new-member-name')?.addEventListener('keypress', e => { if (e.key === 'Enter') saveMember(); });

  // Style hover on project rows
  root.querySelectorAll('.team-proj-row').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-surface-2)');
    el.addEventListener('mouseleave', () => el.style.background = '');
  });
}

window.openEditMemberForm = function (id) {
  document.getElementById(`member-edit-form-${id}`).style.display = 'block';
  document.getElementById(`edit-member-name-${id}`)?.focus();
};

window.cancelEditMember = function (id) {
  document.getElementById(`member-edit-form-${id}`).style.display = 'none';
};

window.saveMemberEdit = async function (id) {
  const name = document.getElementById(`edit-member-name-${id}`).value.trim();
  const role = document.getElementById(`edit-member-role-${id}`).value.trim();
  if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }
  await store.dispatch('UPDATE_MEMBER', { id, name, role });
  showToast('Miembro actualizado.', 'success');
  const root = document.getElementById('app-root');
  _renderTeamHTML(root);
};

window.confirmDeleteMember = async function (id, name) {
  if (!confirm(`¿Eliminar a ${name} del equipo? Se quitará de todos los proyectos asignados.`)) return;
  // Remove from all projects
  const projects = store.get.projects().filter(p => (p.memberIds || []).includes(id));
  for (const p of projects) {
    await store.dispatch('UPDATE_PROJECT', { id: p.id, memberIds: p.memberIds.filter(mid => mid !== id) });
  }
  await store.dispatch('DELETE_MEMBER', { id });
  showToast(`${name} eliminado del equipo.`, 'info');
  const root = document.getElementById('app-root');
  _renderTeamHTML(root);
};

window.renderTeam = renderTeam;
