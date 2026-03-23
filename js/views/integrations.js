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
                <div style="font-size:0.75rem; color:var(--text-muted); margin-left:24px; margin-top:-4px;">
                  <span data-sync-type="calendar" class="sync-status-indicator">Pendiente</span>
                  <span class="sync-item-count" style="margin-left:8px;"></span>
                </div>
                <label class="checkbox-item" style="margin-top:8px;">
                  <input type="checkbox" id="sync-google-tasks" ${localStorage.getItem('sync_gtasks') === 'true' ? 'checked' : ''}>
                  <span>Google Tasks (Tareas)</span>
                </label>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-left:24px; margin-top:-4px;">
                  <span data-sync-type="tasks" class="sync-status-indicator">Pendiente</span>
                  <span class="sync-item-count" style="margin-left:8px;"></span>
                </div>
              </div>

              <!-- Clarification Note for Drive Uploads -->
              <div style="margin-top:12px; padding:10px; background:rgba(94, 106, 210, 0.05); border-radius:8px; border:1px dashed var(--border-highlight); font-size:0.75rem; color:var(--text-secondary);">
                <i data-feather="info" style="width:12px; height:12px; margin-right:4px; vertical-align:middle;"></i>
                <strong>Nota:</strong> Los archivos subidos manualmente a Drive no aparecerán automáticamente. Primero regístralos en el proyecto y el sistema los sincronizará.
              </div>

              <div style="display:flex;gap:8px;margin-top:16px;">
                <button class="btn btn-secondary btn-sm" onclick="syncManager?.openPanel()" style="flex:1;">
                  <i data-feather="settings" style="width:14px;height:14px;margin-right:4px;"></i> Configurar
                </button>
                <button class="btn btn-primary btn-sm" id="btn-integration-sync-now" style="flex:1;">
                  <i data-feather="refresh-cw" style="width:14px;height:14px;margin-right:4px;"></i> Sincronizar Ahora
                </button>
              </div>
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
                <input type="password" class="form-input" id="int-zot-key" placeholder="Tu clave secreta...">
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
                <input type="password" class="form-input" id="int-todoist-token" placeholder="API Token v2">
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
              <input type="password" class="form-input" id="int-zenodo-token" placeholder="Token personal">
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
              Asegúrate de que Ollama esté ejecutándose localmente. Para solucionar errores CORS:
            </p>
            <div style="padding:8px; background:rgba(94, 106, 210, 0.05); border-radius:6px; border-left:3px solid var(--accent-primary); font-size:0.75rem; color:var(--text-secondary); margin-bottom:12px;">
              <strong>Opción 1:</strong> Configura Ollama localmente:<br/>
              <code style="font-size:0.7rem;">OLLAMA_ORIGINS="https://pataforista.github.io" ollama serve</code><br/><br/>
              <strong>Opción 2:</strong> Usa un proxy CORS (abajo)
            </div>
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
            <div class="form-group" style="margin-top:8px;">
              <label style="font-size:0.75rem; color:var(--text-muted);">CORS Proxy URL (opcional)</label>
              <input type="text" class="form-input" id="int-ollama-cors-proxy"
                value="${esc(localStorage.getItem('ollama_cors_proxy') || '')}" placeholder="Ej: https://cors-proxy.example.com/?url=">
              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px;">
                Si tienes problemas CORS, usa un proxy como <code>https://cors-anywhere.herokuapp.com/?url=</code> (requiere activación previa)
              </div>
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
              <input type="password" class="form-input" id="int-elab-key" placeholder="Tu clave API">
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
              <input type="password" class="form-input" id="int-new-pwd" placeholder="Mínimo 8 caracteres">
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

  // Bind events
  root.querySelector('#btn-save-zotero')?.addEventListener('click', () => {
    const uid = root.querySelector('#int-zot-uid').value.trim();
    const key = root.querySelector('#int-zot-key').value.trim();
    if (window.zoteroApi?.setCredentials) {
      zoteroApi.setCredentials(uid, key);
    } else {
      localStorage.setItem('zotero_user_id', uid);
      localStorage.setItem('zotero_api_key', key);
    }
    showToast('Zotero configurado con éxito', 'success');
    renderIntegrations(root);
  });

  root.querySelector('#btn-integration-sync-now')?.addEventListener('click', () => {
    if (window.syncManager?.syncNow) {
      syncManager.syncNow();
    } else {
      showToast('Sincronización no disponible. Configura Google Drive primero.', 'warning');
    }
  });

  root.querySelector('#sync-google-calendar')?.addEventListener('change', (e) => {
    if (window.googleIntegrationHandler?.handleCalendarToggle) {
      window.googleIntegrationHandler.handleCalendarToggle(e);
    } else {
      localStorage.setItem('sync_gcal', e.target.checked);
      showToast(`Google Calendar ${e.target.checked ? 'activado' : 'desactivado'}`, 'info');
    }
  });

  root.querySelector('#sync-google-tasks')?.addEventListener('change', (e) => {
    if (window.googleIntegrationHandler?.handleTasksToggle) {
      window.googleIntegrationHandler.handleTasksToggle(e);
    } else {
      localStorage.setItem('sync_gtasks', e.target.checked);
      showToast(`Google Tasks ${e.target.checked ? 'activado' : 'desactivado'}`, 'info');
    }
  });

  // Initialize Google integration handler
  if (window.googleIntegrationHandler?.initialize) {
    window.googleIntegrationHandler.initialize();
  }

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

  root.querySelector('#btn-save-security')?.addEventListener('click', async () => {
    const pwd = root.querySelector('#int-new-pwd').value;
    const autolock = root.querySelector('#int-autolock').checked;

    if (pwd.length > 0 && pwd.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }

    if (pwd.length >= 8) {
      // SHA-256 hash — compatible con el sistema de auth principal (app.js)
      const cryptoLayer = await import('../utils/crypto.js').catch(() => null);
      const hashPwd = async (str) => {
        if (cryptoLayer?.hashPassword) return cryptoLayer.hashPassword(str);
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      };

      // Generar código de recuperación criptográficamente seguro
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const randomBytes = crypto.getRandomValues(new Uint8Array(16));
      let recoveryCode = '';
      for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) recoveryCode += '-';
        recoveryCode += chars[randomBytes[i] % chars.length];
      }
      const normalized = recoveryCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

      const [lockHash, recoveryHash] = await Promise.all([
        hashPwd(pwd),
        hashPwd(normalized)
      ]);

      localStorage.setItem('workspace_lock_hash', lockHash);
      localStorage.setItem('workspace_recovery_hash', recoveryHash);

      // Actualizar la clave de cifrado en la sesión actual
      if (cryptoLayer?.unlock) await cryptoLayer.unlock(pwd);

      // Mostrar el código de recuperación al usuario
      const dialog = document.createElement('div');
      dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;';
      dialog.innerHTML = `
        <div style="background:var(--bg-surface);border-radius:16px;padding:28px;max-width:440px;width:90%;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <h3 style="margin:0 0 8px;color:var(--accent-warning);">⚠️ Guarda tu código de recuperación</h3>
          <p style="color:var(--text-secondary);font-size:0.85rem;margin:0 0 16px;">Si olvidas tu contraseña, necesitarás este código. Guárdalo en un lugar seguro antes de continuar.</p>
          <div style="font-family:var(--font-mono);font-size:1.1rem;letter-spacing:3px;text-align:center;padding:16px;background:var(--bg-base);border-radius:8px;color:var(--text-primary);font-weight:700;margin-bottom:16px;">${recoveryCode}</div>
          <div style="display:flex;gap:8px;">
            <button id="sec-dlg-copy" class="btn btn-secondary" style="flex:1;justify-content:center;">Copiar código</button>
            <button id="sec-dlg-done" class="btn btn-primary" style="flex:1;justify-content:center;">Ya lo guardé — Continuar</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);

      const closeDialog = () => {
        // Limpiar contenido sensible antes de remover
        dialog.innerHTML = '';
        dialog.remove();
      };

      dialog.querySelector('#sec-dlg-copy').onclick = () => {
        navigator.clipboard.writeText(recoveryCode).catch(() => {});
        dialog.querySelector('#sec-dlg-copy').textContent = '¡Copiado!';
      };
      dialog.querySelector('#sec-dlg-done').onclick = () => {
        closeDialog();
        showToast('Contraseña actualizada correctamente.', 'success');
        renderIntegrations(root);
      };

      // Limpiar si el usuario presiona ESC o hace clic fuera
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          closeDialog();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dialog.parentNode) {
          closeDialog();
        }
      });
    }

    localStorage.setItem('autolock_enabled', autolock);
    if (pwd.length === 0) {
      showToast('Configuración de seguridad guardada.', 'success');
      renderIntegrations(root);
    }
  });

  root.querySelector('#btn-save-ollama')?.addEventListener('click', () => {
    const url = root.querySelector('#int-ollama-url').value.trim();
    const model = root.querySelector('#int-ollama-model').value.trim();
    const corsProxy = root.querySelector('#int-ollama-cors-proxy').value.trim();
    if (window.ollamaApi?.setSettings) {
      ollamaApi.setSettings(url, model, corsProxy);
    } else {
      localStorage.setItem('ollama_url', url);
      localStorage.setItem('ollama_model', model);
      if (corsProxy) {
        localStorage.setItem('ollama_cors_proxy', corsProxy);
      } else {
        localStorage.removeItem('ollama_cors_proxy');
      }
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
      const res = await fetchWithTimeout(`https://api.zotero.org/users/${uid}/items/top?v=3&limit=1`, { headers: { 'Zotero-API-Key': key } });
      if (!res.ok) throw new Error("Acceso denegado o usuario inválido");
    });
  });

  root.querySelector('#btn-test-todoist')?.addEventListener('click', () => {
    testApi('#btn-test-todoist', 'Probar', async () => {
      const token = root.querySelector('#int-todoist-token').value.trim();
      if (!token) throw new Error("Falta el API Token");
      const res = await fetchWithTimeout('https://api.todoist.com/rest/v2/projects', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error("Token revocado o inválido");
    });
  });

  root.querySelector('#btn-test-zenodo')?.addEventListener('click', () => {
    testApi('#btn-test-zenodo', 'Probar', async () => {
      const token = root.querySelector('#int-zenodo-token').value.trim();
      const sandbox = root.querySelector('#int-zenodo-sandbox').checked;
      if (!token) throw new Error("Falta el API Token");
      const base = sandbox ? 'https://sandbox.zenodo.org/api' : 'https://zenodo.org/api';
      const res = await fetchWithTimeout(`${base}/deposit/depositions?size=1`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error("Token incorrecto o cuenta restringida");
    });
  });

  root.querySelector('#btn-test-ollama')?.addEventListener('click', () => {
    testApi('#btn-test-ollama', 'Probar', async () => {
      const url = root.querySelector('#int-ollama-url').value.trim();
      const model = root.querySelector('#int-ollama-model').value.trim();
      const corsProxy = root.querySelector('#int-ollama-cors-proxy').value.trim();
      if (!url) throw new Error("Falta la URL del servidor local");

      // Temporarily configure API for testing
      if (window.ollamaApi?.setSettings) {
        ollamaApi.setSettings(url, model, corsProxy);
        const isHealthy = await ollamaApi.healthCheck();
        if (!isHealthy) throw new Error("Ollama no responde o CORS está bloqueado");
      } else {
        throw new Error("API de Ollama no inicializada");
      }
    });
  });

  root.querySelector('#btn-test-elab')?.addEventListener('click', () => {
    testApi('#btn-test-elab', 'Probar', async () => {
      let url = root.querySelector('#int-elab-url').value.trim();
      const key = root.querySelector('#int-elab-key').value.trim();
      if (!url || !key) throw new Error("Falta la URL o la API Key");
      url = url.endsWith('/') ? url.slice(0, -1) : url;
      const res = await fetchWithTimeout(`${url}/api/v2/experiments?limit=1`, { headers: { 'Authorization': key } });
      if (!res.ok) throw new Error(`Credenciales denegadas en ${url}`);
    });
  });

}

window.renderIntegrations = renderIntegrations;
