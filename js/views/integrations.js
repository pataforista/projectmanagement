/**
 * views/integrations.js — Integrations Hub
 */

function renderIntegrations(root) {
  const syncConfig = (window.syncManager?.getConfig) ? syncManager.getConfig() : {};
  const zoteroCreds = (window.zoteroApi?.getCredentials) ? zoteroApi.getCredentials() : { userId: '', apiKey: '' };

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Integraciones y APIs</h1>
          <p class="view-subtitle">Conecta tu Workspace con herramientas externas.</p>
        </div>
      </div>

      <div class="integrations-grid">
        
        <!-- Google Cloud Ecosystem -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon google"><i data-feather="cloud"></i></div>
            <div class="integration-title">
              <h3>Google Cloud</h3>
              <span class="badge ${syncConfig.clientId ? 'badge-success' : 'badge-neutral'}">
                ${syncConfig.clientId ? 'Configurado' : 'No conectado'}
              </span>
            </div>
          </div>
          <div class="integration-body">
            <p>Sincroniza tus datos, calendario y tareas con Google.</p>
            <div class="integration-services">
              <label class="checkbox-item">
                <input type="checkbox" checked disabled> 
                <span>Google Drive (Backup & Team)</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" id="sync-google-calendar" ${localStorage.getItem('sync_gcal') === 'true' ? 'checked' : ''}> 
                <span>Google Calendar (Eventos)</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" id="sync-google-tasks" ${localStorage.getItem('sync_gtasks') === 'true' ? 'checked' : ''}> 
                <span>Google Tasks (Tareas)</span>
              </label>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="syncManager?.openPanel()" style="margin-top:16px;width:100%;">
              Configurar Google API
            </button>
          </div>
        </div>

        <!-- Zotero -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon zotero"><i data-feather="book"></i></div>
            <div class="integration-title">
              <h3>Zotero</h3>
              <span class="badge ${zoteroCreds.userId ? 'badge-success' : 'badge-neutral'}">
                ${zoteroCreds.userId ? 'Conectado' : 'No conectado'}
              </span>
            </div>
          </div>
          <div class="integration-body">
            <p>Gestiona tus referencias bibliográficas e investigación.</p>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">Zotero User ID</label>
                <input type="text" class="form-input" id="int-zot-uid" value="${esc(zoteroCreds.userId || '')}" placeholder="ID de usuario">
            </div>
            <div class="form-group" style="margin-top:8px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">API Key</label>
                <input type="password" class="form-input" id="int-zot-key" value="${esc(zoteroCreds.apiKey || '')}" placeholder="Skey...">
            </div>
            <button class="btn btn-primary btn-sm" id="btn-save-zotero" style="margin-top:16px;width:100%;">
              Guardar Zotero
            </button>
          </div>
        </div>

        <!-- Todoist -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon todoist"><i data-feather="check-circle"></i></div>
            <div class="integration-title">
              <h3>Todoist</h3>
              <span class="badge ${localStorage.getItem('todoist_token') ? 'badge-success' : 'badge-neutral'}">${localStorage.getItem('todoist_token') ? 'Conectado' : 'No conectado'}</span>
            </div>
          </div>
          <div class="integration-body">
            <p>Importa y exporta tareas con Todoist.</p>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">API Token</label>
                <input type="password" class="form-input" id="int-todoist-token" value="${esc(localStorage.getItem('todoist_token') || '')}" placeholder="Token de Todoist">
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button class="btn btn-primary btn-sm flex-1" id="btn-save-todoist" style="flex:1;">
                Guardar Token
              </button>
              <button class="btn btn-ghost btn-sm" id="btn-sync-todoist" ${!localStorage.getItem('todoist_token') ? 'disabled' : ''}>
                <i data-feather="refresh-cw"></i> Sincronizar
              </button>
            </div>
          </div>
        </div>

        <!-- Claude AI -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon" style="background:linear-gradient(135deg,#d97706,#b45309);"><i data-feather="cpu"></i></div>
            <div class="integration-title">
              <h3>Claude AI</h3>
              <span class="badge ${localStorage.getItem('claude_api_key') ? 'badge-success' : 'badge-neutral'}">
                ${localStorage.getItem('claude_api_key') ? 'Configurado' : 'No configurado'}
              </span>
            </div>
          </div>
          <div class="integration-body">
            <p>Genera resúmenes inteligentes de tus referencias Zotero con IA.</p>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">API Key de Anthropic</label>
                <input type="password" class="form-input" id="int-claude-key" value="${esc(localStorage.getItem('claude_api_key') || '')}" placeholder="sk-ant-...">
            </div>
            <button class="btn btn-primary btn-sm" id="btn-save-claude" style="margin-top:16px;width:100%;">
              Guardar API Key
            </button>
          </div>
        </div>

        <!-- Seguridad -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon"><i data-feather="shield"></i></div>
            <div class="integration-title">
              <h3>Seguridad</h3>
              <span class="badge ${localStorage.getItem('workspace_lock_hash') ? 'badge-success' : 'badge-neutral'}">${localStorage.getItem('workspace_lock_hash') ? 'Protegido' : 'Sin contraseña'}</span>
            </div>
          </div>
          <div class="integration-body">
            <p>Protege el acceso al Workspace con contraseña.</p>
            <div class="form-group" style="margin-top:12px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">Nueva Contraseña</label>
              <input type="password" class="form-input" id="int-new-pwd" placeholder="Mínimo 4 caracteres">
            </div>
            <label class="checkbox-item" style="margin-top:8px;">
              <input type="checkbox" id="int-autolock" ${localStorage.getItem('autolock_enabled') === 'true' ? 'checked' : ''}>
              <span>Bloquear al minimizar</span>
            </label>
            <button class="btn btn-primary btn-sm" id="btn-save-security" style="margin-top:16px;width:100%;">
              Guardar Seguridad
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  feather.replace();

  // Bind events
  root.querySelector('#btn-save-zotero')?.addEventListener('click', () => {
    const uid = root.querySelector('#int-zot-uid').value.trim();
    const key = root.querySelector('#int-zot-key').value.trim();
    if (window.zoteroApi?.setCredentials) {
      zoteroApi.setCredentials(uid, key);
    } else {
      localStorage.setItem('zotero_uid', uid);
      localStorage.setItem('zotero_key', key);
    }
    showToast('Zotero configurado con éxito', 'success');
    renderIntegrations(root);
  });

  root.querySelector('#sync-google-calendar')?.addEventListener('change', (e) => {
    localStorage.setItem('sync_gcal', e.target.checked);
    showToast(`Google Calendar ${e.target.checked ? 'activado' : 'desactivado'}`, 'info');
  });

  root.querySelector('#sync-google-tasks')?.addEventListener('change', (e) => {
    localStorage.setItem('sync_gtasks', e.target.checked);
    showToast(`Google Tasks ${e.target.checked ? 'activado' : 'desactivado'}`, 'info');
  });

  root.querySelector('#btn-save-claude')?.addEventListener('click', () => {
    const key = root.querySelector('#int-claude-key').value.trim();
    if (key) {
      localStorage.setItem('claude_api_key', key);
      showToast('API Key de Claude guardada.', 'success');
    } else {
      localStorage.removeItem('claude_api_key');
      showToast('API Key eliminada.', 'info');
    }
    renderIntegrations(root);
  });

  root.querySelector('#btn-save-todoist')?.addEventListener('click', () => {
    const token = root.querySelector('#int-todoist-token').value.trim();
    localStorage.setItem('todoist_token', token);
    showToast(token ? 'Token de Todoist guardado.' : 'Token eliminado.', token ? 'success' : 'info');
    renderIntegrations(root);
  });

  root.querySelector('#btn-sync-todoist')?.addEventListener('click', () => {
    if (window.syncManager?.syncTodoist) {
      syncManager.syncTodoist();
      showToast('Enviando tareas a Todoist...', 'info');
    }
  });

  root.querySelector('#btn-save-security')?.addEventListener('click', () => {
    const pwd = root.querySelector('#int-new-pwd').value;
    const autolock = root.querySelector('#int-autolock').checked;
    if (pwd.length >= 4) {
      const hashStr = str => { let h = 0; for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0; return h.toString(); };
      localStorage.setItem('workspace_lock_hash', hashStr(pwd));
      showToast('Contraseña establecida correctamente.', 'success');
    } else if (pwd.length > 0) {
      showToast('La contraseña debe tener al menos 4 caracteres.', 'error');
      return;
    }
    localStorage.setItem('autolock_enabled', autolock);
    showToast('Configuración de seguridad guardada.', 'success');
    renderIntegrations(root);
  });
}

window.renderIntegrations = renderIntegrations;
