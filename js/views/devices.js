/**
 * views/devices.js — Dispositivos vinculados y usuarios activos
 * Accesible en #/devices (ruta no visible en la navegación)
 */

function renderDevices(root) {
    const devices = window.getDevicesRegistry ? getDevicesRegistry() : [];
    const revoked = window.getRevokedDevices ? getRevokedDevices() : [];
    const currentId = window.getOrCreateDeviceId ? getOrCreateDeviceId() : '';
    const members = store.get.members();
    const tasks = store.get.allTasks();
    const cfg = window.syncManager ? syncManager.getConfig() : {};
    const now = Date.now();

    // ── Helpers ───────────────────────────────────────────────────────────────
    const fmtTs = (ts) => {
        if (!ts) return '—';
        const diff = now - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 2) return 'Ahora mismo';
        if (mins < 60) return `Hace ${mins} min`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `Hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `Hace ${days}d`;
        return new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
    };

    const fmtDate = (ts) => ts
        ? new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

    const platformIcon = (p) => p === 'mobile' ? 'smartphone' : 'monitor';

    // ── Per-member activity (last 7 days) ────────────────────────────────────
    const last7d = now - 7 * 24 * 60 * 60 * 1000;
    const memberActivity = new Map();
    tasks.forEach(t => {
        if (t.updatedAt >= last7d && t.assigneeId) {
            memberActivity.set(t.assigneeId, (memberActivity.get(t.assigneeId) || 0) + 1);
        }
    });

    // ── Sync status ───────────────────────────────────────────────────────────
    const lastSync = localStorage.getItem('last_sync_local');
    const syncStatus = lastSync
        ? `Última sync: ${fmtTs(Number(lastSync))}`
        : 'Sin sincronización reciente';
    const hasSync = !!(cfg.clientId && cfg.fileName);

    // ── Current device card ───────────────────────────────────────────────────
    const currentDevice = devices.find(d => d.id === currentId) || {
        id: currentId,
        name: window.getDeviceName ? getDeviceName() : 'Este dispositivo',
        platform: 'desktop', browser: '—', lastSeen: now,
    };

    const currentDeviceCard = `
        <div style="background:linear-gradient(135deg,var(--accent-primary)15,var(--bg-secondary));border:1px solid var(--accent-primary);border-radius:12px;padding:20px 24px;display:flex;align-items:center;gap:18px;">
          <div style="width:48px;height:48px;border-radius:12px;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-feather="${platformIcon(currentDevice.platform)}" style="width:24px;height:24px;color:#fff;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:8px;">
              ${esc(currentDevice.name)}
              <span style="font-size:0.7rem;background:var(--accent-primary);color:#fff;padding:2px 8px;border-radius:10px;font-weight:500;">Este dispositivo</span>
            </div>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;">
              <span><i data-feather="globe" style="width:12px;height:12px;"></i> ${esc(currentDevice.browser || '—')}</span>
              <span><i data-feather="clock" style="width:12px;height:12px;"></i> ${syncStatus}</span>
              <span><i data-feather="calendar" style="width:12px;height:12px;"></i> Registrado ${fmtDate(currentDevice.registeredAt)}</span>
            </div>
          </div>
          <button class="btn btn-ghost" id="device-rename-self" style="flex-shrink:0;">
            <i data-feather="edit-2" style="width:14px;height:14px;"></i> Renombrar
          </button>
        </div>`;

    // ── Active devices list ───────────────────────────────────────────────────
    const otherDevices = devices.filter(d => d.id !== currentId);
    const activeDeviceRows = otherDevices.length === 0
        ? `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.88rem;">
             <i data-feather="monitor" style="width:32px;height:32px;opacity:0.3;display:block;margin:0 auto 8px;"></i>
             Sin otros dispositivos vinculados. Comparte el Shared File ID para vincular más.
           </div>`
        : otherDevices.map(d => {
            const isRecent = d.lastSeen && (now - d.lastSeen) < 60 * 60 * 1000;
            return `
            <div class="device-page-row" data-id="${esc(d.id)}" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:10px;background:var(--bg-secondary);border:1px solid var(--border-color);transition:border-color 0.2s;">
              <div style="position:relative;flex-shrink:0;">
                <i data-feather="${platformIcon(d.platform)}" style="width:22px;height:22px;color:var(--text-muted);"></i>
                <span style="position:absolute;bottom:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:${isRecent ? 'var(--accent-success,#27ae60)' : 'var(--text-muted)'};border:2px solid var(--bg-primary);"></span>
              </div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.92rem;">${esc(d.name)}</div>
                <div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;display:flex;gap:10px;flex-wrap:wrap;">
                  <span>${esc(d.browser || '—')}</span>
                  <span>·</span>
                  <span>${esc(d.platform === 'mobile' ? 'Móvil' : 'Escritorio')}</span>
                  <span>·</span>
                  <span>Visto ${fmtTs(d.lastSeen)}</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span style="font-size:0.72rem;padding:2px 8px;border-radius:6px;background:${isRecent ? 'rgba(39,174,96,0.15)' : 'var(--bg-tertiary,var(--bg-secondary))'};color:${isRecent ? 'var(--accent-success,#27ae60)' : 'var(--text-muted)'};">
                  ${isRecent ? 'Activo' : 'Inactivo'}
                </span>
                <button class="btn btn-ghost btn-sm device-revoke-page-btn" data-id="${esc(d.id)}" data-name="${esc(d.name)}" style="font-size:0.75rem;padding:4px 10px;color:var(--accent-danger);" title="Revocar acceso">
                  <i data-feather="shield-off" style="width:12px;height:12px;"></i> Revocar
                </button>
              </div>
            </div>`;
        }).join('');

    // ── Revoked devices list ──────────────────────────────────────────────────
    const revokedRows = revoked.length === 0 ? '' : `
        <section style="margin-top:32px;">
          <h2 style="font-size:1rem;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
            <i data-feather="shield-off" style="width:16px;height:16px;color:var(--accent-danger);"></i>
            Dispositivos revocados
            <span style="font-size:0.75rem;background:var(--accent-danger);color:#fff;padding:1px 8px;border-radius:10px;">${revoked.length}</span>
          </h2>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${revoked.map(r => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:var(--bg-secondary);border:1px solid var(--accent-danger);opacity:0.85;">
              <i data-feather="shield-off" style="width:20px;height:20px;color:var(--accent-danger);flex-shrink:0;"></i>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:0.9rem;color:var(--accent-danger);">${esc(r.name || r.id)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">Revocado ${fmtTs(r.revokedAt)}</div>
              </div>
              <button class="btn btn-ghost btn-sm device-unrevoce-page-btn" data-id="${esc(r.id)}" style="font-size:0.75rem;padding:4px 10px;color:var(--accent-success,#27ae60);">
                <i data-feather="shield-check" style="width:12px;height:12px;"></i> Restaurar
              </button>
            </div>`).join('')}
          </div>
        </section>`;

    // ── Members / Users table ─────────────────────────────────────────────────
    const currentUser = getCurrentWorkspaceUser();
    const memberRows = members.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.88rem;">Sin miembros registrados.</td></tr>`
        : members.map(m => {
            const isCurrentUser = m.id === currentUser.memberId
                || (m.email && m.email === currentUser.email)
                || m.name === currentUser.name;
            const activity = memberActivity.get(m.id) || 0;
            const memberTasks = tasks.filter(t => t.assigneeId === m.id);
            const activeTasks = memberTasks.filter(t => t.status !== 'Terminado' && t.status !== 'Archivado').length;
            const doneTasks = memberTasks.filter(t => t.status === 'Terminado').length;
            return `
            <tr style="${isCurrentUser ? 'background:rgba(var(--accent-primary-rgb,94,106,210),0.06);' : ''}">
              <td style="padding:12px 14px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;color:#fff;flex-shrink:0;">${esc((m.name || '?').charAt(0).toUpperCase())}</div>
                  <div>
                    <div style="font-weight:600;font-size:0.88rem;">${esc(m.name)}${isCurrentUser ? ' <span style="font-size:0.68rem;background:var(--accent-primary);color:#fff;padding:1px 6px;border-radius:8px;">Tú</span>' : ''}</div>
                    ${m.email ? `<div style="font-size:0.73rem;color:var(--text-muted);">${esc(m.email)}</div>` : ''}
                  </div>
                </div>
              </td>
              <td style="padding:12px 14px;font-size:0.83rem;color:var(--text-muted);">${esc(m.role || '—')}</td>
              <td style="padding:12px 14px;text-align:center;">
                <span style="font-size:0.82rem;font-weight:600;color:${activeTasks > 0 ? 'var(--accent-warning)' : 'var(--text-muted)'};">${activeTasks}</span>
                <span style="font-size:0.72rem;color:var(--text-muted);"> activas</span>
              </td>
              <td style="padding:12px 14px;text-align:center;">
                <span style="font-size:0.82rem;font-weight:600;color:var(--accent-success,#27ae60);">${doneTasks}</span>
              </td>
              <td style="padding:12px 14px;text-align:center;">
                ${activity > 0
                    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:0.78rem;background:rgba(39,174,96,0.12);color:var(--accent-success,#27ae60);padding:2px 8px;border-radius:8px;font-weight:500;"><i data-feather="activity" style="width:11px;height:11px;"></i>${activity} acciones</span>`
                    : `<span style="font-size:0.78rem;color:var(--text-muted);">Sin actividad</span>`}
              </td>
            </tr>`;
        }).join('');

    // ── Stats summary ────────────────────────────────────────────────────────
    const totalActive = devices.length;
    const totalRevoked = revoked.length;
    const totalMembers = members.length;
    const recentDevices = devices.filter(d => d.lastSeen && (now - d.lastSeen) < 24 * 60 * 60 * 1000).length;

    // ── Render ────────────────────────────────────────────────────────────────
    root.innerHTML = `
    <div class="view-container" style="max-width:860px;margin:0 auto;padding:24px 20px;">

      <!-- Header -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:28px;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 style="font-size:1.4rem;font-weight:700;margin:0 0 4px;">Dispositivos y Usuarios</h1>
          <p style="margin:0;color:var(--text-muted);font-size:0.85rem;">Acceso vinculado al workspace · ${hasSync ? `Sync activo — ${esc(cfg.fileName || 'archivo compartido')}` : 'Sync no configurado'}</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="devices-page-refresh" title="Actualizar datos">
            <i data-feather="refresh-cw" style="width:14px;height:14px;"></i> Actualizar
          </button>
          ${hasSync ? `<button class="btn btn-primary btn-sm" id="devices-page-push" style="font-size:0.82rem;">
            <i data-feather="upload-cloud" style="width:14px;height:14px;"></i> Push cambios
          </button>` : ''}
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:28px;">
        <div style="background:var(--bg-secondary);border-radius:10px;padding:14px 16px;border:1px solid var(--border-color);">
          <div style="font-size:1.6rem;font-weight:700;color:var(--accent-primary);">${totalActive}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Dispositivos activos</div>
        </div>
        <div style="background:var(--bg-secondary);border-radius:10px;padding:14px 16px;border:1px solid var(--border-color);">
          <div style="font-size:1.6rem;font-weight:700;color:var(--accent-success,#27ae60);">${recentDevices}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Vistos hoy</div>
        </div>
        <div style="background:var(--bg-secondary);border-radius:10px;padding:14px 16px;border:1px solid var(--border-color);">
          <div style="font-size:1.6rem;font-weight:700;color:${totalRevoked > 0 ? 'var(--accent-danger)' : 'var(--text-muted)'};">${totalRevoked}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Revocados</div>
        </div>
        <div style="background:var(--bg-secondary);border-radius:10px;padding:14px 16px;border:1px solid var(--border-color);">
          <div style="font-size:1.6rem;font-weight:700;">${totalMembers}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Usuarios</div>
        </div>
      </div>

      <!-- Este dispositivo -->
      <section style="margin-bottom:28px;">
        <h2 style="font-size:1rem;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <i data-feather="monitor" style="width:16px;height:16px;"></i> Este dispositivo
        </h2>
        ${currentDeviceCard}
      </section>

      <!-- Otros dispositivos -->
      <section style="margin-bottom:8px;">
        <h2 style="font-size:1rem;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <i data-feather="link" style="width:16px;height:16px;"></i>
          Otros dispositivos vinculados
          <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">${otherDevices.length}</span>
        </h2>
        <div style="display:flex;flex-direction:column;gap:8px;" id="devices-active-list">
          ${activeDeviceRows}
        </div>
      </section>

      ${revokedRows}

      <!-- Separador -->
      <hr style="border:none;border-top:1px solid var(--border-color);margin:32px 0;">

      <!-- Usuarios / Miembros -->
      <section>
        <h2 style="font-size:1rem;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <i data-feather="users" style="width:16px;height:16px;"></i> Usuarios del workspace
          <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">${totalMembers}</span>
        </h2>
        <div style="background:var(--bg-secondary);border-radius:10px;border:1px solid var(--border-color);overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color);">
                <th style="padding:10px 14px;text-align:left;font-size:0.78rem;color:var(--text-muted);font-weight:500;">Usuario</th>
                <th style="padding:10px 14px;text-align:left;font-size:0.78rem;color:var(--text-muted);font-weight:500;">Rol</th>
                <th style="padding:10px 14px;text-align:center;font-size:0.78rem;color:var(--text-muted);font-weight:500;">Tareas activas</th>
                <th style="padding:10px 14px;text-align:center;font-size:0.78rem;color:var(--text-muted);font-weight:500;">Terminadas</th>
                <th style="padding:10px 14px;text-align:center;font-size:0.78rem;color:var(--text-muted);font-weight:500;">Actividad (7d)</th>
              </tr>
            </thead>
            <tbody id="members-table-body">
              ${memberRows}
            </tbody>
          </table>
        </div>
        ${members.length === 0 ? '' : `<p style="font-size:0.76rem;color:var(--text-muted);margin-top:8px;">Actividad basada en tareas actualizadas en los últimos 7 días.</p>`}
      </section>

    </div>`;

    if (window.feather) feather.replace();

    // ── Event bindings ────────────────────────────────────────────────────────

    root.querySelector('#device-rename-self')?.addEventListener('click', () => {
        const newName = prompt('Nombre para este dispositivo:', window.getDeviceName ? getDeviceName() : '');
        if (newName && newName.trim()) {
            window.setDeviceName(newName.trim());
            window.updateCurrentDeviceInRegistry();
            showToast('Nombre actualizado.', 'success');
            renderDevices(root);
        }
    });

    root.querySelector('#devices-page-refresh')?.addEventListener('click', () => {
        renderDevices(root);
        showToast('Vista actualizada.', 'info');
    });

    root.querySelector('#devices-page-push')?.addEventListener('click', async () => {
        if (window.syncManager) {
            showToast('Subiendo cambios…', 'info');
            await syncManager.push();
        }
    });

    root.querySelectorAll('.device-revoke-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const name = btn.dataset.name || id;
            if (!confirm(`¿Revocar acceso al dispositivo "${name}"?\n\nNo podrá sincronizar hasta que lo restaures. Haz Push para propagar el cambio.`)) return;
            if (window.revokeDevice) revokeDevice(id, name);
            showToast(`"${name}" revocado. Haz Push para propagar.`, 'warning', true);
            renderDevices(root);
        });
    });

    root.querySelectorAll('.device-unrevoce-page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (window.unRevokeDevice) unRevokeDevice(id);
            showToast('Acceso restaurado. Haz Push para propagar.', 'success', true);
            renderDevices(root);
        });
    });
}

window.renderDevices = renderDevices;
