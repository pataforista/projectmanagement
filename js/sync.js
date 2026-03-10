import { encryptRecord, decryptRecord, decryptAll, isLocked, hasKey } from './utils/crypto.js';
import { getCurrentWorkspaceActor, SYNCABLE_SETTINGS_KEYS, syncSettingsToLocalStorage } from './utils.js';

const syncManager = (() => {
    const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
    const CONFIG_KEY = 'gdrive_sync_config';
    const STATUS_KEY = 'gdrive_connected';
    const ID_TOKEN_KEY = 'google_id_token';

    let tokenClient = null;
    let accessToken = null;
    let currentUser = null; // Profile from ID Token
    let isSyncing = false;
    let autoSyncTimer = null;
    let networkOnline = navigator.onLine;

    const defaultConfig = {
        clientId: '',
        fileName: 'workspace-team-data.json',
        sharedFolderId: '',
        teamName: 'Equipo pequeño',
        autoSyncMinutes: 1,
    };

    // ... rest of getConfig/saveConfig ...

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
        const stateLabel = document.getElementById('sync-state-label');
        if (!btn || !indicator) return;

        indicator.classList.remove('status-online', 'status-offline', 'status-syncing', 'status-error');
        stateLabel?.classList.remove('status-online', 'status-offline', 'status-syncing', 'status-error');

        const setLabel = (text, nextStatus) => {
            if (!stateLabel) return;
            stateLabel.textContent = text;
            stateLabel.classList.add(nextStatus);
        };

        switch (status) {
            case 'online':
                indicator.classList.add('status-online');
                btn.title = 'Google Drive conectado';
                btn.setAttribute('aria-label', 'Sincronización online');
                setLabel('Online', 'status-online');
                break;
            case 'syncing':
                indicator.classList.add('status-syncing');
                btn.title = 'Sincronizando con Google Drive';
                btn.setAttribute('aria-label', 'Sincronizando cambios');
                setLabel('Sincronizando', 'status-syncing');
                break;
            case 'error':
                indicator.classList.add('status-error');
                btn.title = 'Error de sincronización';
                btn.setAttribute('aria-label', 'Error de sincronización');
                setLabel('Error', 'status-error');
                break;
            default:
                indicator.classList.add('status-offline');
                btn.title = networkOnline ? 'Configurar Google Drive' : 'Sin conexión';
                btn.setAttribute('aria-label', networkOnline ? 'Sincronización desconectada' : 'Sin conexión a internet');
                setLabel(networkOnline ? 'Offline' : 'Sin internet', 'status-offline');
        }
    }

    function bindNetworkListeners() {
        window.addEventListener('online', () => {
            networkOnline = true;
            updateSyncUI(localStorage.getItem(STATUS_KEY) === 'true' ? 'online' : 'offline');
            if (window.showToast) showToast('Conexión restablecida', 'success');
        });

        window.addEventListener('offline', () => {
            networkOnline = false;
            updateSyncUI('offline');
            if (window.showToast) showToast('Sin conexión. Trabajando en modo local.', 'warning');
        });
    }

    async function loadGIS() {
        if (window.google?.accounts?.oauth2 && window.google?.accounts?.id) return;
        await new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-gis="true"]');
            if (existing) {
                // If already appended but maybe not loaded, wait. Or if loaded, resolve.
                if (window.google?.accounts?.id) return resolve();
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
     * CAPA A: AUTENTICACIÓN (Identity via OIDC)
     * Obtiene el ID Token de Google para identificar al usuario.
     */
    async function signIn(optionalClientId) {
        return new Promise(async (resolve, reject) => {
            const cfg = getConfig();
            const client_id = optionalClientId || cfg.clientId;
            if (!client_id) return reject('No Google Client ID configured');

            await loadGIS();

            google.accounts.id.initialize({
                client_id: client_id,
                callback: (response) => {
                    if (response.credential) {
                        localStorage.setItem(ID_TOKEN_KEY, response.credential);
                        currentUser = decodeIdToken(response.credential);
                        syncIdentityToWorkspaceProfile(currentUser);
                        console.log('[Sync] Identity confirmed:', currentUser.email);
                        if (window.updateUserProfileUI) window.updateUserProfileUI();
                        resolve(currentUser);
                    } else {
                        reject('No credential returned');
                    }
                }
            });
            google.accounts.id.prompt(); // One Tap or standard prompt
        });
    }

    function decodeIdToken(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            return null;
        }
    }

    function syncIdentityToWorkspaceProfile(user) {
        if (!user) return;
        const name = user.name || user.given_name || user.email || 'Usuario';
        const email = String(user.email || '').trim().toLowerCase();
        const avatar = name.charAt(0).toUpperCase() || 'U';

        localStorage.setItem('workspace_user_name', name);
        localStorage.setItem('workspace_user_email', email);
        localStorage.setItem('workspace_user_avatar', avatar);

        if (!localStorage.getItem('workspace_user_role')) {
            localStorage.setItem('workspace_user_role', 'Miembro');
        }
    }

    /**
     * CAPA B: AUTORIZACIÓN (OAuth 2.0)
     * Obtiene el Access Token para servicios específicos (Drive, etc.)
     */
    async function authorize(optionalClientId) {
        return new Promise(async (resolve, reject) => {
            const cfg = getConfig();
            const client_id = optionalClientId || cfg.clientId;
            if (!client_id) return reject('No Google Client ID configured');

            await loadGIS();
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: client_id,
                scope: SCOPES,
                callback: (resp) => {
                    if (resp?.error) return reject(resp.error);
                    accessToken = resp.access_token;
                    localStorage.setItem(STATUS_KEY, 'true');
                    updateSyncUI('online');
                    resolve(accessToken);
                },
            });
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }


    /**
     * Login + Busca el archivo de workspace en Drive y devuelve su contenido si existe.
     * FIXED: Si ya hay un usuario autenticado (currentUser), NO vuelve a llamar signIn
     * para evitar abrir el One-Tap de Google por segunda vez.
     */
    async function loginAndCheckRemote(optionalClientId) {
        try {
            // Solo llama signIn si NO hay identidad ya confirmada en esta sesión
            if (!currentUser) {
                await signIn(optionalClientId);
            }
            // Siempre autorizar Drive (OAuth) ya que el accessToken puede no existir
            await authorize(optionalClientId);
            return await checkRemote();
        } catch (err) {
            console.error('[Sync] identity + authorize flow failed:', err);
            throw err;
        }
    }

    /**
     * Busca el archivo del workspace en Drive con el accessToken actual.
     * Requiere que authorize() ya haya sido llamado antes.
     * @returns {Object|null} Contenido del archivo JSON remoto, o null si no existe.
     */
    async function checkRemote() {
        if (!accessToken) throw new Error('[Sync] checkRemote: no accessToken disponible. Llama authorize() primero.');
        const cfg = getConfig();

        let folderId = cfg.sharedFolderId || await findFolder('Nexus_Workspace');
        if (!folderId) return null;

        const fileId = await findFile(cfg.fileName, folderId);
        if (!fileId) return null;
        return await getFileContent(fileId);
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
        bindNetworkListeners();
        updateSyncUI(localStorage.getItem(STATUS_KEY) === 'true' ? 'online' : 'offline');

        const storedIdToken = localStorage.getItem(ID_TOKEN_KEY);
        if (storedIdToken) currentUser = decodeIdToken(storedIdToken);

        const cfg = getConfig();
        configureAutoSync(cfg.autoSyncMinutes);
        if (cfg.clientId) {
            try {
                // We don't auto-authorize Drive without user action to follow "minimal scopes" principle.
                // But we load GIS so it's ready.
                await loadGIS();
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

        const data = {
            version: '1.2',
            updatedAt: Date.now(),
            metadata: {
                teamName: getConfig().teamName,
                actor: getCurrentWorkspaceActor().label,
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
        if (!accessToken || isSyncing || !networkOnline) return;
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();
            const data = await getSnapshot();

            // 1. Localizar o crear el Workspace Folder
            let folderId = cfg.sharedFolderId || localStorage.getItem('gdrive_folder_id');
            if (!folderId) folderId = await findFolder('Nexus_Workspace');
            if (!folderId) {
                folderId = await createFolder('Nexus_Workspace');
                localStorage.setItem('gdrive_folder_id', folderId);
            }

            // 2. Localizar el archivo core dentro del folder
            let fileId = localStorage.getItem('gdrive_file_id');
            if (!fileId) fileId = await findFile(cfg.fileName, folderId);

            if (fileId) {
                const remoteData = await getFileContentMetadata(fileId);
                const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);

                if (remoteData && remoteData.updatedAt && remoteData.updatedAt > localUpdate) {
                    if (window.showToast) showToast('⚠️ Hay cambios remotos más recientes. Por favor, "Traer cambios" primero.', 'warning', true);
                    console.warn('[Sync] Push blocked: remote is newer than last local sync point.');
                    return;
                }
                await updateFile(fileId, data);
            } else {
                const newId = await createFile(cfg.fileName, data, folderId);
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

    /**
     * Descarga (Pull) el archivo JSON desde Google Drive. 
     * Si la versión remota es más nueva que la local, actualiza la base de datos 
     * mediante la hidratación global del Store.
     */
    async function pull() {
        if (!accessToken || isSyncing || !networkOnline) return;
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();

            // 1. Localizar el Workspace Folder
            let folderId = cfg.sharedFolderId || localStorage.getItem('gdrive_folder_id');
            if (!folderId) folderId = await findFolder('Nexus_Workspace');
            if (!folderId) {
                updateSyncUI('online');
                return; // Nothing to pull if the folder doesn't exist
            }
            localStorage.setItem('gdrive_folder_id', folderId);

            // 2. Localizar el archivo core
            let fileId = localStorage.getItem('gdrive_file_id');
            if (!fileId) fileId = await findFile(cfg.fileName, folderId);
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
            if (accessToken && !isSyncing && networkOnline) {
                // Auto-sync sequence: Try to pull new changes first, then push our own changes
                await pull();
                if (!isSyncing) await push();
            }
        }, ms);

        // Start the micro-polling Chat Engine
        startChatSync();
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
        clearTimeout(id);
        return response;
    }

    async function findFolder(name) {
        const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await resp.json();
        return result.files && result.files[0] ? result.files[0].id : null;
    }

    async function createFolder(name, parentId = null) {
        const metadata = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) metadata.parents = [parentId];

        const resp = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        const result = await resp.json();
        return result.id;
    }

    async function findFile(name, parentId = null) {
        let q = `name='${name.replace(/'/g, "\\'")}' and trashed=false`;
        if (parentId) q += ` and '${parentId}' in parents`;

        const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await resp.json();
        return result.files && result.files[0] ? result.files[0].id : null;
    }

    async function createFile(name, content, parentId = null) {
        const metadata = { name, mimeType: 'application/json' };
        if (parentId) metadata.parents = [parentId];

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
        const response = await fetchWithTimeout(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(content),
            timeout: 15000,
        });
        if (!response.ok) throw new Error(`No se pudo actualizar archivo en Drive (${response.status})`);
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
              <label class="form-label">Shared Folder ID (Opcional)</label>
              <input class="form-input" id="sync-shared-id" placeholder="Pegar ID de la Carpeta compartida" value="${esc(cfg.sharedFolderId)}">
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
            const sharedFolderId = overlay.querySelector('#sync-shared-id').value.trim();
            const autoSyncMinutes = Number(overlay.querySelector('#sync-auto-min').value || 5);
            const membersRaw = overlay.querySelector('#sync-members').value.trim();

            saveConfig({ clientId, fileName, sharedFolderId, autoSyncMinutes });
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

    async function syncNow() {
        if (!accessToken) {
            showToast('Primero conecta Google Drive para sincronizar.', 'warning');
            openPanel();
            return;
        }
        if (!networkOnline) {
            showToast('Sin conexión. No se puede sincronizar ahora.', 'warning');
            return;
        }
        if (isSyncing) {
            showToast('Sincronización en curso…', 'info');
            return;
        }
        showToast('Sincronizando…', 'info');
        await pull();
        await push();
        showToast('Sincronización completada.', 'success');
    }

    // ── CHAT ENGINE (Local-First P2P via Drive) ──────────────────────────────

    let chatFolderId = localStorage.getItem('gdrive_chat_folder_id');
    let chatSyncTimer = null;

    async function getChatFolder() {
        if (chatFolderId) return chatFolderId;
        const cfg = getConfig();
        let rootFolderId = cfg.sharedFolderId || localStorage.getItem('gdrive_folder_id');
        if (!rootFolderId) return null; // Aún no hay workspace

        chatFolderId = await findFolder('chat_messages', rootFolderId);
        if (!chatFolderId) {
            chatFolderId = await createFolder('chat_messages', rootFolderId);
        }
        localStorage.setItem('gdrive_chat_folder_id', chatFolderId);
        return chatFolderId;
    }

    async function uploadChatMessage(msg) {
        if (!accessToken || !networkOnline) return false;
        try {
            const fId = await getChatFolder();
            if (!fId) return false;

            // Si la capa crypto está activa, podemos encriptarlo aquí.
            let payload = msg;
            if (window.cryptoLayer && window.hasKey && window.hasKey() && !window.isLocked()) {
                try { payload = await encryptRecord(msg); } catch (e) { }
            }

            const name = `msg_${msg.createdAt}_${msg.id}.json`;
            await createFile(name, payload, fId);
            return true;
        } catch (e) {
            console.error('[ChatSync] Upload failed:', e);
            return false;
        }
    }

    async function pollChat() {
        if (!accessToken || !networkOnline || isSyncing) return;
        try {
            const fId = await getChatFolder();
            if (!fId) return;

            let token = localStorage.getItem('gdrive_chat_token');
            if (!token) {
                const tkRes = await fetchWithTimeout('https://www.googleapis.com/drive/v3/changes/getStartPageToken', {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                const tkData = await tkRes.json();
                token = tkData.startPageToken;
                localStorage.setItem('gdrive_chat_token', token);
                return; // Empezamos a escuchar desde ahora
            }

            const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/changes?pageToken=${token}&spaces=drive&fields=changes(fileId,removed,file(name,parents)),newStartPageToken,nextPageToken`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const data = await res.json();

            // Si el token expira o es inválido, reset
            if (data.error && data.error.code === 400) {
                localStorage.removeItem('gdrive_chat_token');
                return;
            }

            if (data.changes && data.changes.length > 0) {
                for (const change of data.changes) {
                    if (!change.removed && change.file && change.file.name && change.file.name.startsWith('msg_')) {
                        // Verificamos si pertenece a nuestra carpeta de chat (a veces drive no devuelve parents si no se pide bien, pero lo pedimos en fields)
                        if (change.file.parents && change.file.parents.includes(fId)) {
                            try {
                                let msgData = await getFileContent(change.fileId);

                                // Decrypt si aplica
                                if (msgData.iv && window.cryptoLayer && window.hasKey && window.hasKey() && !window.isLocked()) {
                                    try { msgData = await decryptRecord(msgData); } catch (e) { }
                                }

                                // Inyectar a la base de datos local y excluirlo del monolithic sync
                                msgData.visibility = 'local';

                                // Revisamos si ya existe para evitar duplicados
                                const exist = (store.get.messages ? store.get.messages() : []).find(m => m.id === msgData.id);
                                if (!exist) {
                                    await store.dispatch('ADD_MESSAGE', msgData);
                                }
                            } catch (e) { console.warn('[ChatSync] Failed DL msg', e); }
                        }
                    }
                }
            }

            if (data.newStartPageToken) {
                localStorage.setItem('gdrive_chat_token', data.newStartPageToken);
            }
        } catch (e) {
            console.error('[ChatSync] Polling error:', e);
        }
    }

    function startChatSync() {
        if (chatSyncTimer) clearInterval(chatSyncTimer);
        chatSyncTimer = setInterval(pollChat, 2500); // 2.5s Latencia!
    }

    return {
        init,
        signIn,
        authorize,
        loginAndCheckRemote,
        checkRemote,
        authenticate,
        disconnect,
        push,
        pull,
        syncNow,
        openPanel,
        getConfig,
        saveConfig,
        listDriveFiles,
        syncCalendar,
        syncGoogleTasks,
        syncTodoist,
        uploadChatMessage,
        startChatSync,
        getAccessToken: () => accessToken,
        getUser: () => currentUser
    };
})();

export { syncManager };
window.syncManager = syncManager;
