/**
 * sync.js — Google Drive Synchronization + Team Import Manager
 *
 * Capas implementadas:
 *   1. Autenticación: Google Identity Services (GIS) + OAuth 2.0 implicit flow
 *   2. Scopes: drive.file (archivos visibles) + drive.appdata (config invisible)
 *   3. Acceso a archivos: Drive API v3
 *   4. Selección de archivos: Google Picker API (requiere API Key + App ID)
 *   5. Configuración invisible: appDataFolder
 */

const syncManager = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
    const CONFIG_KEY = 'gdrive_sync_config';
    const STATUS_KEY = 'gdrive_connected';
    const APPDATA_SETTINGS_FILE = 'workspace-settings.json';

    let tokenClient = null;
    let accessToken = null;
    let isSyncing = false;
    let autoSyncTimer = null;
    let pickerApiLoaded = false;

    const defaultConfig = {
        clientId: '',
        apiKey: '',       // Para Google Picker (Developer Key)
        appId: '',        // Project Number de Google Cloud (para Picker)
        fileName: 'workspace-team-data.json',
        sharedFileId: '',
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

    // ── Carga de scripts externos ──────────────────────────────────────────────

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

    /**
     * Carga la librería gapi y el módulo Picker de Google.
     * El Picker es una API independiente del Drive API que permite al usuario
     * seleccionar archivos desde su propio Drive con una UI nativa de Google.
     */
    async function loadPickerApi() {
        if (pickerApiLoaded) return;
        await new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-gapi="true"]');
            if (existing) {
                // Script ya insertado — solo cargar módulo picker
                if (window.gapi?.load) {
                    window.gapi.load('picker', () => { pickerApiLoaded = true; resolve(); });
                } else {
                    reject(new Error('gapi no disponible'));
                }
                return;
            }
            const script = document.createElement('script');
            script.dataset.gapi = 'true';
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                window.gapi.load('picker', () => { pickerApiLoaded = true; resolve(); });
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // ── Autenticación ──────────────────────────────────────────────────────────

    async function initTokenClient() {
        const cfg = getConfig();
        if (!cfg.clientId) return false;

        await loadGIS();
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: cfg.clientId,
            scope: SCOPES,
            callback: async (resp) => {
                if (resp?.error) {
                    showToast('No se pudo autenticar con Google Drive', 'error');
                    updateSyncUI('error');
                    return;
                }
                accessToken = resp.access_token;
                localStorage.setItem(STATUS_KEY, 'true');
                updateSyncUI('online');
                // Restaurar configuración guardada en appDataFolder (sharedFileId, teamName, etc.)
                await loadSettingsFromAppData();
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

    // ── Google Picker ──────────────────────────────────────────────────────────

    /**
     * Abre el selector nativo de Google Drive (Google Picker).
     * El usuario elige un archivo JSON — onSelect recibe (fileId, fileName).
     *
     * Requiere:
     *   - apiKey (Developer Key) en la configuración
     *   - appId  (Project Number) opcional pero recomendado
     *   - accessToken activo con scope drive.file
     */
    async function openPicker(onSelect) {
        const cfg = getConfig();

        if (!cfg.apiKey) {
            showToast('Añade una API Key en la configuración de Sync para usar el selector de Drive', 'error');
            return;
        }
        if (!accessToken) {
            showToast('Conecta con Google Drive primero', 'error');
            return;
        }

        try {
            await loadPickerApi();
        } catch {
            showToast('No se pudo cargar el selector de Drive', 'error');
            return;
        }

        const view = new google.picker.DocsView()
            .setIncludeFolders(false)
            .setMimeTypes('application/json');

        const builder = new google.picker.PickerBuilder()
            .setTitle('Seleccionar archivo de datos del equipo')
            .addView(view)
            .setOAuthToken(accessToken)
            .setDeveloperKey(cfg.apiKey)
            .setCallback((data) => {
                if (data.action === google.picker.Action.PICKED && data.docs?.length > 0) {
                    const doc = data.docs[0];
                    onSelect(doc.id, doc.name);
                }
            });

        if (cfg.appId) builder.setAppId(cfg.appId);
        builder.build().setVisible(true);
    }

    // ── AppDataFolder — configuración invisible ────────────────────────────────
    //
    // appDataFolder es una carpeta oculta, inaccesible para el usuario y otras apps.
    // Se usa para guardar configuración operativa del workspace entre dispositivos.
    // Requiere scope drive.appdata y spaces=appDataFolder en los queries.

    async function findAppDataFile(name) {
        const q = `name='${name.replace(/'/g, "\\'")}' and trashed=false`;
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) return null;
        const result = await resp.json();
        return result.files?.[0]?.id ?? null;
    }

    async function getAppDataContent(fileId) {
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) return null;
        return resp.json();
    }

    async function saveAppDataContent(name, content) {
        const fileId = await findAppDataFile(name);
        if (fileId) {
            await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(content),
                }
            );
            return fileId;
        }
        // Crear en appDataFolder: parents: ['appDataFolder']
        const metadata = { name, mimeType: 'application/json', parents: ['appDataFolder'] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
        const resp = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
        );
        const result = await resp.json();
        return result.id;
    }

    /**
     * Al conectar, intenta restaurar la configuración operativa guardada en appDataFolder.
     * Esto permite que distintos miembros del equipo no tengan que reconfigurar
     * el sharedFileId manualmente — se sincroniza de forma invisible.
     */
    async function loadSettingsFromAppData() {
        try {
            const fileId = await findAppDataFile(APPDATA_SETTINGS_FILE);
            if (!fileId) return;
            const settings = await getAppDataContent(fileId);
            if (!settings) return;
            const local = getConfig();
            // Las credenciales (clientId, apiKey, appId) se mantienen locales.
            // El sharedFileId, fileName, teamName y autoSyncMinutes se sincronizan.
            const merged = {
                ...local,
                fileName: settings.fileName || local.fileName,
                sharedFileId: settings.sharedFileId || local.sharedFileId,
                teamName: settings.teamName || local.teamName,
                autoSyncMinutes: settings.autoSyncMinutes || local.autoSyncMinutes,
            };
            saveConfig(merged);
            if (settings.sharedFileId) localStorage.setItem('gdrive_file_id', settings.sharedFileId);
            showToast('Configuración restaurada desde Drive', 'info');
        } catch (err) {
            console.warn('[Sync] No se pudo cargar configuración de appDataFolder:', err);
        }
    }

    /**
     * Guarda la configuración operativa en appDataFolder tras crear o vincular
     * un archivo compartido, para que otros dispositivos la puedan restaurar.
     */
    async function saveSettingsToAppData() {
        try {
            const cfg = getConfig();
            const settings = {
                fileName: cfg.fileName,
                sharedFileId: cfg.sharedFileId || localStorage.getItem('gdrive_file_id') || '',
                teamName: cfg.teamName,
                autoSyncMinutes: cfg.autoSyncMinutes,
                savedAt: Date.now(),
            };
            await saveAppDataContent(APPDATA_SETTINGS_FILE, settings);
        } catch (err) {
            console.warn('[Sync] No se pudo guardar configuración en appDataFolder:', err);
        }
    }

    // ── Sincronización con Drive ───────────────────────────────────────────────

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

            let fileId = cfg.sharedFileId || localStorage.getItem('gdrive_file_id');
            if (!fileId) fileId = await findFile(cfg.fileName);

            if (fileId) {
                // Pre-flight: evitar sobrescribir cambios remotos más recientes
                const remoteData = await getFileContentMetadata(fileId);
                const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);

                if (remoteData && remoteData.updatedAt && remoteData.updatedAt > localUpdate + 60000) {
                    isSyncing = false;
                    const confirmPull = confirm('⚠️ Drive tiene cambios más recientes. ¿Deseas descargar los cambios del equipo antes de sobrescribir?');
                    if (confirmPull) {
                        await pull();
                        return;
                    }
                    isSyncing = true;
                }
                await updateFile(fileId, data);
            } else {
                const newId = await createFile(cfg.fileName, data);
                if (!cfg.sharedFileId) {
                    localStorage.setItem('gdrive_file_id', newId);
                    // Guardar el nuevo fileId en appDataFolder para otros dispositivos
                    await saveSettingsToAppData();
                }
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
            const fileId = cfg.sharedFileId || await findFile(cfg.fileName);
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
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const result = await resp.json();
        return result.files && result.files[0] ? result.files[0].id : null;
    }

    async function createFile(name, content) {
        const metadata = { name, mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));

        const resp = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true',
            { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
        );
        const result = await resp.json();
        return result.id;
    }

    async function updateFile(id, content) {
        await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(content),
            }
        );
    }

    async function getFileContent(id) {
        const resp = await fetch(
            `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new Error('Archivo no encontrado o sin permisos');
        return resp.json();
    }

    async function getFileContentMetadata(id) {
        try { return await getFileContent(id); } catch { return null; }
    }

    async function seedFromRemote(data) {
        if (store.dispatch) await store.dispatch('HYDRATE_STORE', data);
    }

    // ── Parsers de importación ─────────────────────────────────────────────────

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

    async function exportToMarkdown(projectId) {
        const p = store.get.projectById(projectId);
        const doc = store.get.documentByProject(projectId);
        if (!doc) return showToast('No hay documento para este proyecto', 'info');

        const text = doc.content.map(b => {
            if (b.type === 'heading') return `# ${b.text}`;
            if (b.type === 'heading2') return `## ${b.text}`;
            if (b.type === 'paragraph') return b.text;
            if (b.type === 'code') return `\`\`\`\n${b.text}\n\`\`\``;
            if (b.type === 'callout') return `> [!NOTE]\n> ${b.text}`;
            if (b.type === 'checklist') return b.items.map(i => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
            return '---';
        }).join('\n\n');

        downloadFile(`${p.name.slugify()}.md`, text);
    }

    function parseTrelloJson(json) {
        try {
            const data = typeof json === 'string' ? JSON.parse(json) : json;
            const lists = {};
            data.lists.forEach(l => lists[l.id] = l.name);
            return data.cards.map(c => ({
                id: `tr-${c.id}`,
                title: c.name,
                description: c.desc || '',
                status: lists[c.idList] || 'Capturado',
                priority: 'media',
                type: 'task',
                createdAt: Date.now(),
                tags: (c.labels || []).map(l => l.name || l.color),
                subtasks: (c.checklists || []).flatMap(cl => cl.checkItems.map(ci => ({ id: ci.id, title: ci.name, done: ci.state === 'complete' })))
            }));
        } catch { return []; }
    }

    function parseTodoistCsv(text) {
        const rows = parseCsv(text);
        if (rows.length < 2) return [];
        const headers = rows[0].map(h => h.toLowerCase());
        const cIdx = headers.indexOf('content');
        return rows.slice(1).map((cols, idx) => ({
            id: `td-${Date.now()}-${idx}`,
            title: cols[cIdx] || 'Sin título',
            status: 'Capturado',
            priority: 'media',
            type: 'task',
            createdAt: Date.now(),
            tags: ['todoist-import'],
            subtasks: []
        }));
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

    // ── Panel de configuración ─────────────────────────────────────────────────

    function openPanel() {
        const cfg = getConfig();
        const members = store.get.members();
        const memberNames = members.map(m => esc(m.name)).join(', ') || '';
        const isConnected = !!accessToken;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'sync-settings-overlay';
        overlay.innerHTML = `
      <div class="modal" style="max-width:660px;">
        <div class="modal-header">
          <h2><i data-feather="cloud"></i> Sync Google Drive + Equipo</h2>
          <button class="btn btn-icon" id="sync-close"><i data-feather="x"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 16px;color:var(--text-muted);font-size:0.85rem;">
            Scopes mínimos: <code>drive.file</code> (archivos de la app) + <code>drive.appdata</code> (config invisible).
            Solo se accede a archivos que esta app crea o que el usuario selecciona explícitamente.
          </p>

          <!-- Credenciales OAuth -->
          <div class="form-group">
            <label class="form-label">Google OAuth Client ID <span style="color:var(--accent-danger)">*</span></label>
            <input class="form-input" id="sync-client-id" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cfg.clientId)}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">
                API Key
                <span style="color:var(--text-muted);font-weight:400;"> — para Google Picker</span>
              </label>
              <input class="form-input" id="sync-api-key" placeholder="AIzaSy…" value="${esc(cfg.apiKey)}">
            </div>
            <div class="form-group">
              <label class="form-label">
                App ID
                <span style="color:var(--text-muted);font-weight:400;"> — Project Number</span>
              </label>
              <input class="form-input" id="sync-app-id" placeholder="123456789012" value="${esc(cfg.appId)}">
            </div>
          </div>

          <!-- Archivo compartido + Picker -->
          <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:flex-end;margin-bottom:16px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">ID del archivo compartido del equipo</label>
              <input class="form-input" id="sync-shared-id" placeholder="Pegar ID manualmente o usar el selector →" value="${esc(cfg.sharedFileId)}">
            </div>
            <button class="btn btn-secondary btn-sm" id="sync-pick-file"
              title="${isConnected ? 'Abrir selector de Google Drive' : 'Conecta primero para usar el selector'}"
              style="height:38px;white-space:nowrap;"
              ${isConnected ? '' : 'disabled'}>
              <i data-feather="folder" style="width:14px;height:14px;margin-right:4px;"></i>Seleccionar
            </button>
          </div>

          <!-- Config operativa -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Nombre del archivo (si se crea nuevo)</label>
              <input class="form-input" id="sync-file-name" value="${esc(cfg.fileName)}">
            </div>
            <div class="form-group">
              <label class="form-label">Auto-sync (minutos)</label>
              <input class="form-input" type="number" min="1" max="120" id="sync-auto-min" value="${cfg.autoSyncMinutes}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Miembros del equipo</label>
            <input class="form-input" id="sync-members" placeholder="Ana, Luis, Marta" value="${memberNames}">
          </div>

          <!-- Importar desde -->
          <div style="border-top:1px solid var(--border-color);padding-top:16px;margin-top:4px;">
            <p style="margin:0 0 10px;font-size:0.75rem;color:var(--text-muted);font-weight:600;letter-spacing:.05em;text-transform:uppercase;">Importar desde</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Importar cards y checklists de Trello">
                <i data-feather="trello" style="width:14px;height:14px;margin-right:4px;"></i> Trello JSON
                <input type="file" id="trello-file" accept=".json" style="display:none;">
              </label>
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Importar tareas de Notion">
                <i data-feather="external-link" style="width:14px;height:14px;margin-right:4px;"></i> Notion CSV
                <input type="file" id="notion-file" accept=".csv" style="display:none;">
              </label>
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Importar checklists de Obsidian">
                <i data-feather="book-open" style="width:14px;height:14px;margin-right:4px;"></i> Obsidian MD
                <input type="file" id="obsidian-file" accept=".md" style="display:none;">
              </label>
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Importar export de Todoist">
                <i data-feather="check-circle" style="width:14px;height:14px;margin-right:4px;"></i> Todoist CSV
                <input type="file" id="todoist-file" accept=".csv" style="display:none;">
              </label>
            </div>
          </div>

          <!-- Advertencia modo Testing -->
          <div style="margin-top:14px;padding:10px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:8px;font-size:0.8rem;color:var(--accent-warning);display:flex;gap:8px;align-items:flex-start;">
            <i data-feather="alert-triangle" style="width:14px;height:14px;flex-shrink:0;margin-top:1px;"></i>
            <span>
              Si tu app está en modo <strong>Testing</strong> en Google Cloud Console, los refresh tokens expiran en 7 días.
              Para uso real del equipo, publica la app o añade a cada miembro como usuario de prueba en la pantalla de consentimiento OAuth.
            </span>
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

        // Botón Picker — abre selector nativo de Google Drive
        overlay.querySelector('#sync-pick-file').addEventListener('click', () => {
            openPicker((fileId, fileName) => {
                overlay.querySelector('#sync-shared-id').value = fileId;
                showToast(`Archivo vinculado: ${fileName}`, 'success');
            });
        });

        overlay.querySelector('#sync-save-connect').addEventListener('click', async () => {
            const clientId = overlay.querySelector('#sync-client-id').value.trim();
            const apiKey = overlay.querySelector('#sync-api-key').value.trim();
            const appId = overlay.querySelector('#sync-app-id').value.trim();
            const fileName = overlay.querySelector('#sync-file-name').value.trim() || defaultConfig.fileName;
            const sharedFileId = overlay.querySelector('#sync-shared-id').value.trim();
            const autoSyncMinutes = Number(overlay.querySelector('#sync-auto-min').value || 5);
            const membersRaw = overlay.querySelector('#sync-members').value.trim();

            saveConfig({ clientId, apiKey, appId, fileName, sharedFileId, autoSyncMinutes });
            await syncMembers(membersRaw);
            await authenticate();
            overlay.remove();
        });

        overlay.querySelector('#sync-pull').addEventListener('click', async () => {
            await pull();
            overlay.remove();
        });

        overlay.querySelector('#trello-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            await importTasks(parseTrelloJson(text));
        });

        overlay.querySelector('#todoist-file').addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            await importTasks(parseTodoistCsv(text));
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

    // ── Miembros del equipo ────────────────────────────────────────────────────

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

    return { init, authenticate, disconnect, push, pull, openPanel, openPicker };
})();

window.syncManager = syncManager;
