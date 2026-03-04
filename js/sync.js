/**
 * sync.js — Google Drive Synchronization + Team Import Manager
 */

const syncManager = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/tasks';
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
        autoSyncMinutes: 5,
        todoistApiToken: '',
        zoteroApiKey: '',
        zoteroUserId: '',
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

            // Allow manual override via cfg.sharedFileId or previous creation
            let fileId = cfg.sharedFileId || localStorage.getItem('gdrive_file_id');
            if (!fileId) fileId = await findFile(cfg.fileName);

            if (fileId) {
                // Pre-flight check to prevent blind overwrites
                const remoteData = await getFileContentMetadata(fileId);
                const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);

                if (remoteData && remoteData.updatedAt && remoteData.updatedAt > localUpdate + 60000) {
                    // Release lock before showing confirm dialog
                    isSyncing = false;
                    const confirmPull = confirm("⚠️ Drive tiene cambios más recientes. ¿Deseas descargar los cambios del equipo antes de sobrescribir?");
                    if (confirmPull) {
                        // Do a clean pull, update local timestamp, then return without pushing
                        await pull();
                        return;
                    }
                    // User said No, re-acquire lock and continue pushing
                    isSyncing = true;
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
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
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

        const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
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
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
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

    async function fetchGoogleTasks() {
        if (!accessToken) {
            showToast('Conecta Google Drive primero para importar Google Tasks', 'error');
            return;
        }
        try {
            const listsResp = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!listsResp.ok) throw new Error(`HTTP ${listsResp.status}`);
            const listsData = await listsResp.json();
            if (!listsData.items || listsData.items.length === 0) {
                showToast('No se encontraron listas en Google Tasks', 'info');
                return;
            }

            let allTasks = [];
            for (const list of listsData.items) {
                const tasksResp = await fetch(
                    `https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=true&maxResults=100`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (!tasksResp.ok) continue;
                const tasksData = await tasksResp.json();
                if (tasksData.items) {
                    const converted = tasksData.items.map((t, idx) => ({
                        id: `gt-${t.id || Date.now()}-${idx}`,
                        title: t.title || 'Sin título',
                        status: t.status === 'completed' ? 'Terminado' : 'Capturado',
                        dueDate: t.due ? t.due.split('T')[0] : '',
                        priority: 'media',
                        type: 'task',
                        createdAt: Date.now(),
                        tags: ['google-tasks', list.title].filter(Boolean),
                        subtasks: [],
                    }));
                    allTasks = allTasks.concat(converted);
                }
            }

            if (allTasks.length === 0) {
                showToast('No se encontraron tareas en Google Tasks', 'info');
                return;
            }
            await importTasks(allTasks);
        } catch (err) {
            console.error('[Sync] Google Tasks fetch failed:', err);
            showToast('Error al importar de Google Tasks', 'error');
        }
    }

    async function fetchTodoistTasks(apiToken) {
        if (!apiToken) {
            showToast('Introduce tu API Token de Todoist', 'error');
            return;
        }
        try {
            const resp = await fetch('https://api.todoist.com/rest/v2/tasks', {
                headers: { Authorization: `Bearer ${apiToken}` },
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();

            const tasks = data.map((t, idx) => ({
                id: `tdapi-${t.id || Date.now()}-${idx}`,
                title: t.content || 'Sin título',
                description: t.description || '',
                status: t.is_completed ? 'Terminado' : 'Capturado',
                dueDate: t.due?.date || '',
                priority: t.priority === 4 ? 'alta' : t.priority === 3 ? 'media' : 'baja',
                type: 'task',
                createdAt: Date.now(),
                tags: ['todoist-api', ...(t.labels || [])],
                subtasks: [],
            }));

            if (tasks.length === 0) {
                showToast('No hay tareas activas en Todoist', 'info');
                return;
            }
            await importTasks(tasks);
        } catch (err) {
            console.error('[Sync] Todoist API fetch failed:', err);
            showToast('Error al importar de Todoist. Verifica tu API Token', 'error');
        }
    }

    async function fetchZoteroItems(apiKey, userId) {
        if (!apiKey || !userId) {
            showToast('Introduce tu API Key y User ID de Zotero', 'error');
            return;
        }
        try {
            const resp = await fetch(
                `https://api.zotero.org/users/${userId}/items?limit=50&format=json`,
                { headers: { 'Zotero-API-Key': apiKey, 'Zotero-API-Version': '3' } }
            );
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const items = await resp.json();

            const tasks = items
                .filter(item => item.data.itemType !== 'attachment' && item.data.itemType !== 'note')
                .map((item, idx) => {
                    const d = item.data;
                    const authors = (d.creators || [])
                        .map(c => c.lastName || c.name || '')
                        .filter(Boolean)
                        .join(', ');
                    const year = d.date ? d.date.split('-')[0] : '';
                    return {
                        id: `zo-${item.key}-${idx}`,
                        title: `${d.title || 'Sin título'}${authors ? ' — ' + authors : ''}${year ? ' (' + year + ')' : ''}`,
                        description: d.abstractNote || '',
                        status: 'Capturado',
                        priority: 'media',
                        type: 'task',
                        createdAt: Date.now(),
                        tags: ['zotero-import', d.itemType || 'referencia'],
                        subtasks: [],
                    };
                });

            if (tasks.length === 0) {
                showToast('No se encontraron ítems en Zotero', 'info');
                return;
            }
            await importTasks(tasks);
        } catch (err) {
            console.error('[Sync] Zotero fetch failed:', err);
            showToast('Error al importar de Zotero. Verifica API Key y User ID', 'error');
        }
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
              <label class="form-label">Nombre del archivo</label>
              <input class="form-input" id="sync-file-name" value="${esc(cfg.fileName)}">
            </div>
            <div class="form-group">
              <label class="form-label">Shared File ID (Opcional)</label>
              <input class="form-input" id="sync-shared-id" placeholder="Pegar ID del JSON compartido" value="${esc(cfg.sharedFileId)}">
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
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Importar export CSV de Todoist">
              <i data-feather="check-circle" style="width:14px;height:14px;margin-right:4px;"></i> Todoist CSV
              <input type="file" id="todoist-file" accept=".csv" style="display:none;">
            </label>
          </div>

          <hr style="border:none;border-top:1px solid var(--border-color);margin:20px 0 16px;">
          <p style="font-size:0.82rem;font-weight:600;color:var(--text-muted);margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Integraciones en vivo (API)</p>

          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="display:flex;align-items:center;gap:6px;">
              <i data-feather="check-square" style="width:14px;height:14px;"></i> Google Tasks
            </label>
            <p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 6px;">Usa tu cuenta Google ya conectada. Importa todas tus listas y tareas.</p>
            <button class="btn btn-secondary btn-sm" id="btn-import-gtasks">
              <i data-feather="download" style="width:13px;height:13px;margin-right:4px;"></i> Importar Google Tasks
            </button>
          </div>

          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="display:flex;align-items:center;gap:6px;">
              <i data-feather="check-circle" style="width:14px;height:14px;"></i> Todoist (API)
            </label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input class="form-input" id="sync-todoist-token" type="password" placeholder="API Token de Todoist" value="${esc(cfg.todoistApiToken || '')}" style="flex:1;">
              <button class="btn btn-secondary btn-sm" id="btn-import-todoist" style="white-space:nowrap;">
                <i data-feather="download" style="width:13px;height:13px;margin-right:4px;"></i> Importar
              </button>
            </div>
            <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 0;">Obtén tu token en <strong>todoist.com/prefs/integrations</strong></p>
          </div>

          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:6px;">
              <i data-feather="book" style="width:14px;height:14px;"></i> Zotero (API)
            </label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">
              <input class="form-input" id="sync-zotero-key" type="password" placeholder="API Key" value="${esc(cfg.zoteroApiKey || '')}">
              <input class="form-input" id="sync-zotero-userid" placeholder="User ID (numérico)" value="${esc(cfg.zoteroUserId || '')}">
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-import-zotero">
              <i data-feather="download" style="width:13px;height:13px;margin-right:4px;"></i> Importar biblioteca Zotero
            </button>
            <p style="font-size:0.78rem;color:var(--text-muted);margin:4px 0 0;">API Key en <strong>zotero.org/settings/keys</strong> · User ID en tu perfil de Zotero</p>
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
            const sharedFileId = overlay.querySelector('#sync-shared-id').value.trim();
            const autoSyncMinutes = Number(overlay.querySelector('#sync-auto-min').value || 5);
            const membersRaw = overlay.querySelector('#sync-members').value.trim();

            saveConfig({ clientId, fileName, sharedFileId, autoSyncMinutes });
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

        overlay.querySelector('#btn-import-gtasks').addEventListener('click', async () => {
            await fetchGoogleTasks();
        });

        overlay.querySelector('#btn-import-todoist').addEventListener('click', async () => {
            const token = overlay.querySelector('#sync-todoist-token').value.trim();
            const currentCfg = getConfig();
            saveConfig({ ...currentCfg, todoistApiToken: token });
            await fetchTodoistTasks(token);
        });

        overlay.querySelector('#btn-import-zotero').addEventListener('click', async () => {
            const apiKey = overlay.querySelector('#sync-zotero-key').value.trim();
            const userId = overlay.querySelector('#sync-zotero-userid').value.trim();
            const currentCfg = getConfig();
            saveConfig({ ...currentCfg, zoteroApiKey: apiKey, zoteroUserId: userId });
            await fetchZoteroItems(apiKey, userId);
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
