/**
 * sync.js — Google Drive Synchronization + Team Import Manager
 */

const syncManager = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/drive.file';
    const CONFIG_KEY = 'gdrive_sync_config';
    const STATUS_KEY = 'gdrive_connected';

    let tokenClient = null;
    let accessToken = null;
    let isSyncing = false;
    let autoSyncTimer = null;

    const defaultConfig = {
        clientId: '',
        fileName: 'workspace-team-data.json',
        teamName: 'Equipo pequeño',
        autoSyncMinutes: 5,
    };

    function getConfig() {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return { ...defaultConfig };
        try {
            const parsed = JSON.parse(raw);
            return { ...defaultConfig, ...parsed };
        } catch {
            return { ...defaultConfig };
        }
    }

    function saveConfig(next) {
        const normalized = {
            ...defaultConfig,
            ...next,
            autoSyncMinutes: Math.max(1, Number(next.autoSyncMinutes) || defaultConfig.autoSyncMinutes),
        };
        localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized));
        configureAutoSync(normalized.autoSyncMinutes);
        return normalized;
    }

    function updateSyncUI(status) {
        const btn = document.getElementById('btn-sync-toggle');
        const indicator = document.getElementById('sync-indicator');
        if (!btn || !indicator) return;

        indicator.classList.remove('status-online', 'status-offline', 'status-syncing', 'status-error');

        switch (status) {
            case 'online':
                indicator.classList.add('status-online');
                btn.title = 'Google Drive conectado';
                break;
            case 'syncing':
                indicator.classList.add('status-syncing');
                btn.title = 'Sincronizando con Google Drive';
                break;
            case 'error':
                indicator.classList.add('status-error');
                btn.title = 'Error de sincronización';
                break;
            default:
                indicator.classList.add('status-offline');
                btn.title = 'Configurar Google Drive';
        }
    }

    async function loadGIS() {
        if (window.google?.accounts?.oauth2) return;
        await new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-gis="true"]');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }
            const script = document.createElement('script');
            script.dataset.gis = 'true';
            script.src = 'https://accounts.google.com/gsi/client';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async function initTokenClient() {
        const cfg = getConfig();
        if (!cfg.clientId) return false;

        await loadGIS();
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: cfg.clientId,
            scope: SCOPES,
            callback: (resp) => {
                if (resp?.error) {
                    showToast('No se pudo autenticar con Google Drive', 'error');
                    updateSyncUI('error');
                    return;
                }
                accessToken = resp.access_token;
                localStorage.setItem(STATUS_KEY, 'true');
                updateSyncUI('online');
                push();
                pull();
            },
        });
        return true;
    }

    async function init() {
        updateSyncUI(localStorage.getItem(STATUS_KEY) === 'true' ? 'online' : 'offline');
        const cfg = getConfig();
        configureAutoSync(cfg.autoSyncMinutes);
        if (cfg.clientId) {
            try {
                await initTokenClient();
            } catch {
                updateSyncUI('error');
            }
        }
    }

    async function authenticate() {
        if (!tokenClient) {
            const initialized = await initTokenClient();
            if (!initialized) {
                showToast('Primero configura el Client ID de Google en "Sync"', 'error');
                openPanel();
                return;
            }
        }
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    function disconnect() {
        if (window.google?.accounts?.oauth2 && accessToken) {
            google.accounts.oauth2.revoke(accessToken);
        }
        accessToken = null;
        localStorage.setItem(STATUS_KEY, 'false');
        updateSyncUI('offline');
    }

    function getSnapshot() {
        return {
            version: '1.1',
            updatedAt: Date.now(),
            metadata: {
                teamName: getConfig().teamName,
                actor: localStorage.getItem('workspace_actor') || 'owner-local',
            },
            projects: store.get.projects(),
            tasks: store.get.allTasks(),
            cycles: store.get.cycles(),
            decisions: store.get.decisions(),
            documents: store.get.documents ? store.get.documents() : [],
            members: store.get.members(),
            logs: store.get.logs ? store.get.logs() : [],
        };
    }

    async function push() {
        if (!accessToken || isSyncing) return;
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();
            const data = getSnapshot();
            let fileId = localStorage.getItem('gdrive_file_id');
            if (!fileId) fileId = await findFile(cfg.fileName);

            if (fileId) {
                await updateFile(fileId, data);
            } else {
                const newId = await createFile(cfg.fileName, data);
                localStorage.setItem('gdrive_file_id', newId);
            }

            localStorage.setItem('last_sync_local', String(data.updatedAt));
            updateSyncUI('online');
        } catch (err) {
            console.error('[Sync] Push failed:', err);
            updateSyncUI('error');
        } finally {
            isSyncing = false;
        }
    }

    async function pull() {
        if (!accessToken || isSyncing) return;
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();
            const fileId = await findFile(cfg.fileName);
            if (!fileId) {
                updateSyncUI('online');
                return;
            }

            localStorage.setItem('gdrive_file_id', fileId);
            const remoteData = await getFileContent(fileId);
            const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);
            if (remoteData?.updatedAt > localUpdate) {
                await seedFromRemote(remoteData);
                localStorage.setItem('last_sync_local', String(remoteData.updatedAt));
                showToast('Datos actualizados desde Drive', 'success');
            }

            updateSyncUI('online');
        } catch (err) {
            console.error('[Sync] Pull failed:', err);
            updateSyncUI('error');
        } finally {
            isSyncing = false;
        }
    }

    function configureAutoSync(minutes) {
        if (autoSyncTimer) clearInterval(autoSyncTimer);
        const ms = Math.max(1, Number(minutes) || 5) * 60 * 1000;
        autoSyncTimer = setInterval(() => {
            if (accessToken) push();
        }, ms);
    }

    async function findFile(name) {
        const q = `name='${name.replace(/'/g, "\\'")}' and trashed=false`;
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await resp.json();
        return result.files && result.files[0] ? result.files[0].id : null;
    }

    async function createFile(name, content) {
        const metadata = { name, mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));

        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
        });
        const result = await resp.json();
        return result.id;
    }

    async function updateFile(id, content) {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(content),
        });
    }

    async function getFileContent(id) {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return resp.json();
    }

    async function seedFromRemote(data) {
        if (store.dispatch) await store.dispatch('HYDRATE_STORE', data);
    }

    function parseNotionCsv(text) {
        const rows = text.split(/\r?\n/).filter(Boolean);
        if (rows.length < 2) return [];
        const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
        return rows.slice(1).map((line, idx) => {
            const cols = line.split(',');
            const titleIdx = headers.findIndex(h => h.includes('name') || h.includes('tarea') || h.includes('title'));
            const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('estado'));
            const dueIdx = headers.findIndex(h => h.includes('due') || h.includes('fecha'));
            return {
                id: `nt-${Date.now()}-${idx}`,
                title: (cols[titleIdx] || `Notion Task ${idx + 1}`).trim(),
                status: (cols[statusIdx] || 'Capturado').trim(),
                dueDate: (cols[dueIdx] || '').trim(),
                priority: 'media',
                type: 'task',
                createdAt: Date.now(),
                tags: ['notion-import'],
                subtasks: [],
            };
        });
    }

    function parseObsidianMarkdown(text) {
        const lines = text.split(/\r?\n/);
        return lines
            .filter(line => /^- \[( |x)\]/i.test(line.trim()))
            .map((line, idx) => {
                const done = /- \[x\]/i.test(line.trim());
                const title = line.replace(/^- \[( |x)\]\s*/i, '').trim();
                return {
                    id: `ob-${Date.now()}-${idx}`,
                    title: title || `Nota ${idx + 1}`,
                    status: done ? 'Terminado' : 'Capturado',
                    priority: 'media',
                    type: 'task',
                    createdAt: Date.now(),
                    tags: ['obsidian-import'],
                    subtasks: [],
                };
            });
    }

    async function importTasks(tasks) {
        for (const task of tasks) {
            await store.dispatch('ADD_TASK', task);
        }
        showToast(`Importadas ${tasks.length} tareas`, 'success');
    }

    function openPanel() {
        const cfg = getConfig();
        const members = store.get.members();
        const memberNames = members.map(m => esc(m.name)).join(', ') || 'Sin miembros';

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'sync-settings-overlay';
        overlay.innerHTML = `
      <div class="modal" style="max-width:620px;">
        <div class="modal-header">
          <h2><i data-feather="cloud"></i> Sync Google Drive + Equipo</h2>
          <button class="btn btn-icon" id="sync-close"><i data-feather="x"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin:0;color:var(--text-muted);font-size:0.9rem;">Enfocado para equipos pequeños: un archivo compartido en Drive + importación rápida de tareas desde Notion (CSV) u Obsidian (Markdown checklist).</p>
          <div class="form-group">
            <label class="form-label">Google OAuth Client ID</label>
            <input class="form-input" id="sync-client-id" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cfg.clientId)}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Nombre del archivo en Drive</label>
              <input class="form-input" id="sync-file-name" value="${esc(cfg.fileName)}">
            </div>
            <div class="form-group">
              <label class="form-label">Equipo</label>
              <input class="form-input" id="sync-team-name" value="${esc(cfg.teamName)}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Auto-sync (minutos)</label>
            <input class="form-input" type="number" min="1" max="120" id="sync-auto-min" value="${cfg.autoSyncMinutes}">
          </div>
          <div class="form-group">
            <label class="form-label">Miembros actuales</label>
            <input class="form-input" id="sync-members" placeholder="Ana, Luis, Marta" value="${memberNames === 'Sin miembros' ? '' : memberNames}">
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label class="btn btn-secondary" style="cursor:pointer;">
              Importar Notion CSV
              <input type="file" id="notion-file" accept=".csv,text/csv" style="display:none;">
            </label>
            <label class="btn btn-secondary" style="cursor:pointer;">
              Importar Obsidian Markdown
              <input type="file" id="obsidian-file" accept=".md,text/markdown" style="display:none;">
            </label>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between;">
          <button class="btn btn-secondary" id="sync-disconnect">Desconectar</button>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary" id="sync-pull">Traer cambios</button>
            <button class="btn btn-primary" id="sync-save-connect">Guardar y conectar</button>
          </div>
        </div>
      </div>`;

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        feather.replace();

        overlay.querySelector('#sync-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#sync-disconnect').addEventListener('click', () => {
            disconnect();
            overlay.remove();
        });

        overlay.querySelector('#sync-save-connect').addEventListener('click', async () => {
            const clientId = overlay.querySelector('#sync-client-id').value.trim();
            const fileName = overlay.querySelector('#sync-file-name').value.trim() || defaultConfig.fileName;
            const teamName = overlay.querySelector('#sync-team-name').value.trim() || defaultConfig.teamName;
            const autoSyncMinutes = Number(overlay.querySelector('#sync-auto-min').value || 5);
            const membersRaw = overlay.querySelector('#sync-members').value.trim();

            saveConfig({ clientId, fileName, teamName, autoSyncMinutes });
            await syncMembers(membersRaw);
            await authenticate();
            overlay.remove();
        });

        overlay.querySelector('#sync-pull').addEventListener('click', async () => {
            await pull();
            overlay.remove();
        });

        overlay.querySelector('#notion-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            await importTasks(parseNotionCsv(text));
        });

        overlay.querySelector('#obsidian-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            await importTasks(parseObsidianMarkdown(text));
        });
    }

    async function syncMembers(raw) {
        const names = raw.split(',').map(x => x.trim()).filter(Boolean);
        const current = store.get.members();
        const existing = new Set(current.map(m => m.name.toLowerCase()));
        for (const name of names) {
            if (!existing.has(name.toLowerCase())) {
                await store.dispatch('ADD_MEMBER', { name, role: 'Colaborador' });
            }
        }
    }

    return { init, authenticate, disconnect, push, pull, openPanel };
})();

window.syncManager = syncManager;
