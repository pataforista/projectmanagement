/**
 * views/admin.js — Centralized Workspace Administration
 */

async function renderAdmin(root) {
  const members = store.get.members().filter(m => !m._deleted);
  const config = syncManager.getConfig();
  const currentUser = getCurrentWorkspaceUser();
  const linkedMember = getCurrentWorkspaceMember();
  const isAdmin = linkedMember?.role?.toLowerCase() === 'admin' || members.length === 0;

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Administración del Workspace</h1>
          <p class="view-subtitle">Gestiona miembros, invitaciones y configuración global del equipo.</p>
        </div>
      </div>

      <div class="tabs-container" style="margin-top:20px;">
        <div class="tabs-header glass-panel" style="display:flex; gap:8px; padding:8px; margin-bottom:20px; border-radius:12px;">
          <button class="tab-btn active" data-tab="general"><i data-feather="settings"></i> General</button>
          <button class="tab-btn" data-tab="members"><i data-feather="users"></i> Miembros</button>
          <button class="tab-btn" data-tab="invites"><i data-feather="user-plus"></i> Invitaciones</button>
          <button class="tab-btn" data-tab="sync"><i data-feather="cloud"></i> Sincronización</button>
        </div>

        <div id="admin-tab-content">
          <!-- Content loaded dynamically -->
        </div>
      </div>
    </div>
  `;

  const contentDiv = root.querySelector('#admin-tab-content');

  const renderTab = (tabId) => {
    switch(tabId) {
      case 'general': renderGeneralTab(contentDiv, config, isAdmin); break;
      case 'members': renderMembersTab(contentDiv, members, isAdmin); break;
      case 'invites': renderInvitesTab(contentDiv, config, isAdmin); break;
      case 'sync': renderSyncTab(contentDiv, config, isAdmin); break;
    }
    feather.replace();
  };

  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(btn.dataset.tab);
    };
  });

  renderTab('general');
  feather.replace();
}

function renderGeneralTab(container, config, isAdmin) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="card glass-panel" style="max-width:600px; padding:24px;">
        <h3 style="margin-bottom:16px;">Configuración del Espacio</h3>
        <div class="form-group">
          <label class="form-label">Nombre del Equipo / Workspace</label>
          <input type="text" class="form-input" id="admin-ws-name" value="${esc(config.workspace_name || config.teamName || 'Mi Workspace')}" ${!isAdmin ? 'disabled' : ''}>
        </div>

        <div class="form-group" style="margin-top:24px; padding:16px; background:var(--bg-surface-2); border-radius:12px; border:1px solid var(--border-color);">
          <label class="form-label" style="display:flex; align-items:center; gap:8px;">
            <i data-feather="shield" style="width:16px; color:var(--accent-primary);"></i> Clave Maestra de Administrador
          </label>
          <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
            Esta clave es necesaria para ascender miembros a "Admin" o realizar cambios estructurales.
          </p>
          <input type="password" class="form-input" id="admin-master-key" placeholder="${config.admin_key_hash ? '•••••••• (Clave establecida)' : 'Configurar nueva clave...'}" ${!isAdmin ? 'disabled' : ''}>
          ${isAdmin ? `<button class="btn btn-primary" style="margin-top:12px;" onclick="saveAdminGeneral()"><i data-feather="save"></i> Guardar Cambios</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderMembersTab(container, members, isAdmin) {
  container.innerHTML = `
    <div class="animate-fade-in">
       <div class="card glass-panel" style="padding:0; overflow:hidden;">
        <table class="list-table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left; padding:16px;">Miembro</th>
              <th style="text-align:left; padding:16px;">Email</th>
              <th style="text-align:left; padding:16px;">Rol</th>
              <th style="text-align:center; padding:16px;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${members.map(m => `
              <tr>
                <td style="padding:16px; border-top:1px solid var(--border-color);">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div class="avatar" style="width:32px; height:32px;">${esc(m.avatar || m.name.charAt(0))}</div>
                    <span style="font-weight:600;">${esc(m.name)}</span>
                  </div>
                </td>
                <td style="padding:16px; border-top:1px solid var(--border-color); color:var(--text-secondary); font-size:0.85rem;">
                  ${esc(m.email || 'Sin vincular')}
                </td>
                <td style="padding:16px; border-top:1px solid var(--border-color);">
                  <span class="badge ${m.role === 'admin' ? 'badge-primary' : 'badge-neutral'}">${esc(m.role || 'Miembro')}</span>
                </td>
                <td style="padding:16px; border-top:1px solid var(--border-color); text-align:center;">
                  ${isAdmin ? `
                    <button class="btn btn-icon btn-sm" onclick="editMemberRoles('${m.id}')" title="Editar Rol"><i data-feather="edit-2"></i></button>
                    ${m.id !== getCurrentWorkspaceMember()?.id ? `<button class="btn btn-icon btn-sm" style="color:var(--accent-danger);" onclick="deleteMemberAdmin('${m.id}')"><i data-feather="trash-2"></i></button>` : ''}
                  ` : '—'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${isAdmin ? `
        <button class="btn btn-primary" style="margin-top:16px;" onclick="openAddMemberModalAdmin()">
          <i data-feather="user-plus"></i> Añadir Miembro Manualmente
        </button>
      ` : ''}
    </div>
  `;
}

function renderInvitesTab(container, config, isAdmin) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="card glass-panel" style="max-width:600px; padding:24px;">
        <h3 style="margin-bottom:12px;">Códigos de Invitación</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px;">
          Genera un código para que nuevos miembros se unan a este workspace sin configuraciones manuales.
        </p>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <div style="padding:16px; background:var(--bg-surface-2); border-radius:12px; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-weight:600;">Invitación de Colaborador</span>
              <button class="btn btn-secondary btn-sm" onclick="generateInvite('member')">Generar Código</button>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Ideal para el resto del equipo. No permite cambios de configuración.</p>
          </div>

          <div style="padding:16px; background:var(--accent-primary)10; border-radius:12px; border:1px solid var(--accent-primary)30;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-weight:600; color:var(--accent-primary);">Invitación de Administrador</span>
              <button class="btn btn-primary btn-sm" onclick="generateInvite('admin')">Generar Código</button>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Otorga permisos totales. Requiere la Clave Maestra al unirse.</p>
          </div>
        </div>

        <div id="invite-output" style="display:none; margin-top:24px;">
          <label class="form-label">Código Generado (Copia y envía al miembro)</label>
          <div style="display:flex; gap:8px;">
            <input type="text" class="form-input" id="invite-code-input" readonly style="font-family:monospace; font-size:0.8rem;">
            <button class="btn btn-secondary" onclick="copyInviteCode()"><i data-feather="copy"></i></button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSyncTab(container, config, isAdmin) {
  container.innerHTML = `
    <div class="animate-fade-in">
      <div class="card glass-panel" style="max-width:600px; padding:24px;">
        <h3 style="margin-bottom:16px;">Infraestructura GDrive</h3>
        <div class="form-group">
          <label class="form-label">Google Client ID</label>
          <input type="text" class="form-input" value="${esc(config.clientId)}" disabled style="color:var(--text-muted);">
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Folder ID Compartido</label>
          <input type="text" class="form-input" value="${esc(config.sharedFolderId)}" disabled style="color:var(--text-muted);">
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label class="form-label">Nombre de Archivo</label>
          <input type="text" class="form-input" value="${esc(config.fileName)}" disabled style="color:var(--text-muted);">
        </div>
        <p style="margin-top:20px; font-size:0.8rem; color:var(--text-muted); font-style:italic;">
          La configuración de sincronización centralizada solo puede ser editada por el Administrador Lead en el archivo de configuración raíz.
        </p>
      </div>
    </div>
  `;
}

// Logic implementations
window.saveAdminGeneral = async function() {
  const wsName = document.getElementById('admin-ws-name').value.trim();
  const masterKey = document.getElementById('admin-master-key').value.trim();

  const updates = { workspace_name: wsName };

  if (masterKey) {
      const cryptoLayer = await import('./utils/crypto.js');
      updates.admin_key_hash = await cryptoLayer.hashPassword(masterKey);
  }

  syncManager.saveConfig({ ...syncManager.getConfig(), ...updates });
  showToast('Configuración del workspace guardada.', 'success');
  renderAdmin(document.getElementById('app-root'));
};

window.generateInvite = function(role) {
  const config = syncManager.getConfig();
  const payload = {
    c: config.clientId,
    f: config.sharedFolderId,
    n: config.fileName,
    w: config.workspace_name,
    r: role
  };
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const output = document.getElementById('invite-output');
  const input = document.getElementById('invite-code-input');
  output.style.display = 'block';
  input.value = code;
  feather.replace();
};

window.copyInviteCode = async function() {
  const input = document.getElementById('invite-code-input');
  try {
    await navigator.clipboard.writeText(input.value);
    showToast('Código copiado al portapapeles.', 'success');
  } catch {
    input.select();
    document.execCommand('copy');
    showToast('Código copiado al portapapeles.', 'success');
  }
};

window.editMemberRoles = async function(id) {
    const member = store.get.members().find(m => m.id === id);
    const config = syncManager.getConfig();

    const roleModal = openModal(`
        <div class="modal-header"><h2>Editar Rol de ${esc(member.name)}</h2></div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Nuevo Rol</label>
                <select class="form-select" id="new-role-select">
                    <option value="member" ${member.role === 'member' ? 'selected' : ''}>Miembro</option>
                    <option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Administrador</option>
                </select>
            </div>
            <div id="master-key-verify" style="display:none; margin-top:16px;">
                <label class="form-label">Clave Maestra de Administrador</label>
                <input type="password" class="form-input" id="verify-master-key" placeholder="Requerido para cambios críticos">
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" id="save-role-btn">Guardar</button>
        </div>
    `);

    const select = roleModal.querySelector('#new-role-select');
    const verifyDiv = roleModal.querySelector('#master-key-verify');

    select.onchange = () => {
        if (select.value === 'admin' && config.admin_key_hash) {
            verifyDiv.style.display = 'block';
        } else {
            verifyDiv.style.display = 'none';
        }
    };

    roleModal.querySelector('#save-role-btn').onclick = async () => {
        const newRole = select.value;
        if (newRole === 'admin' && config.admin_key_hash) {
            const key = roleModal.querySelector('#verify-master-key').value;
            const cryptoLayer = await import('./utils/crypto.js');
            const hash = await cryptoLayer.hashPassword(key);
            if (hash !== config.admin_key_hash) {
                return showToast('Clave Maestra incorrecta.', 'error');
            }
        }

        await store.dispatch('UPDATE_MEMBER', { id, role: newRole });
        closeModal();
        showToast('Rol actualizado.', 'success');
        renderAdmin(document.getElementById('app-root'));
    };
};

window.deleteMemberAdmin = async function(id) {
    const member = store.get.members().find(m => m.id === id);
    if (!confirm(`¿Eliminar a ${member.name} del equipo? Esta acción no se puede deshacer.`)) return;

    // Safety check: is there a Master Key?
    const config = syncManager.getConfig();
    if (config.admin_key_hash) {
        const key = prompt('Ingresa la Clave Maestra de Administrador para confirmar la eliminación de un miembro:');
        if (!key) return;
        const cryptoLayer = await import('./utils/crypto.js');
        const hash = await cryptoLayer.hashPassword(key);
        if (hash !== config.admin_key_hash) return showToast('Clave Maestra incorrecta.', 'error');
    }

    await store.dispatch('DELETE_MEMBER', { id });
    showToast('Miembro eliminado.', 'success');
    renderAdmin(document.getElementById('app-root'));
};

window.openAddMemberModalAdmin = function() {
    const modal = openModal(`
        <div class="modal-header"><h2>Añadir Miembro Manualmente</h2></div>
        <div class="modal-body">
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px;">
                Nota: Se recomienda usar <b>Códigos de Invitación</b> para que los miembros se unan solos. Use esto solo si necesita crear un perfil pre-existente.
            </p>
            <div class="form-group">
                <label class="form-label">Nombre</label>
                <input class="form-input" id="add-mem-name" placeholder="Nombre completo">
            </div>
            <div class="form-group">
                <label class="form-label">Email (Opcional)</label>
                <input class="form-input" id="add-mem-email" placeholder="email@ejemplo.com">
            </div>
            <div class="form-group">
                <label class="form-label">Rol</label>
                <select class="form-select" id="add-mem-role">
                    <option value="member">Miembro</option>
                    <option value="admin">Administrador</option>
                </select>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" id="add-mem-save">Crear Miembro</button>
        </div>
    `);

    modal.querySelector('#add-mem-save').onclick = async () => {
        const name = modal.querySelector('#add-mem-name').value.trim();
        const email = modal.querySelector('#add-mem-email').value.trim();
        const role = modal.querySelector('#add-mem-role').value;
        if (!name) return showToast('Nombre es requerido', 'error');

        // Master Key check if role is admin
        const config = syncManager.getConfig();
        if (role === 'admin' && config.admin_key_hash) {
            const key = prompt('Ingresa la Clave Maestra de Administrador para crear un nuevo Administrador:');
            if (!key) return;
            const cryptoLayer = await import('./utils/crypto.js');
            const hash = await cryptoLayer.hashPassword(key);
            if (hash !== config.admin_key_hash) return showToast('Clave Maestra incorrecta.', 'error');
        }

        await store.dispatch('ADD_MEMBER', {
            name,
            email,
            role,
            avatar: name.charAt(0).toUpperCase(),
            joinedAt: new Date().toISOString()
        });

        closeModal();
        showToast('Miembro añadido.', 'success');
        renderAdmin(document.getElementById('app-root'));
    };
};

window.renderAdmin = renderAdmin;
