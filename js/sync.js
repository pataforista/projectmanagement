import { encryptRecord, decryptRecord, decryptAll, isLocked, hasKey } from './utils/crypto.js';
import { getCurrentWorkspaceActor, SYNCABLE_SETTINGS_KEYS, syncSettingsToLocalStorage, getDeviceInfo, updateCurrentDeviceInRegistry, mergeDevicesFromRemote, revokeDevice, getRevokedDevices, isCurrentDeviceRevoked, unRevokeDevice, mergeRevokedDevicesFromRemote, getOrCreateDeviceId, getDeviceName, setDeviceName, getDevicesRegistry, isDeviceRevoked } from './utils.js';

const syncManager = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/spreadsheets.readonly';
    const CONFIG_KEY = 'gdrive_sync_config';
    const STATUS_KEY = 'gdrive_connected';

    let tokenClient = null;
    let accessToken = null;
    let isSyncing = false;
    let autoSyncTimer = null;

    const defaultConfig = {
        clientId: '',
        fileName: 'workspace-team-data.json',
        sharedFileId: '',
        teamName: 'Equipo pequeño',
        autoSyncMinutes: 1,
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

    /**
     * Inicializa el estado de la sincronización en la UI e intenta inicializar 
     * el cliente de token de Google si existe el Client ID persistido.
     */
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

    /**
     * Fuerza la petición de un token de acceso OAuth (abriendo el consent screen 
     * de Google si es necesario) para iniciar la sincronización activa.
     */
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

    async function getSnapshot() {
        const sharedProjects = store.get.projects().filter(p => p.visibility !== 'local');
        const sharedProjectIds = new Set(sharedProjects.map(p => p.id));
        const isShared = item => !item.projectId || sharedProjectIds.has(item.projectId);

        // Register/update current device before building snapshot
        const currentDevices = updateCurrentDeviceInRegistry();

        const data = {
            version: '1.2',
            updatedAt: Date.now(),
            metadata: {
                teamName: getConfig().teamName,
                actor: getCurrentWorkspaceActor().label,
                deviceId: getDeviceInfo().id,
            },
            projects: sharedProjects,
            tasks: store.get.allTasks().filter(isShared).filter(t => t.visibility !== 'local'),
            cycles: store.get.cycles().filter(isShared),
            decisions: store.get.decisions().filter(isShared),
            documents: (store.get.documents ? store.get.documents() : []).filter(isShared),
            members: store.get.members(),
            logs: store.get.logs ? store.get.logs() : [],
            messages: (store.get.messages ? store.get.messages() : []).filter(isShared),
            annotations: (store.get.annotations ? store.get.annotations() : []).filter(isShared),
            snapshots: (store.get.snapshots ? store.get.snapshots() : []).filter(isShared),
            devices: currentDevices,
            revokedDevices: getRevokedDevices(),
            settings: SYNCABLE_SETTINGS_KEYS.reduce((acc, key) => {
                const val = localStorage.getItem(key);
                if (val !== null) acc[key] = val;
                return acc;
            }, {})
        };

        // E2EE Layer: Encrypt sensitive stores if key is available
        if (hasKey() && !isLocked()) {
            console.log('[Sync] Applying E2EE to snapshot...');
            try {
                return {
                    ...data,
                    e2ee: true,
                    projects: await Promise.all(data.projects.map(encryptRecord)),
                    tasks: await Promise.all(data.tasks.map(encryptRecord)),
                    cycles: await Promise.all(data.cycles.map(encryptRecord)),
                    decisions: await Promise.all(data.decisions.map(encryptRecord)),
                    documents: await Promise.all(data.documents.map(encryptRecord)),
                };
            } catch (e) {
                console.error('[Sync] E2EE failed, sending plaintext:', e);
            }
        }
        return data;
    }

    /**
     * Sube (Push) el snapshot del estado local hacio el archivo JSON en Google Drive.
     * Cifra los datos sensibles si Nexus Fortress está activado y advierte sobre sobrescrituras
     * accidentales si el archivo remoto es más nuevo.
     */
    async function push() {
        if (!accessToken || isSyncing) return;
        // Block push if this device was revoked
        if (isCurrentDeviceRevoked()) {
            showToast('⛔ Este dispositivo fue revocado. No se puede sincronizar.', 'error', true);
            return;
        }
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();
            const data = getSnapshot();

            let fileId = cfg.sharedFileId || localStorage.getItem('gdrive_file_id');
            if (!fileId) fileId = await findFile(cfg.fileName);

            if (fileId) {
                // Pre-flight check to prevent blind overwrites
                const remoteData = await getFileContentMetadata(fileId);
                const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);

                if (remoteData && remoteData.updatedAt && remoteData.updatedAt > localUpdate) {
                    // STRICT CONFLICT RESOLUTION: If remote is newer than our LAST PULL/PUSH, we MUST pull first.
                    // No more 60-second grace period that allowed data loss.
                    if (window.showToast) showToast('⚠️ Hay cambios remotos más recientes. Por favor, "Traer cambios" primero.', 'warning', true);
                    console.warn('[Sync] Push blocked: remote is newer than last local sync point.');
                    return;
                }
                await updateFile(fileId, data);
            } else {
                const newId = await createFile(cfg.fileName, data);
                if (!cfg.sharedFileId) localStorage.setItem('gdrive_file_id', newId);
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

    /**
     * Descarga (Pull) el archivo JSON desde Google Drive. 
     * Si la versión remota es más nueva que la local, actualiza la base de datos 
     * mediante la hidratación global del Store.
     */
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
        // Default to a somewhat faster sync for chat/collaboration (e.g. 1 min default if not set otherwise)
        const ms = Math.max(1, Number(minutes) || 1) * 60 * 1000;
        autoSyncTimer = setInterval(async () => {
            if (accessToken && !isSyncing) {
                // Auto-sync sequence: Try to pull new changes first, then push our own changes
                await pull();
                if (!isSyncing) await push();
            }
        }, ms);
    }

    // Hardening: Network Timeout Wrapper to prevent infinite hanging
    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 12000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    }

    async function findFile(name) {
        const q = `name='${name.replace(/'/g, "\\'")}' and trashed=false`;
        const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
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

        const resp = await fetchWithTimeout('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
            timeout: 15000
        });
        const result = await resp.json();
        return result.id;
    }

    async function updateFile(id, content) {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(content),
        });
    }

    async function getFileContent(id) {
        const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });
        if (!resp.ok) throw new Error("File not found or no permissions");
        return resp.json();
    }

    async function getFileContentMetadata(id) {
        // Just fetch the content. Drive doesn't allow easy partial downloads for JSON via v3 alt=media
        try {
            return await getFileContent(id);
        } catch { return null; }
    }

    async function seedFromRemote(data) {
        if (data.settings) {
            syncSettingsToLocalStorage(data.settings);
        }

        // Merge revocation list from remote BEFORE device registry merge
        if (Array.isArray(data.revokedDevices)) {
            mergeRevokedDevicesFromRemote(data.revokedDevices);
        }

        // Check if this device has been revoked by another device
        if (isCurrentDeviceRevoked()) {
            console.warn('[Sync] This device has been revoked. Blocking sync.');
            showToast('⛔ Este dispositivo fue revocado por otro administrador. Sync bloqueado.', 'error', true);
            // Show a persistent blocking UI
            _showRevocationNotice();
            return;
        }

        // Merge device registry from remote (preserves all known devices)
        if (Array.isArray(data.devices)) {
            mergeDevicesFromRemote(data.devices);
            console.log('[Sync] Device registry merged. Known devices:', data.devices.length);
        } else {
            // Ensure current device is registered even if remote has no devices list
            updateCurrentDeviceInRegistry();
        }

        let hydrationData = data;

        // Pillar 1: Atomic Decryption Flow
        // If the incoming data is encrypted, we must decrypt it BEFORE hydration
        // to avoid storing double-encrypted or raw blobs in the store memory.
        if (data.e2ee && hasKey() && !isLocked()) {
            console.log('[Sync] Decrypting remote snapshot for hydration...');
            try {
                hydrationData = {
                    ...data,
                    projects: await decryptAll(data.projects || []),
                    tasks: await decryptAll(data.tasks || []),
                    cycles: await decryptAll(data.cycles || []),
                    decisions: await decryptAll(data.decisions || []),
                    documents: await decryptAll(data.documents || []),
                };
            } catch (e) {
                console.error('[Sync] Pull decryption failed. Data might be corrupted or key is wrong.', e);
                showToast('Error al descifrar datos remotos. Verifica tu contraseña maestra.', 'error', true);
                return;
            }
        }

        if (store.dispatch) await store.dispatch('HYDRATE_STORE', hydrationData);
    }

    function parseNotionCsv(text) {
        const rows = parseCsv(text);
        if (rows.length < 2) return [];
        const headers = rows[0].map(h => h.toLowerCase());
        return rows.slice(1).map((cols, idx) => {
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
        // Expected columns: CONTENT,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE
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
            .filter(line => {
                const trimmed = line.trim();
                return /^- \[( |x)\]/i.test(trimmed) || /^[*-] /i.test(trimmed);
            })
            .map((line, idx) => {
                const trimmed = line.trim();
                // Checklist detection
                const isChecklist = /^- \[( |x)\]/i.test(trimmed);
                const done = /- \[x\]/i.test(trimmed);
                // Clean title
                let title = trimmed;
                if (isChecklist) {
                    title = trimmed.replace(/^- \[( |x)\]\s*/i, '');
                } else {
                    title = trimmed.replace(/^[*-]\s+/, '');
                }

                return {
                    id: `ob-${Date.now()}-${idx}`,
                    title: title.trim() || `Nota ${idx + 1}`,
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

    /**
     * Construye y muestra dinámicamente el modal de configuración de sincronización 
     * en pantalla, incluyendo accesos para configurar Drive e importar desde otras apps (CSV/MD).
     */
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
          <p style="margin:0;color:var(--text-muted);font-size:0.9rem;">Sincronización via Google Drive. Para acceder desde otro dispositivo: copia el <b>Shared File ID</b> del archivo de Drive y pégalo en ese dispositivo.<br><b>Para asegurar cambios importantes, usa los botones "Subir" o "Bajar" que están al fondo.</b></p>
          <div class="form-group">
            <label class="form-label">Google OAuth Client ID</label>
            <input class="form-input" id="sync-client-id" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cfg.clientId)}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Nombre del archivo</label>
              <input class="form-input" id="sync-file-name" value="${esc(cfg.fileName)}">
            </div>
            <div class="form-group">
              <label class="form-label" style="display:flex;align-items:center;justify-content:space-between;">
                <span>Shared File ID <span style="color:var(--text-muted);font-weight:400;">(vincula otro dispositivo)</span></span>
                ${(cfg.sharedFileId || localStorage.getItem('gdrive_file_id')) ? `<button type="button" id="sync-copy-fileid" class="btn btn-ghost btn-sm" style="font-size:0.72rem;padding:2px 8px;" title="Copiar ID para pegarlo en otro dispositivo"><i data-feather="copy" style="width:11px;height:11px;margin-right:3px;"></i>Copiar</button>` : ''}
              </label>
              <input class="form-input" id="sync-shared-id" placeholder="Pegar el File ID del JSON compartido" value="${esc(cfg.sharedFileId)}">
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
          <div style="display:flex;gap:12px;flex-wrap:wrap; margin-top:16px;">
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
        <div class="modal-footer" style="justify-content:space-between; flex-wrap: wrap; gap: 8px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-ghost" id="sync-disconnect" style="color:var(--accent-danger);">Desconectar</button>
            <button class="btn btn-ghost" id="sync-devices-btn" title="Ver y gestionar dispositivos vinculados"><i data-feather="monitor" style="width:14px;height:14px;"></i> Dispositivos</button>
          </div>
          <div style="display:flex;gap:8px; flex-wrap: wrap;">
            <button class="btn btn-secondary" id="sync-pull" title="Descargar de la nube al equipo (Pulsa esto si dejas la app abierta mucho tiempo)"><i data-feather="download-cloud" style="width:14px;height:14px;"></i> Bajar (Pull)</button>
            <button class="btn btn-secondary" id="sync-push-manual" title="Subir tus cambios a la nube ahora mismo"><i data-feather="upload-cloud" style="width:14px;height:14px;"></i> Subir (Push)</button>
            <button class="btn btn-primary" id="sync-save-connect">Guardar y conectar</button>
          </div>
        </div>
      </div>`;

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        if (window.feather) feather.replace();

        overlay.querySelector('#sync-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#sync-disconnect').addEventListener('click', () => {
            disconnect();
            overlay.remove();
        });
        overlay.querySelector('#sync-devices-btn').addEventListener('click', () => {
            overlay.remove();
            openDevicesPanel();
        });

        overlay.querySelector('#sync-save-connect').addEventListener('click', async () => {
            const clientId = overlay.querySelector('#sync-client-id').value.trim();
            const fileName = overlay.querySelector('#sync-file-name').value.trim() || defaultConfig.fileName;
            const sharedFileId = overlay.querySelector('#sync-shared-id').value.trim();
            const autoSyncMinutes = Number(overlay.querySelector('#sync-auto-min').value || 5);
            const membersRaw = overlay.querySelector('#sync-members').value.trim();

            saveConfig({ clientId, fileName, sharedFileId, autoSyncMinutes });
            await syncMembers(membersRaw);
            await authenticate();
            overlay.remove();
        });

        // Copy File ID to clipboard (for linking another device)
        overlay.querySelector('#sync-copy-fileid')?.addEventListener('click', () => {
            const fileId = overlay.querySelector('#sync-shared-id').value.trim()
                || localStorage.getItem('gdrive_file_id') || '';
            if (!fileId) { showToast('No hay File ID todavía. Sincroniza primero.', 'warning'); return; }
            navigator.clipboard.writeText(fileId).then(() => {
                showToast('File ID copiado. Pégalo en el nuevo dispositivo en "Shared File ID".', 'success');
            }).catch(() => {
                prompt('Copia este File ID manualmente:', fileId);
            });
        });

        overlay.querySelector('#sync-pull').addEventListener('click', async () => {
            await pull();
            overlay.remove();
        });

        overlay.querySelector('#sync-push-manual')?.addEventListener('click', async () => {
            if (!accessToken) {
                showToast('Primero asegúrate de estar conectado a Google Drive.', 'warning');
                return;
            }
            await push();
            overlay.remove();
            showToast('Sincronización manual completada: cambios subidos a Drive.', 'success');
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

    async function syncCalendar() {
        if (!accessToken || localStorage.getItem('sync_gcal') !== 'true') return;
        console.log('[Sync] Syncing Google Calendar...');
        // Logic to push/pull events would go here. 
        // For now, we'll implement a simple push of "Sessions" as events.
        const sessions = store.get.sessions();
        for (const s of sessions) {
            if (s.gcalId) continue; // Skip already synced
            try {
                const event = {
                    summary: s.title,
                    description: s.description || '',
                    start: { dateTime: new Date(`${s.date}T${s.startTime || '09:00'}:00`).toISOString() },
                    end: { dateTime: new Date(`${s.date}T${s.endTime || '10:00'}:00`).toISOString() },
                };
                const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(event)
                });
                const result = await resp.json();
                if (result.id) {
                    store.dispatch('UPDATE_SESSION', { id: s.id, gcalId: result.id });
                }
            } catch (e) {
                console.error('[Sync] GCal error:', e);
            }
        }
    }

    async function syncGoogleTasks() {
        if (!accessToken || localStorage.getItem('sync_gtasks') !== 'true') return;
        console.log('[Sync] Syncing Google Tasks...');
        const tasks = store.get.activeTasks();
        for (const t of tasks) {
            if (t.gtaskId) continue;
            try {
                const task = { title: t.title, notes: t.description || '' };
                const resp = await fetch('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(task)
                });
                const result = await resp.json();
                if (result.id) {
                    store.dispatch('UPDATE_TASK', { id: t.id, gtaskId: result.id });
                }
            } catch (e) {
                console.error('[Sync] GTasks error:', e);
            }
        }
    }

    async function syncTodoist() {
        const token = localStorage.getItem('todoist_token');
        if (!token || localStorage.getItem('sync_todoist') !== 'true') return;
        console.log('[Sync] Syncing with Todoist (Push only)...');
        const tasks = store.get.activeTasks().filter(t => !t.todoistId);
        for (const t of tasks) {
            try {
                const resp = await fetch('https://api.todoist.com/rest/v2/tasks', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: t.title, description: t.description || '' })
                });
                const result = await resp.json();
                if (result.id) store.dispatch('UPDATE_TASK', { id: t.id, todoistId: result.id });
            } catch (e) {
                console.error('[Sync] Todoist error:', e);
            }
        }
    }

    async function listDriveFiles() {
        if (!accessToken) return [];
        try {
            const params = new URLSearchParams({
                pageSize: '40',
                q: 'trashed=false',
                supportsAllDrives: 'true',
                includeItemsFromAllDrives: 'true',
                fields: 'files(id,name,mimeType,thumbnailLink,webViewLink,iconLink,size,driveId,ownedByMe,owners(displayName,emailAddress),shared)',
            });
            const resp = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const result = await resp.json();
            return result.files || [];
        } catch (err) {
            console.error('[Sync] List files failed:', err);
            return [];
        }
    }

    // ── Revocation Notice ─────────────────────────────────────────────────────

    function _showRevocationNotice() {
        if (document.getElementById('revocation-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'revocation-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--accent-danger,#e74c3c);color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:0.9rem;box-shadow:0 2px 12px rgba(0,0,0,0.3);';
        banner.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;">
            <i data-feather="shield-off" style="width:18px;height:18px;flex-shrink:0;"></i>
            <span><b>Dispositivo revocado.</b> Otro administrador ha bloqueado la sincronización desde este dispositivo. Contacta al administrador para restaurar el acceso.</span>
          </div>
          <button id="revocation-info-btn" class="btn" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);white-space:nowrap;font-size:0.8rem;padding:4px 12px;">¿Qué hacer?</button>`;
        document.body.prepend(banner);
        if (window.feather) feather.replace();
        banner.querySelector('#revocation-info-btn').addEventListener('click', () => {
            alert('Tu acceso a la sincronización fue revocado desde otro dispositivo.\n\nPara restaurarlo:\n1. Pide al administrador que abra "Dispositivos" en el panel de Sync\n2. Que seleccione tu dispositivo y presione "Restaurar"\n3. Que haga un Push para propagar el cambio\n4. Recarga esta página y haz Pull para confirmar');
        });
    }

    // ── Device Management ─────────────────────────────────────────────────────

    /**
     * Renders the HTML for the devices management section.
     * @param {Function} onRevokeCallback - Called with deviceId when a device is revoked.
     */
    /**
     * Builds the devices section DOM and binds its events inside a given container.
     */
    function _bindDevicesSection(container) {
        const section = container.querySelector('#devices-section');
        if (!section) return;

        // Rename current device
        section.querySelectorAll('.device-rename-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const currentName = getDeviceName();
                const newName = prompt('Nombre para este dispositivo:', currentName);
                if (newName && newName.trim()) {
                    setDeviceName(newName.trim());
                    updateCurrentDeviceInRegistry();
                    const listEl = section.querySelector('#devices-list');
                    if (listEl) listEl.innerHTML = _renderDevicesListHTML();
                    if (window.feather) feather.replace();
                    // Rebind events on fresh rows
                    _bindDevicesSection(section.parentElement || section);
                    showToast('Nombre de dispositivo actualizado.', 'success');
                }
            });
        });

        // Revoke other devices
        section.querySelectorAll('.device-revoke-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const deviceId = btn.dataset.id;
                const deviceName = btn.dataset.name || deviceId;
                if (!confirm(`¿Revocar acceso al dispositivo "${deviceName}"?\n\nEste dispositivo no podrá sincronizar datos hasta que lo restaures. El cambio se propaga al hacer Push.`)) return;
                revokeDevice(deviceId, deviceName);
                const listEl = section.querySelector('#devices-list');
                if (listEl) { listEl.innerHTML = _renderDevicesListHTML(); if (window.feather) feather.replace(); }
                _bindDevicesSection(section.parentElement || section);
                showToast(`"${deviceName}" revocado. Haz Push para propagar el cambio.`, 'warning', true);
            });
        });

        // Restore revoked devices
        section.querySelectorAll('.device-unrevoce-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const deviceId = btn.dataset.id;
                unRevokeDevice(deviceId);
                const listEl = section.querySelector('#devices-list');
                if (listEl) { listEl.innerHTML = _renderDevicesListHTML(); if (window.feather) feather.replace(); }
                _bindDevicesSection(section.parentElement || section);
                showToast('Dispositivo restaurado. Haz Push para propagar el cambio.', 'success', true);
            });
        });
    }

    function _renderDevicesListHTML() {
        const devices = getDevicesRegistry();
        const revokedList = getRevokedDevices();
        const revokedIds = new Set(revokedList.map(r => r.id));
        const currentId = getOrCreateDeviceId();
        const now = Date.now();
        const fmtTs = (ts) => {
            if (!ts) return 'Desconocido';
            const diff = now - ts;
            const mins = Math.floor(diff / 60000);
            if (mins < 2) return 'Ahora mismo';
            if (mins < 60) return `Hace ${mins} min`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `Hace ${hrs}h`;
            return `Hace ${Math.floor(hrs / 24)}d`;
        };

        // Active devices
        const activeRows = devices.length === 0
            ? `<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:12px 0;">Sin dispositivos registrados. Sincroniza para registrar este dispositivo.</p>`
            : devices.map(d => {
                const isCurrent = d.id === currentId;
                return `<div class="device-row" data-device-id="${esc(d.id)}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:var(--bg-secondary);margin-bottom:6px;border:1px solid ${isCurrent ? 'var(--accent-primary)' : 'var(--border-color)'};">
                  <i data-feather="${d.platform === 'mobile' ? 'smartphone' : 'monitor'}" style="width:18px;height:18px;flex-shrink:0;color:${isCurrent ? 'var(--accent-primary)' : 'var(--text-muted)'};"></i>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                      <span>${esc(d.name)}</span>
                      ${isCurrent ? '<span style="font-size:0.7rem;background:var(--accent-primary);color:#fff;padding:1px 6px;border-radius:10px;font-weight:500;">Este dispositivo</span>' : ''}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${esc(d.browser || '')}${d.browser ? ' · ' : ''}${fmtTs(d.lastSeen)}</div>
                  </div>
                  <div style="display:flex;gap:6px;flex-shrink:0;">
                    ${isCurrent ? `<button class="btn btn-ghost btn-sm device-rename-btn" data-id="${esc(d.id)}" style="font-size:0.75rem;padding:3px 8px;" title="Renombrar"><i data-feather="edit-2" style="width:12px;height:12px;"></i></button>` : ''}
                    ${!isCurrent ? `<button class="btn btn-ghost btn-sm device-revoke-btn" data-id="${esc(d.id)}" data-name="${esc(d.name)}" style="font-size:0.75rem;padding:3px 8px;color:var(--accent-danger);" title="Revocar acceso a este dispositivo"><i data-feather="shield-off" style="width:12px;height:12px;"></i> Revocar</button>` : ''}
                  </div>
                </div>`;
            }).join('');

        // Revoked devices section
        const revokedRows = revokedList.length === 0 ? '' : `
            <div style="margin-top:14px;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                <i data-feather="shield-off" style="width:14px;height:14px;color:var(--accent-danger);"></i>
                <span style="font-size:0.8rem;font-weight:600;color:var(--accent-danger);">Revocados (${revokedList.length})</span>
              </div>
              ${revokedList.map(r => `
                <div class="device-row" data-device-id="${esc(r.id)}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:var(--bg-secondary);margin-bottom:6px;border:1px solid var(--accent-danger);opacity:0.8;">
                  <i data-feather="shield-off" style="width:18px;height:18px;flex-shrink:0;color:var(--accent-danger);"></i>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:0.88rem;color:var(--accent-danger);">${esc(r.name || r.id)}</div>
                    <div style="font-size:0.73rem;color:var(--text-muted);">Revocado ${fmtTs(r.revokedAt)}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm device-unrevoce-btn" data-id="${esc(r.id)}" style="font-size:0.75rem;padding:3px 8px;color:var(--accent-success,#27ae60);" title="Restaurar acceso">
                    <i data-feather="shield-check" style="width:12px;height:12px;"></i> Restaurar
                  </button>
                </div>`).join('')}
            </div>`;

        return activeRows + revokedRows;
    }

    /**
     * Opens a standalone modal to manage linked devices.
     */
    function openDevicesPanel() {
        const revokedCount = getRevokedDevices().length;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'devices-panel-overlay';
        overlay.innerHTML = `
          <div class="modal" style="max-width:520px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
              <h2><i data-feather="monitor"></i> Dispositivos vinculados${revokedCount > 0 ? ` <span style="font-size:0.75rem;background:var(--accent-danger);color:#fff;padding:2px 8px;border-radius:10px;margin-left:6px;vertical-align:middle;">${revokedCount} revocado${revokedCount > 1 ? 's' : ''}</span>` : ''}</h2>
              <button class="btn btn-icon" id="devices-close"><i data-feather="x"></i></button>
            </div>
            <div class="modal-body">
              <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;margin-bottom:16px;font-size:0.82rem;color:var(--text-muted);line-height:1.5;">
                <b style="color:var(--text-primary);">¿Cómo funciona?</b><br>
                Cada dispositivo se registra al sincronizar. <b>Revocar</b> bloquea el sync de ese dispositivo — el cambio se propaga cuando hagas Push. Puede restaurarse en cualquier momento.
              </div>
              <div id="devices-section">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                  <h3 style="margin:0;font-size:0.95rem;">Activos</h3>
                  <button class="btn btn-ghost btn-sm" id="devices-rename-current" style="font-size:0.78rem;">
                    <i data-feather="edit-2" style="width:12px;height:12px;"></i> Renombrar este dispositivo
                  </button>
                </div>
                <div id="devices-list">${_renderDevicesListHTML()}</div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-primary" id="devices-close-btn">Cerrar</button>
            </div>
          </div>`;

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        if (window.feather) feather.replace();

        overlay.querySelector('#devices-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#devices-close-btn').addEventListener('click', () => overlay.remove());

        overlay.querySelector('#devices-rename-current').addEventListener('click', () => {
            const newName = prompt('Nombre para este dispositivo:', getDeviceName());
            if (newName && newName.trim()) {
                setDeviceName(newName.trim());
                updateCurrentDeviceInRegistry();
                const listEl = overlay.querySelector('#devices-list');
                if (listEl) { listEl.innerHTML = _renderDevicesListHTML(); if (window.feather) feather.replace(); }
                _bindDevicesSection(overlay.querySelector('#devices-section'));
                showToast('Nombre de dispositivo actualizado.', 'success');
            }
        });

        _bindDevicesSection(overlay.querySelector('#devices-section'));
    }

    return { init, authenticate, disconnect, push, pull, openPanel, openDevicesPanel, getConfig, listDriveFiles, syncCalendar, syncGoogleTasks, syncTodoist, getAccessToken: () => accessToken };
})();

export { syncManager };
window.syncManager = syncManager;
window.openDevicesPanel = () => syncManager.openDevicesPanel();
