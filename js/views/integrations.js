/**
 * views/integrations.js — Integrations Hub
 */

function renderIntegrations(root) {
  const syncConfig = (window.syncManager?.getConfig) ? syncManager.getConfig() : {};
  const zoteroCreds = (window.zoteroApi?.getCredentials) ? zoteroApi.getCredentials() : { userId: '', apiKey: '' };
  const zenodoCreds = (window.zenodoApi?.getCredentials) ? zenodoApi.getCredentials() : { token: '', sandbox: true };

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
             <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
              Sincroniza tus datos de equipo mediante Drive Workspace.
            </p>
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
            <div style="margin-top:12px; padding:10px 12px; background:rgba(var(--accent-warning-rgb,255,200,0),0.08); border:1px solid rgba(var(--accent-warning-rgb,255,200,0),0.25); border-radius:8px; font-size:0.75rem; color:var(--text-secondary); line-height:1.5;">
              <strong style="color:var(--text-primary);">⚠ Escenario Drive Vacío</strong><br>
              Si pierdes acceso a Google Drive <em>y</em> limpias el caché del navegador, los datos cifrados en IndexedDB quedarán inaccesibles sin el salt criptográfico. Descarga una copia de seguridad y guárdala en un lugar seguro (gestor de contraseñas, pendrive cifrado).
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-export-identity" style="margin-top:8px;width:100%;">
              Exportar identidad criptográfica
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
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
              Obtén tu <strong>User ID</strong> y crea una nueva <strong>API Key</strong> desde <a href="https://www.zotero.org/settings/keys" target="_blank" style="color:var(--accent-primary);">zotero.org/settings/keys</a>.
            </p>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">Zotero User ID</label>
                <input type="text" class="form-input" id="int-zot-uid" value="${esc(zoteroCreds.userId || '')}" placeholder="ID de usuario (Ej: 1234567)">
            </div>
            <div class="form-group" style="margin-top:8px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">API Key</label>
                <input type="password" class="form-input" id="int-zot-key" value="${esc(zoteroCreds.apiKey || '')}" placeholder="Tu clave secreta...">
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button class="btn btn-primary btn-sm flex-1" id="btn-save-zotero" style="flex:1;">Guardar</button>
              <button class="btn btn-secondary btn-sm" id="btn-test-zotero" title="Probar conexión"><i data-feather="loader" style="display:none;" class="spin"></i> Probar</button>
            </div>
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
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
              Encuentra tu API Token personal en <a href="https://todoist.com/prefs/integrations" target="_blank" style="color:var(--accent-primary);">Configuración > Integraciones > Developer</a>.
            </p>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-size:0.75rem; color:var(--text-muted);">API Token</label>
                <input type="password" class="form-input" id="int-todoist-token" value="${esc(localStorage.getItem('todoist_token') || '')}" placeholder="API Token v2">
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button class="btn btn-primary btn-sm flex-1" id="btn-save-todoist" style="flex:1;">Guardar</button>
              <button class="btn btn-secondary btn-sm" id="btn-test-todoist" title="Probar conexión"><i data-feather="loader" style="display:none;" class="spin"></i> Probar</button>
            </div>
            <button class="btn btn-ghost btn-sm" id="btn-sync-todoist" style="margin-top:8px;width:100%;" ${!localStorage.getItem('todoist_token') ? 'disabled' : ''}>
              <i data-feather="refresh-cw"></i> Sincronizar Tareas Ahora
            </button>
          </div>
        </div>

        <!-- Zenodo -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon" style="background:linear-gradient(135deg,#1f6feb,#0d4a8a);"><i data-feather="globe"></i></div>
            <div class="integration-title">
              <h3>Zenodo</h3>
              <span class="badge ${zenodoCreds.token ? 'badge-success' : 'badge-neutral'}">
                ${zenodoCreds.token ? (zenodoCreds.sandbox ? 'Sandbox' : 'Producción') : 'No conectado'}
              </span>
            </div>
          </div>
          <div class="integration-body">
             <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
              Genera tu token en <a href="https://zenodo.org/account/settings/applications/tokens/new" target="_blank" style="color:var(--accent-primary);">Applications > Personal access tokens</a>.
            </p>
            <div class="form-group" style="margin-top:12px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">Access Token</label>
              <input type="password" class="form-input" id="int-zenodo-token"
                value="${esc(zenodoCreds.token || '')}" placeholder="Token personal">
            </div>
            <label class="checkbox-item" style="margin-top:8px;">
              <input type="checkbox" id="int-zenodo-sandbox" ${zenodoCreds.sandbox !== false ? 'checked' : ''}>
              <span>Usar Sandbox (entorno de pruebas)</span>
            </label>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button class="btn btn-primary btn-sm flex-1" id="btn-save-zenodo" style="flex:1;">Guardar</button>
              <button class="btn btn-secondary btn-sm" id="btn-test-zenodo" title="Probar conexión"><i data-feather="loader" style="display:none;" class="spin"></i> Probar</button>
            </div>
          </div>
        </div>

        <!-- Ollama (IA Local) -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon" style="background:var(--accent-teal);"><i data-feather="cpu"></i></div>
            <div class="integration-title">
              <h3>Ollama (IA Local)</h3>
              <span class="badge ${localStorage.getItem('ollama_url') ? 'badge-success' : 'badge-neutral'}">
                ${localStorage.getItem('ollama_url') ? 'Habilitado' : 'No configurado'}
              </span>
            </div>
          </div>
          <div class="integration-body">
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
              Asegúrate de que Ollama esté ejecutándose localmente. P ej: <code>OLLAMA_ORIGINS="*" ollama serve</code>
            </p>
            <div class="form-group" style="margin-top:12px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">Servidor URL</label>
              <input type="text" class="form-input" id="int-ollama-url"
                value="${esc(localStorage.getItem('ollama_url') || 'http://localhost:11434')}" placeholder="http://localhost:11434">
            </div>
            <div class="form-group" style="margin-top:8px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">Modelo Base</label>
              <input type="text" class="form-input" id="int-ollama-model"
                value="${esc(localStorage.getItem('ollama_model') || 'llama3')}" placeholder="Ej: mistral, llama3">
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button class="btn btn-primary btn-sm flex-1" id="btn-save-ollama" style="flex:1;">Guardar</button>
              <button class="btn btn-secondary btn-sm" id="btn-test-ollama" title="Probar conexión"><i data-feather="loader" style="display:none;" class="spin"></i> Probar</button>
            </div>
          </div>
        </div>

        <!-- eLabFTW -->
        <div class="card glass-panel integration-card">
          <div class="integration-header">
            <div class="integration-icon" style="background:#e11d48;"><i data-feather="activity"></i></div>
            <div class="integration-title">
              <h3>eLabFTW</h3>
              <span class="badge ${localStorage.getItem('elabftw_api_key') ? 'badge-success' : 'badge-neutral'}">
                ${localStorage.getItem('elabftw_api_key') ? 'Conectado' : 'No conectado'}
              </span>
            </div>
          </div>
          <div class="integration-body">
             <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">
              Crea tu API Key desde el panel de usuario de tu instancia institucional de eLabFTW.
            </p>
            <div class="form-group" style="margin-top:12px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">Instancia URL</label>
              <input type="text" class="form-input" id="int-elab-url"
                value="${esc(localStorage.getItem('elabftw_url') || '')}" placeholder="https://elab.tu-institucion.edu">
            </div>
            <div class="form-group" style="margin-top:8px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">API Key</label>
              <input type="password" class="form-input" id="int-elab-key"
                value="${esc(localStorage.getItem('elabftw_api_key') || '')}" placeholder="Tu clave API">
            </div>
            <div style="display:flex; gap:8px; margin-top:16px;">
              <button class="btn btn-primary btn-sm flex-1" id="btn-save-elab" style="flex:1;">Guardar</button>
              <button class="btn btn-secondary btn-sm" id="btn-test-elab" title="Probar conexión"><i data-feather="loader" style="display:none;" class="spin"></i> Probar</button>
            </div>
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
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">Protege el acceso local al Workspace usando un código PIN o contraseña.</p>
            <div class="form-group" style="margin-top:12px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">Nueva Contraseña</label>
              <input type="password" class="form-input" id="int-new-pwd" placeholder="Mínimo 4 caracteres">
            </div>
            <label class="checkbox-item" style="margin-top:8px;">
              <input type="checkbox" id="int-autolock" ${localStorage.getItem('autolock_enabled') === 'true' ? 'checked' : ''}>
              <span>Bloquear al minimizar pantalla</span>
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

  // ── Cryptographic identity backup ──────────────────────────────────────────
  root.querySelector('#btn-export-identity')?.addEventListener('click', () => {
    const salt = localStorage.getItem('nexus_salt');
    const lockHash = localStorage.getItem('workspace_lock_hash');
    if (!salt) {
      if (window.showToast) showToast('No hay identidad criptográfica almacenada en este dispositivo aún.', 'warning');
      return;
    }
    const payload = {
      nexus_salt: salt,
      workspace_lock_hash: lockHash || null,
      exported_at: new Date().toISOString(),
      note: 'Guarda este archivo en un lugar seguro (gestor de contraseñas o pendrive cifrado). Necesitas también tu contraseña maestra para recuperar el acceso.'
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-identity-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.showToast) showToast('Identidad criptográfica exportada. Guárdala en un lugar seguro.', 'success');
  });
  // ────────────────────────────────────────────────────────────────────────────

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

  root.querySelector('#btn-save-zenodo')?.addEventListener('click', () => {
    const token = root.querySelector('#int-zenodo-token').value.trim();
    const sandbox = root.querySelector('#int-zenodo-sandbox').checked;
    if (window.zenodoApi?.setCredentials) {
      zenodoApi.setCredentials(token, sandbox);
    } else {
      localStorage.setItem('zenodo_token', token);
      localStorage.setItem('zenodo_sandbox', String(sandbox));
    }
    showToast(token ? `Zenodo guardado (${sandbox ? 'sandbox' : 'producción'}).` : 'Token eliminado.', token ? 'success' : 'info');
    renderIntegrations(root);
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

  root.querySelector('#btn-save-ollama')?.addEventListener('click', () => {
    const url = root.querySelector('#int-ollama-url').value.trim();
    const model = root.querySelector('#int-ollama-model').value.trim();
    if (window.ollamaApi?.setSettings) {
      ollamaApi.setSettings(url, model);
    } else {
      localStorage.setItem('ollama_url', url);
      localStorage.setItem('ollama_model', model);
    }
    showToast('Ollama configurado correctamente', 'success');
    renderIntegrations(root);
  });

  root.querySelector('#btn-save-elab')?.addEventListener('click', () => {
    const url = root.querySelector('#int-elab-url').value.trim();
    const key = root.querySelector('#int-elab-key').value.trim();
    if (window.elabftwApi?.setCredentials) {
      elabftwApi.setCredentials(url, key);
    } else {
      localStorage.setItem('elabftw_url', url);
      localStorage.setItem('elabftw_api_key', key);
    }
    showToast('eLabFTW configurado correctamente', 'success');
    renderIntegrations(root);
  });

  // ------------------------------------------------------------------
  // TEST CONNECTIONS
  // ------------------------------------------------------------------

  async function testApi(buttonSelector, textTarget, fetchFn) {
    const btn = root.querySelector(buttonSelector);
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-feather="loader" class="spin" style="width:14px;height:14px;margin-right:4px;"></i> Probando`;
    feather.replace();

    try {
      await fetchFn();
      btn.innerHTML = `<i data-feather="check" style="width:14px;height:14px;margin-right:4px;"></i> Conectado`;
      btn.style.color = "var(--accent-teal)";
      setTimeout(() => { btn.innerHTML = originalText; btn.style.color = ""; }, 3000);
    } catch (err) {
      btn.innerHTML = `<i data-feather="x" style="width:14px;height:14px;margin-right:4px;"></i> Error`;
      btn.style.color = "var(--accent-danger)";
      showToast(`Error de conexión: ${err.message}`, 'error');
      setTimeout(() => { btn.innerHTML = originalText; btn.style.color = ""; }, 5000);
    }
  }

  root.querySelector('#btn-test-zotero')?.addEventListener('click', () => {
    testApi('#btn-test-zotero', 'Probar', async () => {
      const uid = root.querySelector('#int-zot-uid').value.trim();
      const key = root.querySelector('#int-zot-key').value.trim();
      if (!uid || !key) throw new Error("Faltan credenciales");
      const res = await fetch(`https://api.zotero.org/users/${uid}/items/top?v=3&limit=1`, { headers: { 'Zotero-API-Key': key } });
      if (!res.ok) throw new Error("Acceso denegado o usuario inválido");
    });
  });

  root.querySelector('#btn-test-todoist')?.addEventListener('click', () => {
    testApi('#btn-test-todoist', 'Probar', async () => {
      const token = root.querySelector('#int-todoist-token').value.trim();
      if (!token) throw new Error("Falta el API Token");
      const res = await fetch('https://api.todoist.com/rest/v2/projects', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error("Token revocado o inválido");
    });
  });

  root.querySelector('#btn-test-zenodo')?.addEventListener('click', () => {
    testApi('#btn-test-zenodo', 'Probar', async () => {
      const token = root.querySelector('#int-zenodo-token').value.trim();
      const sandbox = root.querySelector('#int-zenodo-sandbox').checked;
      if (!token) throw new Error("Falta el API Token");
      const base = sandbox ? 'https://sandbox.zenodo.org/api' : 'https://zenodo.org/api';
      const res = await fetch(`${base}/deposit/depositions?size=1`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error("Token incorrecto o cuenta restringida");
    });
  });

  root.querySelector('#btn-test-ollama')?.addEventListener('click', () => {
    testApi('#btn-test-ollama', 'Probar', async () => {
      let url = root.querySelector('#int-ollama-url').value.trim();
      if (!url) throw new Error("Falta la URL del servidor local");
      url = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetch(`${url}/api/tags`);
      if (!res.ok) throw new Error(`El servidor respondió con error ${res.status}`);
      await res.json();
    });
  });

  root.querySelector('#btn-test-elab')?.addEventListener('click', () => {
    testApi('#btn-test-elab', 'Probar', async () => {
      let url = root.querySelector('#int-elab-url').value.trim();
      const key = root.querySelector('#int-elab-key').value.trim();
      if (!url || !key) throw new Error("Falta la URL o la API Key");
      url = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetch(`${url}/api/v2/experiments?limit=1`, { headers: { 'Authorization': key } });
      if (!res.ok) throw new Error(`Credenciales denegadas en ${url}`);
    });
  });

}

window.renderIntegrations = renderIntegrations;
