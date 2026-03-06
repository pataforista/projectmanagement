import { encryptRecord, decryptRecord, isLocked, hasKey } from './utils/crypto.js';

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

    async function getSnapshot() {
        const data = {
            version: '1.2',
            updatedAt: Date.now(),
            metadata: {
                teamName: getConfig().teamName,
                actor: localStorage.getItem('workspace_user_name') || 'owner-local',
            },
            projects: store.get.projects(),
            tasks: store.get.allTasks(),
            cycles: store.get.cycles(),
            decisions: store.get.decisions(),
            documents: store.get.documents ? store.get.documents() : [],
            members: store.get.members(),
            logs: store.get.logs ? store.get.logs() : [],
            messages: store.get.messages ? store.get.messages() : [],
            annotations: store.get.annotations ? store.get.annotations() : [],
            snapshots: store.get.snapshots ? store.get.snapshots() : [],
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
                // Pre-flight check to prevent blind overwrites
                const remoteData = await getFileContentMetadata(fileId);
                const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);

                if (remoteData && remoteData.updatedAt && remoteData.updatedAt > localUpdate + 60000) {
                    // Remote is NEWER — abort push safely (no lock release required)
                    // Show non-blocking notification instead of confirm() to avoid race window
                    if (window.showToast) showToast('⚠️ Drive tiene cambios más recientes. Usa "Traer cambios" antes de guardar.', 'warning', 6000);
                    console.warn('[Sync] Push aborted: remote is newer. Pull first.');
                    return; // isSyncing is reset in finally
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
        if (store.dispatch) await store.dispatch('HYDRATE_STORE', data);
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
          <p style="margin:0;color:var(--text-muted);font-size:0.9rem;">Enfocado para equipos pequeños: un archivo compartido en Drive + importación rápida de tareas desde Notion (CSV) u Obsidian (Markdown checklist).<br><b>Para asegurar cambios importantes, usa los botones "Subir" o "Bajar" que están al fondo.</b></p>
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
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;" title="Importar export de Todoist">
              <i data-feather="check-circle" style="width:14px;height:14px;margin-right:4px;"></i> Todoist CSV
              <input type="file" id="todoist-file" accept=".csv" style="display:none;">
            </label>
          </div>
        </div>
        <div class="modal-footer" style="justify-content:space-between; flex-wrap: wrap; gap: 8px;">
          <button class="btn btn-ghost" id="sync-disconnect" style="color:var(--accent-danger);">Desconectar</button>
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
            const resp = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=20&fields=files(id,name,mimeType,thumbnailLink,webViewLink,iconLink,size)&q=trashed=false', {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            const result = await resp.json();
            return result.files || [];
        } catch (err) {
            console.error('[Sync] List files failed:', err);
            return [];
        }
    }

    return { init, authenticate, disconnect, push, pull, openPanel, getConfig, listDriveFiles, syncCalendar, syncGoogleTasks, syncTodoist, getAccessToken: () => accessToken };
})();

export { syncManager };
window.syncManager = syncManager;
