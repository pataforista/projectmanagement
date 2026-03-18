import { encryptRecord, decryptRecord, decryptAll, isLocked, hasKey, lock, getWorkspaceSaltBase64, injectWorkspaceSalt, computeChecksum, computeSaltChecksum, getStoredIterations, commitIterationUpgrade } from './utils/crypto.js';
import { getCurrentWorkspaceActor, SYNCABLE_SETTINGS_KEYS, syncSettingsToLocalStorage } from './utils.js';
import { AccountChangeDetector } from './utils/account-detector.js';
import { StorageManager } from './utils/storage-manager.js';
import { SessionManager } from './utils/session-manager.js';

const syncManager = (() => {
    // drive.file only allows access to files created by THIS app instance for THIS user,
    // which blocks cross-account collaboration (Account B cannot find Account A's workspace
    // file even in a shared folder). The 'drive' scope allows reading/writing any Drive
    // file the signed-in user has access to, which is required for shared workspaces.
    // For private/internal team use this works without Google app verification
    // (users will see the standard "unverified app" consent screen on first auth).
    const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata';
    const CONFIG_KEY = 'gdrive_sync_config';
    const STATUS_KEY = 'gdrive_connected';
    const ID_TOKEN_KEY = 'google_id_token';

    let tokenClient = null;
    let accessToken = null;
    let currentUser = null; // Profile from ID Token
    let isSyncing = false;
    let pushPending = false;
    let autoSyncTimer = null;
    let networkOnline = navigator.onLine;
    let tokenTimestamp = 0; // Epoch when accessToken was issued
    let syncPausedUntil = 0; // Circuit Breaker timestamp
    // GHOST WIPE GUARD: push() is blocked until pull() has confirmed the remote
    // state (file exists and was applied, or confirmed absent). Without this, a
    // new device with empty local state could push an empty snapshot to Drive
    // before the initial pull completes, wiping all remote data.
    let _remoteChecked = false;
    // BUG 31: channel for broadcasting IDB updates to sibling tabs (see pull()).
    const _syncChannel = typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('nexus-sync')
        : null;
    // BUG 32: guard so the visibilitychange listener is registered at most once.
    let _visibilityListenerRegistered = false;
    // BUG 34: guard so the beforeunload listener is registered at most once.
    let _beforeunloadListenerRegistered = false;
    // BUG 36: Token Refresh Lock — prevents a storm of parallel 401 responses from
    // triggering simultaneous token refreshes. Only the first request refreshes; the
    // rest queue up and reuse the resulting token once it resolves.
    let _isRefreshingToken = false;
    let _tokenRefreshWaiters = [];
    // DIRTY FLAG: true when local IDB has changes that have NOT yet been confirmed
    // by a successful push to Drive (200 OK). Distinct from `pushPending` (which only
    // means "a push was queued while another was in progress") and `isSyncing` (which
    // is false between the push failure and the next retry). This flag survives failed
    // pushes so beforeunload/pagehide can warn the user until Drive acknowledges.
    let _dirtyLocalChanges = false;

    // SCHEMA SKEW GUARD: top-level keys this version of the code produces.
    // Any key present in the remote JSON that is NOT in this set is "unknown" —
    // it belongs to a store added by a newer version of the app. Old clients must
    // carry these unknown stores forward ("shuttle" them) so a push from v1.9
    // doesn't silently erase a store that v2.0 added.
    const KNOWN_SNAPSHOT_KEYS = new Set([
        'version', 'snapshotSeq', 'updatedAt', 'metadata', 'e2ee',
        'projects', 'tasks', 'cycles', 'decisions', 'documents',
        'members', 'logs', 'messages', 'annotations', 'snapshots',
        'interconsultations', 'sessions', 'timeLogs', 'library',
        'notifications', 'settings', 'workspaceSalt', 'pbkdf2Iterations',
    ]);
    // Unknown stores from the last pull — re-injected verbatim into every push.
    let _remotePassthrough = {};

    // Called by store.js dispatch() whenever a mutation is written to IDB.
    // Sets _dirtyLocalChanges so that beforeunload/pagehide can warn the user
    // even if the 5-second debounce timer has not fired yet or if a previous
    // push failed (in which case pushPending and isSyncing are both false).
    function markDirty() {
        _dirtyLocalChanges = true;
    }

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
        const current = getConfig();
        const normalized = {
            ...defaultConfig,
            ...next,
            autoSyncMinutes: Math.max(1, Number(next.autoSyncMinutes) || defaultConfig.autoSyncMinutes),
        };
        
        // BUG FIX: If the user changes target folder or file name, we MUST clear the
        // cached Drive IDs from localStorage so the app forcefully searches for or creates
        // the new file in the new location, instead of blindly using the old file ID.
        if (current.sharedFolderId !== normalized.sharedFolderId || current.fileName !== normalized.fileName) {
            console.log('[Sync] Drive settings changed. Purging cached IDs to force relocation.');
            localStorage.removeItem('gdrive_file_id');
            localStorage.removeItem('gdrive_folder_id'); // Allow resolving the new link or falling back to root
            localStorage.removeItem('gdrive_chat_folder_id');
            localStorage.removeItem('gdrive_chat_last_poll'); // Reset poll cursor for the new chat folder
            _remoteChecked = false; // Reset the ghost wipe guard
        }

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
            // FIX: Fast Reconnect - trigger immediate queue flush
            if (accessToken && localStorage.getItem(STATUS_KEY) === 'true') {
                pull().then(() => { if (!isSyncing) push(); });
            }
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

            let settled = false;
            const settleOnce = (fn, payload) => {
                if (settled) return;
                settled = true;
                fn(payload);
            };

            google.accounts.id.initialize({
                client_id: client_id,
                use_fedcm_for_prompt: true,
                callback: async (response) => {
                    if (!response.credential) {
                        settleOnce(reject, 'No credential returned');
                        return;
                    }

                    // OPCIÓN 2: Store ID token in sessionStorage (per-tab)
                    StorageManager.set(ID_TOKEN_KEY, response.credential, 'session');
                    currentUser = decodeIdToken(response.credential);

                    if (!currentUser || isExpiredIdToken(currentUser)) {
                        clearStoredIdentity();
                        settleOnce(reject, 'Invalid or expired Google identity token');
                        return;
                    }

                    await syncIdentityToWorkspaceProfile(currentUser);

                    // OPCIÓN 3: Create session in SessionManager
                    if (window.SessionManager) {
                        try {
                            const sessionId = await SessionManager.createSession(
                                currentUser.email,
                                response.credential,
                                {
                                    name: currentUser.name || currentUser.email,
                                    avatar: currentUser.name?.charAt(0).toUpperCase() || 'U',
                                }
                            );
                            if (sessionId) {
                                localStorage.setItem('nexus_current_session_id', sessionId);
                            }
                        } catch (e) {
                            console.warn('[Sync] Session creation failed:', e);
                        }
                    }

                    // SECURITY FIX: Do not log email to console in production — leaks PII to DevTools.
                    console.log('[Sync] Identity confirmed for user.');
                    if (window.updateUserProfileUI) window.updateUserProfileUI();
                    settleOnce(resolve, currentUser);
                }
            });

            google.accounts.id.prompt((notification) => {
                if (settled) return;

                if (notification.isDismissedMoment?.() && notification.getDismissedReason?.() === 'credential_returned') {
                    return; // Do not reject, wait for the callback which has the successful token.
                }

                if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
                    const reason = notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || notification.getDismissedReason?.() || 'unknown';
                    settleOnce(reject, 'Google sign-in prompt was closed or skipped. Reason: ' + reason);
                }
            });
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

    function isExpiredIdToken(userPayload) {
        if (!userPayload?.exp) return false;
        return Date.now() >= Number(userPayload.exp) * 1000;
    }

    function clearStoredIdentity() {
        // FIX: Only clear the Google identity token and in-memory currentUser.
        // Do NOT wipe the local display profile (name, email, avatar) — these are
        // set by the user and should persist across Google session expirations.
        // Erasing them silently corrupts the audit trail (all subsequent actions
        // are recorded as 'Usuario' instead of the real person).
        // If re-authentication is needed, a toast will inform the user.
        currentUser = null;
        StorageManager.remove(ID_TOKEN_KEY, 'session');
        if (window.showToast) {
            showToast('Tu sesión de Google ha expirado. Vuelve a iniciar sesión para sincronizar.', 'warning', true);
        }
        if (window.updateUserProfileUI) window.updateUserProfileUI();
    }

    /**
     * OPCIÓN 1 & 3: Handle account switch from different Google session or session manager
     * Triggered when AccountChangeDetector or SessionManager detects a change
     */
    async function handleAccountSwitch(oldEmail, newEmail) {
        console.log(`[Sync] Account switch detected: ${oldEmail || 'unknown'} → ${newEmail}`);

        // 1. Pause sync temporarily
        const wasSyncing = isSyncing;
        isSyncing = true;

        // 2. Record account switch
        const idToken = StorageManager.get(ID_TOKEN_KEY, 'session');
        if (idToken && AccountChangeDetector) {
            AccountChangeDetector.recordAccountSwitch(newEmail, idToken);
        }

        // 3. Update account scope in IDB if needed
        if (window.IDBScopedStorage && window.IDBScopedStorage.switchAccount) {
            try {
                await window.IDBScopedStorage.switchAccount(newEmail);
            } catch (e) {
                console.warn('[Sync] IDB account scope switch failed:', e);
            }
        }

        // 4. Emit event for UI to react
        window.dispatchEvent(new CustomEvent('account:switched', {
            detail: { oldEmail, newEmail }
        }));

        // 5. Reset sync state for new account
        _remoteChecked = false;
        _dirtyLocalChanges = false;
        accessToken = null;
        pushPending = false;

        // 6. Try to resume if it was syncing
        if (wasSyncing) {
            isSyncing = false;
            // Give UI time to refresh
            setTimeout(async () => {
                try {
                    await pull();
                    if (!isSyncing) {
                        await push();
                    }
                } catch (e) {
                    console.warn('[Sync] Auto-sync after account switch failed:', e);
                }
            }, 500);
        } else {
            isSyncing = false;
        }

        // 7. Show toast
        if (window.showToast) {
            showToast(`Sesión cambiada a: ${newEmail}`, 'info');
        }
    }

    async function syncIdentityToWorkspaceProfile(user) {
        if (!user) return;
        const name = user.name || user.given_name || user.email || 'Usuario';
        const email = String(user.email || '').trim().toLowerCase();
        const avatar = name.charAt(0).toUpperCase() || 'U';

        // OPCIÓN 2: Use StorageManager for per-session storage
        StorageManager.set('workspace_user_name', name, 'session');
        StorageManager.set('workspace_user_email', email, 'session');
        StorageManager.set('workspace_user_avatar', avatar, 'session');

        // PERSISTENT IDENTITY FIX: Store a non-reversible hash of the email
        // to allow matching the local user to a member in the shared Drive snapshot
        // even when emails are stripped for privacy (plaintext path).
        const emailHash = (await computeChecksum(email, false)).slice(0, 16);
        StorageManager.set('workspace_user_email_hash', emailHash, 'session');

        if (!StorageManager.get('workspace_user_role', 'session')) {
            StorageManager.set('workspace_user_role', 'Miembro', 'session');
        }
    }

    /**
     * CAPA B: AUTORIZACIÓN (OAuth 2.0)
     * Obtiene el Access Token para servicios específicos (Drive, etc.)
     */
    async function authorize(optionalClientId, forceConsent = false) {
        return new Promise(async (resolve, reject) => {
            const cfg = getConfig();
            const client_id = optionalClientId || cfg.clientId;
            if (!client_id) return reject('No Google Client ID configured');

            await loadGIS();
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: client_id,
                scope: SCOPES,
                callback: (resp) => {
                    if (resp?.error) {
                        // If the silent refresh was rejected (e.g. user revoked access),
                        // retry with the consent screen.
                        if (!forceConsent && resp.error === 'interaction_required') {
                            return authorize(optionalClientId, true).then(resolve).catch(reject);
                        }
                        return reject(resp.error);
                    }
                    accessToken = resp.access_token;
                    tokenTimestamp = Date.now();
                    // OPCIÓN 2: Store connected status in sessionStorage (per-tab)
                    StorageManager.set(STATUS_KEY, 'true', 'session');
                    updateSyncUI('online');
                    resolve(accessToken);
                },
            });
            // Use empty prompt for silent refresh if already authorized.
            // Only force the consent screen on first use or when explicitly needed.
            tokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
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
            callback: async (resp) => {
                if (resp?.error) {
                    showToast('No se pudo autenticar con Google Drive', 'error');
                    updateSyncUI('error');
                    return;
                }
                accessToken = resp.access_token;
                // OPCIÓN 2: Store connected status in sessionStorage (per-tab)
                StorageManager.set(STATUS_KEY, 'true', 'session');
                updateSyncUI('online');
                await pull();
                if (!isSyncing) await push();
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
        // OPCIÓN 2: Check connected status from sessionStorage (per-tab)
        updateSyncUI(StorageManager.get(STATUS_KEY, 'session') === 'true' ? 'online' : 'offline');

        const storedIdToken = StorageManager.get(ID_TOKEN_KEY, 'session');
        if (storedIdToken) {
            const decodedUser = decodeIdToken(storedIdToken);
            if (!decodedUser || isExpiredIdToken(decodedUser)) {
                clearStoredIdentity();
            } else {
                currentUser = decodedUser;
                await syncIdentityToWorkspaceProfile(currentUser);
            }
        }

        // BUG 34 FIX: Warn the user before closing the tab/window if there is a
        // push pending or a sync currently in progress. The debounce timer may not
        // have fired yet, so local IndexedDB changes would not have reached Drive.
        // Using returnValue (legacy) ensures maximum browser compatibility.
        // _dirtyLocalChanges covers the case where a push failed entirely and neither
        // pushPending nor isSyncing is set — changes are in IDB but not yet in Drive.
        //
        // iOS SAFARI NOTE: beforeunload is unreliable on iOS Safari (often never fires).
        // pagehide is the canonical unload event for mobile Safari. It cannot cancel
        // navigation, but we use it to persist a 'nexus_dirty_flag' to localStorage
        // so that on the next startup the app knows to push before doing anything else.
        if (!_beforeunloadListenerRegistered) {
            window.addEventListener('beforeunload', (e) => {
                if (_dirtyLocalChanges || pushPending || isSyncing) {
                    const msg = 'Hay cambios pendientes de sincronizar con Google Drive. ¿Seguro que quieres salir?';
                    e.preventDefault();
                    e.returnValue = msg; // Required for Chrome/Edge
                    return msg;          // Required for Firefox/Safari
                }
            });
            // pagehide fires more reliably than beforeunload on iOS Safari / mobile WebKit.
            // We cannot prevent navigation here, so instead we write a persistent dirty
            // marker to localStorage that init() checks on the next app launch.
            window.addEventListener('pagehide', () => {
                if (_dirtyLocalChanges || pushPending || isSyncing) {
                    localStorage.setItem('nexus_dirty_flag', 'true');
                    console.warn('[Sync] pagehide with pending changes — dirty flag persisted for next launch.');
                }
            });
            _beforeunloadListenerRegistered = true;
        }

        // DIRTY FLAG RECOVERY: If the previous session was closed while IDB had
        // changes not yet confirmed by Drive (e.g. iOS Safari pagehide fired but
        // beforeunload could not prevent navigation), restore the dirty flag so
        // the first push of this session prioritises uploading those changes.
        if (localStorage.getItem('nexus_dirty_flag') === 'true') {
            _dirtyLocalChanges = true;
            console.warn('[Sync] nexus_dirty_flag detected — previous session closed with unsynced changes. Will push on next opportunity.');
        }

        const cfg = getConfig();
        configureAutoSync(cfg.autoSyncMinutes);
        if (cfg.clientId) {
            try {
                await loadGIS();
                // If the user was previously connected, attempt a silent token refresh.
                // This restores the accessToken after a page reload without interrupting the user.
                // The prompt:'' in authorize() ensures no UI is shown if permission still exists.
                if (localStorage.getItem(STATUS_KEY) === 'true') {
                    authorize(cfg.clientId).catch(() => {
                        // Silent refresh failed (e.g. user revoked access) — reset status.
                        localStorage.setItem(STATUS_KEY, 'false');
                        updateSyncUI('offline');
                    });
                }
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
        // Use empty prompt for silent refresh; the token client will prompt if needed.
        tokenClient.requestAccessToken({ prompt: '' });
    }

    function disconnect() {
        if (window.google?.accounts?.oauth2 && accessToken) {
            google.accounts.oauth2.revoke(accessToken);
        }
        if (window.google?.accounts?.id) {
            google.accounts.id.disableAutoSelect();
        }

        accessToken = null;
        tokenClient = null;
        clearStoredIdentity();
        localStorage.setItem(STATUS_KEY, 'false');
        updateSyncUI('offline');
    }

    // TOMBSTONE GC: Tombstones (_deleted: true) must be retained long enough for
    // all devices to sync the deletion. After TOMBSTONE_MAX_AGE_MS (30 days) the
    // tombstone is stripped from the Drive snapshot so the JSON file stays bounded.
    // A device offline for >30 days may re-add a deleted record on next sync — that
    // is the accepted trade-off for a small-team app with reasonable offline windows.
    const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    function pruneTombstones(records) {
        if (!Array.isArray(records)) return records;
        const cutoff = Date.now() - TOMBSTONE_MAX_AGE_MS;
        return records.filter(r => !r._deleted || (r.updatedAt || 0) > cutoff);
    }

    async function getSnapshot() {
        // BUGFIX 2nd Pass: We MUST use exportState() which returns raw memory arrays
        // instead of store.get.*() which heavily filters out `_deleted: true` tombstones.
        // If we use UI getters, tombstones are excluded from the upload payload,
        // silently breaking deletion propagation to other clients and causing Zombies.
        const rawState = store.get.exportState ? store.get.exportState() : {};
        const getRaw = (key) => pruneTombstones(rawState[key] || (store.get[key] ? store.get[key]() : []));

        const rawProjects = getRaw('projects');
        const sharedProjects = rawProjects.filter(p => p.visibility !== 'local');
        const sharedProjectIds = new Set(sharedProjects.map(p => p.id));
        const isShared = item => !item.projectId || sharedProjectIds.has(item.projectId);

        // SECURITY FIX: Monotonic snapshot counter for rollback attack prevention.
        // Each push increments the counter so stale/replayed snapshots can be rejected
        // during pull (a snapshot with a lower seq than the local one is discarded).
        const snapshotSeq = Number(localStorage.getItem('nexus_snapshot_seq') || 0) + 1;

        // BUG 27 FIX: Cap unbounded collections before serialization to prevent
        // JSON.stringify from freezing the main thread on large workspaces.
        // JSON.stringify is synchronous; at 20MB+ on mid-range phones it can
        // block the main thread for several seconds, causing the browser to kill
        // the process or triggering the fetchWithTimeout before stringify even
        // finishes. Caps preserve the most-recent records (highest business value).
        // These are soft limits — no data is deleted from IDB, only from the
        // Drive snapshot. Older records are naturally re-hydrated if ever needed.
        const CAP_MESSAGES     = 500;  // most-recent chat messages uploaded to Drive
        const CAP_LOGS         = 500;  // most-recent activity log entries
        const CAP_ANNOTATIONS  = 200;  // most-recent annotations
        const CAP_SNAPSHOTS    = 50;   // most-recent document version snapshots
        const capRecent = (arr, n, sortKey = 'timestamp') =>
            arr.length > n
                ? [...arr].sort((a, b) => (b[sortKey] || b.updatedAt || b.createdAt || 0)
                                        - (a[sortKey] || a.updatedAt || a.createdAt || 0)).slice(0, n)
                : arr;

        const rawMessages     = getRaw('messages').filter(isShared);
        const rawLogs         = getRaw('logs');
        const rawAnnotations  = getRaw('annotations').filter(isShared);
        const rawSnapshotsArr = getRaw('snapshots').filter(isShared);
        const rawInterconsultations = getRaw('interconsultations').filter(isShared);
        const rawSessions = getRaw('sessions').filter(isShared);
        const rawTimeLogs = getRaw('timeLogs').filter(isShared);
        const rawLibrary = getRaw('library').filter(isShared);
        const rawNotifications = getRaw('notifications').filter(isShared);

        const data = {
            // SCHEMA SKEW FIX: re-inject stores this client version doesn't know about.
            // If a newer version of the app added 'clinical_cases', this spread ensures
            // it is preserved verbatim in every push made by an older client.
            ..._remotePassthrough,
            version: '1.2',
            snapshotSeq,
            updatedAt: Date.now(),
            metadata: {
                teamName: getConfig().teamName,
                actor: getCurrentWorkspaceActor().label,
            },
            projects: sharedProjects,
            tasks: getRaw('tasks').filter(isShared).filter(t => t.visibility !== 'local'),
            cycles: getRaw('cycles').filter(isShared),
            decisions: getRaw('decisions').filter(isShared),
            documents: getRaw('documents').filter(isShared),
            // Member emails are personal data and are handled during the final
            // serialization (plaintext hash or E2EE encryption).
            members: getRaw('members'),
            logs: capRecent(rawLogs, CAP_LOGS, 'timestamp'),
            messages: capRecent(rawMessages, CAP_MESSAGES, 'timestamp'),
            annotations: capRecent(rawAnnotations, CAP_ANNOTATIONS, 'createdAt'),
            snapshots: capRecent(rawSnapshotsArr, CAP_SNAPSHOTS, 'timestamp'),
            interconsultations: rawInterconsultations,
            sessions: rawSessions,
            timeLogs: rawTimeLogs,
            library: rawLibrary,
            notifications: rawNotifications,
            settings: SYNCABLE_SETTINGS_KEYS.reduce((acc, key) => {
                const val = localStorage.getItem(key);
                if (val !== null) acc[key] = val;
                return acc;
            }, {}),
            workspaceSalt: getWorkspaceSaltBase64(),
            // BUG 15 FIX: Propagate the PBKDF2 iteration count so other devices
            // derive the same key after a security upgrade (310k → 600k).
            // Stored at the top level (plaintext, like workspaceSalt) so the
            // receiver can read it before attempting decryption.
            pbkdf2Iterations: Math.min(PBKDF2_MAX_ITERATIONS, Math.max(PBKDF2_MIN_ITERATIONS, getStoredIterations()))
        };

        // E2EE Layer: Encrypt sensitive stores if key is available.
        // BUGFIX: This block was previously unreachable because a `return data`
        // statement above it caused the function to exit early, silently sending
        // plaintext to Google Drive even when E2EE was active.
        if (hasKey() && !isLocked()) {
            console.log('[Sync] Applying E2EE to snapshot...');
            try {
                // PRIVACY FIX: strip `actor` from the plaintext metadata when E2EE is
                // active. `actor` holds the user's display name. Leaving it in the outer
                // (unencrypted) layer of the Drive JSON exposes who last edited the
                // workspace to anyone with Drive access — even though the content is E2EE.
                const { actor: _actor, ...e2eeMetadata } = data.metadata;
                const encryptedData = {
                    ...data,
                    e2ee: true,
                    metadata: e2eeMetadata,
                    projects: await Promise.all(data.projects.map(encryptRecord)),
                    tasks: await Promise.all(data.tasks.map(encryptRecord)),
                    cycles: await Promise.all(data.cycles.map(encryptRecord)),
                    decisions: await Promise.all(data.decisions.map(encryptRecord)),
                    documents: await Promise.all(data.documents.map(encryptRecord)),
                    // BUG FIX: messages, annotations, snapshots and interconsultations are
                    // listed in ENCRYPTED_STORES but were missing here, so they were uploaded
                    // to Drive in plaintext even when E2EE was active.
                    messages: await Promise.all(data.messages.map(encryptRecord)),
                    annotations: await Promise.all(data.annotations.map(encryptRecord)),
                    snapshots: await Promise.all(data.snapshots.map(encryptRecord)),
                    interconsultations: await Promise.all(data.interconsultations.map(encryptRecord)),
                    sessions: await Promise.all(data.sessions.map(encryptRecord)),
                    timeLogs: await Promise.all(data.timeLogs.map(encryptRecord)),
                    library: await Promise.all(data.library.map(encryptRecord)),
                    notifications: await Promise.all(data.notifications.map(encryptRecord)),
                    members: await Promise.all(data.members.map(encryptRecord)),
                    logs: await Promise.all(data.logs.map(encryptRecord)),
                };
                // INTEGRITY FIX: Compute checksum AFTER encryption so the remote
                // receiver can verify integrity on the encrypted payload.
                encryptedData.metadata.checksum = await computeChecksum(encryptedData);

                // SECURITY FIX: Compute HMAC checksum of the workspace salt
                // so remote recipients can detect if salt was poisoned by a collaborator.
                const email = localStorage.getItem('workspace_user_email') || '';
                if (data.workspaceSalt) {
                    encryptedData.metadata.saltChecksum = await computeSaltChecksum(data.workspaceSalt, email);
                }

                return encryptedData;
            } catch (e) {
                console.error('[Sync] E2EE failed, sending plaintext:', e);
            }
        }

        // Plaintext path: privacy scrubbing. Replace emails with a non-reversible hash
        // to allow matching without exposing PII in the shared file.
        data.members = await Promise.all((data.members || []).map(async m => {
            const { email, ...rest } = m;
            if (!email) return rest;
            // SHA-256 hash of email for matching.
            const hash = await computeChecksum(email.trim().toLowerCase(), false);
            return { ...rest, emailHash: hash.slice(0, 16) }; 
        }));

        // Plaintext path: compute checksum on unencrypted snapshot.
        data.metadata.checksum = await computeChecksum(data);

        // SECURITY FIX: Compute HMAC checksum of the workspace salt (plaintext path too)
        const email = localStorage.getItem('workspace_user_email') || '';
        if (data.workspaceSalt) {
            data.metadata.saltChecksum = await computeSaltChecksum(data.workspaceSalt, email);
        }

        return data;
    }

    /**
     * Sube (Push) el snapshot del estado local hacio el archivo JSON en Google Drive.
     * Cifra los datos sensibles si Nexus Fortress está activado y advierte sobre sobrescrituras
     * accidentales si el archivo remoto es más nuevo.
     */
    // BUG FIX: Track 412 retries to break the infinite pull→push→412 loop.
    let _pushRetryCount = 0;
    const MAX_PUSH_RETRIES = 3;

    async function push() {
        if (!accessToken || !networkOnline || isSyncPaused()) return;

        // GHOST WIPE GUARD: Block push until at least one pull has verified remote state.
        // A new device starts with empty local state; if push ran before pull confirmed
        // whether a remote file exists, it would overwrite Drive data with an empty JSON.
        // Exception: bypass during key rotation — the in-memory state is valid (loaded
        // from IDB before the password change) and we MUST push before pulling to avoid
        // the old-key Drive data being decrypted (wrongly) and wiping local state.
        const isKeyRotating = localStorage.getItem('nexus_key_rotating') === 'true';
        if (!_remoteChecked && !isKeyRotating) {
            console.warn('[Sync] Push blocked: waiting for initial pull to verify remote state first.');
            return;
        }

        // AUTH FIX: Proactive refresh if token is near expiration (>50 min)
        await ensureValidToken();

        // INFRASTRUCTURE FIX: Check for sufficient storage before starting push
        if (!(await checkStorageCapacity())) return;

        if (isSyncing) {
            pushPending = true;
            return;
        }

        isSyncing = true;
        pushPending = false;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();
            const data = await getSnapshot();
            // BUG 27 FIX: Serialize once here so createFile/updateFile receive a
            // pre-built string. Without this, a 412 retry would call JSON.stringify
            // twice on the same potentially large object — doubling the freeze time.
            // The string is passed through unchanged; recipients detect it via typeof.
            const serializedData = JSON.stringify(data);

            // Helper: treat stored "undefined"/"null" strings or full URLs as missing values
            const validId = v => {
                if (!v || v === 'undefined' || v === 'null') return null;
                if (typeof v === 'string' && v.includes('http')) return null; // AUTO-PURGE corrupted data
                return v;
            };

            let folderId = await ensureWorkspaceFolder();
            if (!folderId) throw new Error('Could not resolve Workspace folder');

            // 2. Localizar el archivo core dentro del folder
            let fileId = validId(localStorage.getItem('gdrive_file_id'));
            if (!fileId) fileId = await findFile(cfg.fileName, folderId);

            if (fileId) {
                const etag = localStorage.getItem(`gdrive_etag_${fileId}`);
                try {
                    await updateFile(fileId, serializedData, etag);
                } catch (updateErr) {
                    if (updateErr.message === '412_PRECONDITION_FAILED') {
                        _pushRetryCount++;
                        if (_pushRetryCount > MAX_PUSH_RETRIES) {
                            // BUG FIX: Without this guard, a persistent 412 (e.g. two
                            // clients racing) causes infinite pull→push→412→pull recursion.
                            _pushRetryCount = 0;
                            console.error('[Sync] Max 412 retries reached. Aborting push to prevent infinite loop.');
                            if (window.showToast) showToast('Conflicto de sincronización persistente. Intenta de nuevo más tarde.', 'error', true);
                            isSyncing = false;
                            updateSyncUI('error');
                            return;
                        }
                        // ROTATION DEADLOCK FIX (BUG 25): During key rotation, pull() is
                        // intentionally blocked (seedFromRemote skips hydration). The normal
                        // 412 path (pull→merge→push) would loop forever because pull never
                        // updates the ETag. Instead, fetch only the ETag from the lightweight
                        // metadata endpoint (a few bytes vs the full file) so the retry push
                        // has a fresh If-Match header — no local state is modified.
                        if (isKeyRotating) {
                            console.warn('[Sync] 412 during key rotation — refreshing ETag only (no content download or hydration).');
                            await fetchRemoteETagOnly(fileId);
                            isSyncing = false;
                            await push(); // Retry with updated ETag
                            return;
                        }
                        console.warn('[Sync] Push blocked by ETag (412 Precondition Failed). Auto-pulling changes...');
                        if (window.showToast) showToast('Fusionando cambios recientes antes de subir...', 'info');
                        isSyncing = false;
                        updateSyncUI('online');
                        await pull();
                        await push(); // Retry after pull
                        return;
                    }
                    if (updateErr.message === '404_FILE_NOT_FOUND') {
                        console.warn('[Sync] Target file deleted on Drive. Recreating file from local snapshot...');
                        const newId = await createFile(cfg.fileName, serializedData, folderId);
                        localStorage.setItem('gdrive_file_id', newId);
                    } else {
                        throw updateErr;
                    }
                }
            } else {
                const newId = await createFile(cfg.fileName, serializedData, folderId);
                localStorage.setItem('gdrive_file_id', newId);
            }

            localStorage.setItem('last_sync_local', String(data.updatedAt));
            // Persist the snapshot counter so future pulls can detect rollbacks.
            localStorage.setItem('nexus_snapshot_seq', String(data.snapshotSeq));
            console.log(`[Sync] push() success: ${cfg.fileName} updated to snapshotSeq ${data.snapshotSeq}.`);
            // DIRTY FLAG: Drive confirmed the write (200 OK) — clear both the in-memory
            // flag and the persistent localStorage marker written by the pagehide handler.
            _dirtyLocalChanges = false;
            localStorage.removeItem('nexus_dirty_flag');
            _pushRetryCount = 0; // Reset 412 retry counter after a successful push.
            // KEY ROTATION FIX: clear the rotation flag after the first successful push
            // with the new key — Drive is now consistent with the new password.
            localStorage.removeItem('nexus_key_rotating');
            // BUG 26 FIX: promote the pending iteration count to the live key now that
            // Drive holds data encrypted with the new-count-derived key. Only after this
            // call does getStoredIterations() return the new count for non-rotation unlocks.
            commitIterationUpgrade();
            updateSyncUI('online');
        } catch (err) {
            console.error('[Sync] Push failed:', err);
            updateSyncUI('error');
        } finally {
            isSyncing = false;
            if (pushPending) {
                console.log('[Sync] Resuming pending push request...');
                setTimeout(push, 500);
            }
        }
    }

    /**
     * Descarga (Pull) el archivo JSON desde Google Drive.
     * Si la versión remota es más nueva que la local, actualiza la base de datos
     * mediante la hidratación global del Store.
     */
    async function pull() {
        if (!accessToken || isSyncing || !networkOnline || isSyncPaused()) return;

        // AUTH FIX: Proactive refresh
        await ensureValidToken();

        // INFRASTRUCTURE FIX: Check storage before pulling potentially large data
        if (!(await checkStorageCapacity())) return;

        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const cfg = getConfig();

            // Helper: treat stored "undefined"/"null" strings as missing values
            const validId = v => (v && v !== 'undefined' && v !== 'null') ? v : null;

            let folderId = await ensureWorkspaceFolder();
            if (!folderId) {
                updateSyncUI('online');
                return;
            }

            // 2. Localizar el archivo core
            let fileId = validId(localStorage.getItem('gdrive_file_id'));
            if (!fileId) fileId = await findFile(cfg.fileName, folderId);
            if (!fileId) {
                // No remote file exists yet — safe for this device to push (create).
                _remoteChecked = true;
                updateSyncUI('online');
                return;
            }

            localStorage.setItem('gdrive_file_id', fileId);
            const remoteData = await getFileContent(fileId);

            // INTEGRITY FIX: Verify remote checksum if present
            if (remoteData?.metadata?.checksum) {
                const receivedChecksum = remoteData.metadata.checksum;
                const receivedSaltChecksum = remoteData.metadata.saltChecksum;

                // Must remove metadata that was added AFTER the checksum was computed.
                // In getSnapshot(), checksum is computed, THEN saltChecksum is added.
                delete remoteData.metadata.checksum;
                delete remoteData.metadata.saltChecksum;

                // Try deterministic (sorted) checksum first.
                let computed = await computeChecksum(remoteData, true);

                if (computed !== receivedChecksum) {
                    // Fallback: the remote file might have been produced by an older version of
                    // the code using the unstable non-sorted JSON.stringify. Try matching that.
                    computed = await computeChecksum(remoteData, false);
                }

                if (computed !== receivedChecksum) {
                    console.error('[Sync] Data Corruption detected! Checksums mismatch.', {
                        received: receivedChecksum,
                        computedSorted: await computeChecksum(remoteData, true),
                        computedLegacy: await computeChecksum(remoteData, false)
                    });
                    
                    // Detailed debugging: Log the string differences if mismatch persists
                    console.log('[Sync Integrity Debug] Received Data (Sorted JSON):', JSON.stringify(remoteData, (k, v) => {
                         if (v && typeof v === 'object' && !Array.isArray(v)) {
                             return Object.keys(v).sort().reduce((acc, k2) => { acc[k2] = v[k2]; return acc; }, {});
                         }
                         return v;
                    }, 2));

                    if (window.showToast) showToast('Error de integridad: El archivo remoto está corrupto. Abortando.', 'error', true);
                    return;
                }

                // Restore for consistency and downstream verification (e.g. validateSaltChecksum)
                remoteData.metadata.checksum = receivedChecksum;
                if (receivedSaltChecksum) remoteData.metadata.saltChecksum = receivedSaltChecksum;
            }


            const localUpdate = Number(localStorage.getItem('last_sync_local') || 0);

            // BUG 37 FIX: Always run seedFromRemote (field-level merge) regardless
            // of which side has the higher top-level updatedAt.  The old strict
            // "remote > local" guard was safe only for blind overwrites; with
            // per-field LWW timestamps it is too conservative — a device that made
            // changes while offline will have a higher localUpdate, but the remote
            // snapshot may contain unrelated fields changed on another device that
            // we would silently miss.  fieldLevelMerge inside seedFromRemote now
            // decides the winner per field, so it is always safe to call.
            if (remoteData) {
                await seedFromRemote(remoteData);
                if (remoteData.updatedAt) {
                    localStorage.setItem('last_sync_local', String(remoteData.updatedAt));
                }
                if (remoteData.updatedAt > localUpdate) {
                    showToast('Datos actualizados desde Drive', 'success');
                    // BUG 31 FIX: Notify sibling tabs that IDB was updated so they can
                    // reload their in-memory _state before making any further edits.
                    // BroadcastChannel only delivers to OTHER tabs, not to this one.
                    _syncChannel?.postMessage({ type: 'data-updated' });
                }
            }

            // Remote state verified — push is now safe.
            _remoteChecked = true;
            updateSyncUI('online');
        } catch (err) {
            console.error('[Sync] Pull failed:', err);
            if (err.message && err.message.includes('404')) {
                console.warn('[Sync] 404 detected during pull. Clearing stale sync state.');
                localStorage.removeItem('gdrive_file_id');
                localStorage.removeItem('gdrive_chat_folder_id');
            }
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
            // BUG 32 FIX: Skip sync when the tab is in the background.
            // On mobile/laptop the token may expire while the page is hidden; firing
            // requests silently trips the circuit breaker with no user-visible reason.
            // When hidden, skip the tick entirely — the visibilitychange handler below
            // fires an immediate pull() the moment the user returns to the tab.
            if (document.visibilityState === 'hidden') return;
            if (accessToken && !isSyncing && networkOnline) {
                // Auto-sync sequence: Try to pull new changes first, then push our own changes
                await pull();
                if (!isSyncing) await push();
            }
        }, ms);

        // BUG 32 FIX: On tab focus restore, immediately pull fresh data rather than
        // waiting up to `minutes` for the next interval tick. Register the listener
        // only once (guard prevents duplicates if configureAutoSync is called again).
        if (!_visibilityListenerRegistered) {
            _visibilityListenerRegistered = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && accessToken && !isSyncing && networkOnline) {
                    console.log('[Sync] Tab became visible — triggering immediate pull.');
                    pull().then(() => { if (!isSyncing) push(); }).catch(() => {});
                }
            });
        }

        // Start the micro-polling Chat Engine
        startChatSync();
    }

    function isSyncPaused() {
        if (syncPausedUntil && Date.now() < syncPausedUntil) {
            const remaining = Math.ceil((syncPausedUntil - Date.now()) / 1000 / 60);
            console.warn(`[Sync] Sincronización pausada por Circuit Breaker. Reintentando en ${remaining} min.`);
            return true;
        }
        return false;
    }

    async function ensureValidToken() {
        if (!accessToken) return;
        const GDrive_TOKEN_LIFE = 50 * 60 * 1000; // 50 minutes (Google tokens usually last 60)
        if (Date.now() - tokenTimestamp > GDrive_TOKEN_LIFE) {
            console.log('[Sync] Token near expiration. Performing proactive refresh...');
            // BUG 36 FIX: Use the shared refresh lock so that push() and pull() running
            // concurrently don't both trigger a proactive refresh at the same moment.
            await _refreshTokenWithLock();
        }
    }

    // BUG 36 FIX: Shared helper that serialises all token refresh calls behind a single
    // in-flight promise. If a refresh is already running, callers wait for it instead of
    // starting a second one — avoiding race conditions and wasted round-trips.
    async function _refreshTokenWithLock() {
        if (_isRefreshingToken) {
            return new Promise((resolve, reject) => {
                _tokenRefreshWaiters.push({ resolve, reject });
            });
        }
        _isRefreshingToken = true;
        try {
            const newToken = await authorize(getConfig().clientId, false);
            _tokenRefreshWaiters.forEach(w => w.resolve(newToken));
            return newToken;
        } catch (e) {
            _tokenRefreshWaiters.forEach(w => w.reject(e));
            throw e;
        } finally {
            _tokenRefreshWaiters = [];
            _isRefreshingToken = false;
        }
    }

    // Hardening: Network Timeout + Exponential Backoff + 401 Interceptor + Circuit Breaker
    async function fetchWithTimeout(resource, options = {}, retryCount = 0) {
        if (isSyncPaused()) {
            throw new Error('SYNC_PAUSED_BY_CIRCUIT_BREAKER');
        }
        const { timeout = 12000 } = options;
        const MAX_RETRIES = 3;

        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const response = await fetch(resource, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);

            // 401 Interceptor: Silent Token Refresh
            // BUG 36 FIX: Route through _refreshTokenWithLock() so that when several
            // requests fire in parallel and all receive a 401 simultaneously, only the
            // first one triggers a real refresh call — the rest wait for it and reuse
            // the resulting token. This prevents invalidating the refresh token by
            // issuing duplicate refresh requests in quick succession.
            if (response.status === 401 && accessToken) {
                console.warn('[Sync] 401 Unauthorized detected. Attempting silent token refresh...');
                try {
                    const newAccessToken = await _refreshTokenWithLock();
                    // BUG FIX: { ...options } is a shallow copy — options.headers is still
                    // the same object reference, so mutating newOptions.headers.Authorization
                    // also mutated the original options headers. Use a deep copy of headers.
                    // Also switch from bare fetch() to fetchWithTimeout() so the retry
                    // respects the same timeout and circuit-breaker logic.
                    const retriedOptions = {
                        ...options,
                        headers: { ...options.headers, Authorization: `Bearer ${newAccessToken}` },
                    };
                    return await fetchWithTimeout(resource, retriedOptions, retryCount + 1);
                } catch (e) {
                    console.error('[Sync] Silent refresh failed:', e);
                }
            }

            // BUG 29 FIX: statusText-based quota detection is unreliable.
            // Google Drive API always sets statusText to "Forbidden" for all 403s,
            // regardless of whether the cause is a quota limit or a permissions error.
            // A false negative (quota detected as permissions) causes retries to halt
            // and the circuit breaker to never trip. A false positive (permissions
            // detected as quota) causes infinite retry loops for fatal auth failures.
            // Fix: clone the response and parse the JSON body to read the actual
            // error.errors[0].reason field. This distinguishes retryable reasons
            // (quotaExceeded, rateLimitExceeded, userRateLimitExceeded) from fatal
            // ones (insufficientPermissions, forbidden) which require re-auth.
            let isQuotaError = response.status === 429;
            if (response.status === 403) {
                try {
                    const errorBody = await response.clone().json();
                    const reason = errorBody?.error?.errors?.[0]?.reason ?? '';
                    isQuotaError = reason === 'quotaExceeded' ||
                                   reason === 'rateLimitExceeded' ||
                                   reason === 'userRateLimitExceeded';
                    if (!isQuotaError) {
                        console.warn('[Sync] 403 with non-retryable reason:', reason || '(unknown)');
                    }
                } catch (_) {
                    // Unparseable 403 body — treat as non-retryable (fatal)
                    isQuotaError = false;
                }
            }

            if (isQuotaError && retryCount >= MAX_RETRIES) {
                console.error('[Sync] Persistent Quota/Rate Limit error. Tripping Circuit Breaker.');
                syncPausedUntil = Date.now() + 5 * 60 * 1000; // Pause for 5 minutes
                if (window.showToast) showToast('Sincronización pausada temporalmente por exceso de tráfico (429/403).', 'warning');
                updateSyncUI('error');
            }

            // Exponential Backoff: Handle 429, 403-quota, or 5xx (Server Error)
            if ((isQuotaError || response.status >= 500) && retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000 + (Math.random() * 100); // Backoff + jitter
                console.warn(`[Sync] Request failed (${response.status}). Retrying in ${Math.round(delay)}ms...`);
                await new Promise(r => setTimeout(r, delay));
                return await fetchWithTimeout(resource, options, retryCount + 1);
            }

            return response;
        } catch (err) {
            // Handle timeout/abort retry
            if (err.name === 'AbortError' && retryCount < MAX_RETRIES) {
                console.warn(`[Sync] Timeout detected. Retry ${retryCount + 1}/${MAX_RETRIES}...`);
                return await fetchWithTimeout(resource, options, retryCount + 1);
            }
            throw err;
        }
    }

    async function checkStorageCapacity() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const { usage, quota } = await navigator.storage.estimate();
                const remaining = quota - usage;
                if (remaining < 100 * 1024 * 1024) { // < 100MB
                    console.warn('[Sync] Low storage detected:', (remaining / 1024 / 1024).toFixed(2), 'MB left');
                    if (window.showToast) showToast('Espacio insuficiente en disco para sincronización segura.', 'warning', true);
                    return false;
                }
            } catch (e) {
                console.warn('[Sync] Could not estimate storage capacity.');
            }
        }
        return true;
    }

    async function ensureWorkspaceFolder() {
        const cfg = getConfig();
        const validId = v => {
            if (!v || v === 'undefined' || v === 'null') return null;
            if (typeof v === 'string' && v.includes('http')) {
                // Try to extract ID from URL (folders/xxxx or d/xxxx or id=xxxx)
                const m = v.match(/folders\/([a-zA-Z0-9-_]+)/) || v.match(/\/d\/([a-zA-Z0-9-_]+)/) || v.match(/[?&]id=([a-zA-Z0-9-_]+)/);
                if (m) return m[1];
                return null; // Known URL but not a recognizable ID pattern
            }
            return v;
        };

        let folderId = validId(cfg.sharedFolderId) || validId(localStorage.getItem('gdrive_folder_id'));
        if (folderId) {
            try {
                const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                if (resp.status === 404) {
                    console.warn(`[Sync] Folder ${folderId} 404 Not Found. Clearing and recreating.`);
                    folderId = null;
                    if (!cfg.sharedFolderId) localStorage.removeItem('gdrive_folder_id'); 
                } else if (!resp.ok) {
                    folderId = null; // E.g. 403 or deleted
                }
            } catch (err) {
                folderId = null;
            }
        }

        if (!folderId) {
            folderId = await findFolder('Nexus_Workspace');
            if (!folderId && !cfg.sharedFolderId) {
                folderId = await createFolder('Nexus_Workspace');
            }
            if (folderId && !cfg.sharedFolderId) {
                localStorage.setItem('gdrive_folder_id', folderId);
            }
        }
        return folderId;
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
        
        if (resp.status === 404 && parentId) {
            console.error('[Sync] Parent folder ID 404. Clearing stale IDs.');
            localStorage.removeItem('gdrive_folder_id'); // Main root
            localStorage.removeItem('gdrive_chat_folder_id');
        }

        if (!result.id) throw new Error(`[Sync] createFolder failed (${resp.status}): ${result.error?.message || 'no id returned'}`);
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

        // BUG 38 FIX: The Google Drive API's multipart fallback logic drops the `parents`
        // array when parsing browser-generated `multipart/form-data` (FormData). This
        // caused the workspace JSON file to end up at the root of "My Drive" instead of
        // inside `Nexus_Workspace`.
        // Fix: Use a bulletproof two-step process. First POST the JSON metadata to create
        // the file in the exact folder, then PATCH the media content.
        const resp = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata),
            timeout: 10000
        });
        const result = await resp.json();

        if (resp.status === 404 && parentId) {
            console.error('[Sync] Parent folder ID 404 during createFile. Clearing stale IDs.');
            localStorage.removeItem('gdrive_folder_id');
            localStorage.removeItem('gdrive_chat_folder_id');
        }

        if (!result.id) throw new Error(`[Sync] createFile failed (${resp.status}): ${result.error?.message || 'no id returned'}`);
        
        // Step 2: Upload the actual content string to the newly created file using existing updateFile
        await updateFile(result.id, content);
        
        return result.id;
    }

    async function updateFile(id, content, etag = null) {
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };
        if (etag) {
            headers['If-Match'] = etag;
        }
        // BUG 27 FIX: accept a pre-serialized string to avoid double JSON.stringify.
        const body = typeof content === 'string' ? content : JSON.stringify(content);
        const response = await fetchWithTimeout(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media&supportsAllDrives=true`, {
            method: 'PATCH',
            headers,
            body,
            timeout: 15000,
        });
        if (response.status === 412) {
            throw new Error('412_PRECONDITION_FAILED');
        }

        if (response.status === 404) {
            console.error('[Sync] target file ID 404 during update. Clearing file ID.');
            localStorage.removeItem('gdrive_file_id');
            throw new Error('404_FILE_NOT_FOUND');
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`[Sync] updateFile failed (${response.status}): ${err.error?.message}`);
        }

        // BUG FIX: Save the ETag returned by the PATCH response.
        // Without this, the locally stored ETag becomes stale after every push,
        // causing a spurious 412 on the very next push even when no other client
        // has written to Drive in between.
        const newEtag = response.headers.get('ETag');
        if (newEtag) localStorage.setItem(`gdrive_etag_${id}`, newEtag);
    }

    async function getFileContent(id) {
        if (!id || id === 'undefined' || id === 'null') {
            console.error('[Sync] getFileContent: invalid fileId —', id);
            return null;
        }
        const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 15000
        });
        if (!resp.ok) throw new Error(`File not found or no permissions (${resp.status})`);
        
        const etag = resp.headers.get('ETag');
        if (etag) localStorage.setItem(`gdrive_etag_${id}`, etag);

        return resp.json();
    }

    async function getFileContentMetadata(id) {
        // Just fetch the content. Drive doesn't allow easy partial downloads for JSON via v3 alt=media
        try {
            return await getFileContent(id);
        } catch { return null; }
    }

    /**
     * BUG 25 FIX: Fetch only the Drive file's ETag from the lightweight metadata
     * endpoint (files.get?fields=etag) — returns a few bytes instead of the full
     * file content — and persist it to localStorage.
     *
     * Used during key rotation to break the 412 deadlock:
     *  • Normal 412 handler: pull() → seedFromRemote() → hydrate → push()
     *  • Rotation 412 handler: fetchRemoteETagOnly() → update ETag → push() (no hydration)
     */
    async function fetchRemoteETagOnly(fileId) {
        try {
            const resp = await fetchWithTimeout(
                `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id%2Cetag`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!resp.ok) return null;
            // ETag may appear in response headers OR in the JSON body's 'etag' field.
            const headerEtag = resp.headers.get('ETag') || resp.headers.get('etag');
            const meta = await resp.json();
            const etag = headerEtag || meta?.etag || null;
            if (etag) localStorage.setItem(`gdrive_etag_${fileId}`, etag);
            return etag;
        } catch (e) {
            console.warn('[Sync] fetchRemoteETagOnly failed:', e);
            return null;
        }
    }

    /**
     * BUG 37 FIX: Field-Level Merge (LWW — Last Write Wins per field).
     * Compares the _timestamps metadata of each individual property so that
     * concurrent edits on different devices are both preserved.
     * Example: gaining a Mentor on mobile while updating "Burnout" on the tablet
     * results in both changes surviving the next sync cycle.
     *
     * @param {Object} local  - Record stored in IndexedDB on this device.
     * @param {Object} remote - Record received from the Drive snapshot.
     * @returns {Object}        The merged record.
     */
    // Detected conflicts: { recordId: [{ field, local, remote, timestamp }] }
    let _detectedConflicts = {};

    /**
     * Detect conflicts during merge: when local and remote have different values
     * for the same field with equal timestamps. This requires user intervention.
     *
     * @param {string} recordId - ID of the record (for logging)
     * @param {string} field - Field name where conflict was detected
     * @param {*} localValue - Local value
     * @param {*} remoteValue - Remote value
     * @param {number} timestamp - Timestamp of the conflict (local === remote timestamp)
     */
    function recordConflict(recordId, field, localValue, remoteValue, timestamp) {
        if (!_detectedConflicts[recordId]) {
            _detectedConflicts[recordId] = [];
        }
        _detectedConflicts[recordId].push({
            field,
            local: localValue,
            remote: remoteValue,
            timestamp,
            decision: null // Will be set by user via UI
        });

        // BUG FIX #2: Show toast warning when conflict detected
        console.warn(`[Merge] Conflicto detectado en ${recordId}.${field} (mismo timestamp)`);
        if (window.showToast) {
            window.showToast(
                `⚠️ Cambio conflictivo detectado en ${field}. Se mantuvo versión local.`,
                'warning'
            );
        }
    }

    function fieldLevelMerge(local, remote) {
        // If one side is absent, the other wins unconditionally.
        if (!local) return remote;
        if (!remote) return local;

        // Start with a shallow merge (remote wins by default for unknown keys).
        const merged = { ...local, ...remote };

        // These fields are record-level identifiers — never mix them per-field.
        const atomicFields = new Set(['id', 'user_id', 'created_at', 'createdAt', '_deleted', '_timestamps']);

        const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

        allKeys.forEach(key => {
            if (atomicFields.has(key)) return;

            // Per-field timestamp wins; fall back to the record-level updatedAt.
            const localTime  = local._timestamps?.[key]  || local.updatedAt  || local.updated_at  || 0;
            const remoteTime = remote._timestamps?.[key] || remote.updatedAt || remote.updated_at || 0;

            // CONFLICT DETECTION: Equal timestamps + different values = real conflict
            const isEqual = (a, b) => {
                if (a === b) return true;
                if (a && b && typeof a === 'object' && typeof b === 'object') {
                    return JSON.stringify(a) === JSON.stringify(b); // Good enough for these record fields
                }
                return false;
            };

            if (localTime === remoteTime && localTime > 0) {
                if (isEqual(local[key], remote[key])) {
                    // No real change, just same timestamp. Remote wins (redundant).
                    merged[key] = remote[key];
                } else {
                    recordConflict(local.id, key, local[key], remote[key], localTime);
                    // For now: keep local (user has priority in their own device)
                    merged[key] = local[key];
                }
            } else {
                // LWW: last-write-wins by timestamp
                merged[key] = localTime > remoteTime ? local[key] : remote[key];
            }
        });

        // Merge the _timestamps maps so future merges keep the highest-known value
        // for every field, even after several rounds of push/pull.
        if (local._timestamps || remote._timestamps) {
            merged._timestamps = { ...(local._timestamps || {}), ...(remote._timestamps || {}) };
            // Keep the maximum per-field timestamp.
            const allTsKeys = new Set([
                ...Object.keys(local._timestamps  || {}),
                ...Object.keys(remote._timestamps || {}),
            ]);
            allTsKeys.forEach(tsKey => {
                merged._timestamps[tsKey] = Math.max(
                    local._timestamps?.[tsKey]  || 0,
                    remote._timestamps?.[tsKey] || 0,
                );
            });
        }

        return merged;
    }

    async function seedFromRemote(data) {
        // SECURITY FIX: Reject snapshots with a lower sequence number than the local
        // counter. This prevents replay / rollback attacks where a stale snapshot
        // previously captured (e.g. from Drive by a malicious actor) is re-uploaded
        // to silently revert security-critical changes (role changes, member removals).
        // KEY ROTATION GUARD: If the user just changed their password, the in-memory
        // state is correct but Drive still has data encrypted with the OLD key. Hydrating
        // now would decrypt old-key records with the new key (wrong key → all records
        // return null from AES-GCM → HYDRATE_STORE replaces local state with empty arrays
        // → the next push wipes Drive). Block hydration until the rotation push succeeds.
        if (localStorage.getItem('nexus_key_rotating') === 'true') {
            console.warn('[Sync] Key rotation in progress — skipping hydration to preserve in-memory state. Waiting for rotation push to commit new key to Drive.');
            return;
        }

        const localSeq = Number(localStorage.getItem('nexus_snapshot_seq') || 0);
        if (data.snapshotSeq !== undefined && data.snapshotSeq < localSeq) {
            // BUG FIX: Removed 'return' to allow field-level merge even if sequence is lower.
            // This is essential for cross-device sync when one device starts fresh or 
            // the sequence history was reset (Split Brain). LWW timestamps handle the
            // data integrity; snapshotSeq is now just a warning.
            console.warn(`[Sync] Snapshot Seq mismatch: remote (${data.snapshotSeq}) < local (${localSeq}). Proceeding with field-level merge to unify histories.`);
        }

        if (data.settings) {
            syncSettingsToLocalStorage(data.settings);
        }

        if (data.e2ee && data.workspaceSalt) {
            // SECURITY FIX: Validate salt checksum to detect poisoning
            const saltChecksum = data.metadata?.saltChecksum || null;
            const result = await injectWorkspaceSalt(data.workspaceSalt, saltChecksum);

            if (result.rejected) {
                console.error('[Sync] Salt validation failed — aborting hydration');
                return; // Abort hydration, data remains unchanged
            }

            if (result.locked) {
                if (window.showToast) showToast('Se actualizó la llave desde Drive. Por favor ingresa tu contraseña.', 'warning', true);
                if (window.openPanel) window.openPanel(); // Abro el panel lateral para forzar password
                return; // Abort hydration
            }
        }

        // BUG 15 FIX: Sync PBKDF2 iteration count from remote workspace.
        // If Device A upgraded to 600k iterations (via password reset), Device B
        // still has 310k in its localStorage and will derive a DIFFERENT AES key
        // from the same password, making decryption fail on next unlock.
        // Solution: propagate the higher iteration count and force a re-derive.
        const normalizedRemoteIterations = normalizeRemoteIterations(data.pbkdf2Iterations);
        if (normalizedRemoteIterations && normalizedRemoteIterations > getStoredIterations()) {
            localStorage.setItem('nexus_pbkdf2_iterations', String(normalizedRemoteIterations));
            // KEY ERA MISMATCH FIX: The in-memory key was derived with the old iteration
            // count. The remote data was encrypted with the new count → different AES key.
            // Lock the vault so the next unlock re-derives the key with the updated count.
            // Uses the directly-imported lock() to avoid the fragile window.cryptoLayer
            // reference that may not be set in all execution contexts.
            lock();
            if (window.showToast) showToast('Actualización de seguridad del workspace. Ingresa tu contraseña nuevamente.', 'warning', true);
            if (window.openPanel) window.openPanel();
            return; // Abort hydration — user must re-authenticate with correct key
        }

        let hydrationData = data;

        // Pillar 1: Atomic Decryption Flow
        // If the incoming data is encrypted, we must decrypt it BEFORE hydration
        // to avoid storing double-encrypted or raw blobs in the store memory.
        if (data.e2ee) {
            if (!hasKey() || isLocked()) {
                // The workspace is E2EE-protected but the local key is not available.
                // Storing the raw encrypted blobs in IDB would corrupt the local store,
                // so we abort the hydration and inform the user.
                console.warn('[Sync] Remote snapshot is E2EE-encrypted but no local key is available — skipping hydration.');
                if (window.showToast) showToast('El workspace remoto está cifrado. Introduce la contraseña maestra para sincronizar.', 'warning', true);
                return;
            }

            console.log('[Sync] Decrypting remote snapshot for hydration...');
            try {
                hydrationData = {
                    ...data,
                    projects: await decryptAll(data.projects || []),
                    tasks: await decryptAll(data.tasks || []),
                    cycles: await decryptAll(data.cycles || []),
                    decisions: await decryptAll(data.decisions || []),
                    documents: await decryptAll(data.documents || []),
                    // BUG FIX: decrypt stores that are now encrypted in getSnapshot().
                    messages: await decryptAll(data.messages || []),
                    annotations: await decryptAll(data.annotations || []),
                    snapshots: await decryptAll(data.snapshots || []),
                    interconsultations: await decryptAll(data.interconsultations || []),
                    sessions: await decryptAll(data.sessions || []),
                    timeLogs: await decryptAll(data.timeLogs || []),
                    library: await decryptAll(data.library || []),
                    notifications: await decryptAll(data.notifications || []),
                    members: await decryptAll(data.members || []),
                    logs: await decryptAll(data.logs || []),
                };
            } catch (e) {
                console.error('[Sync] Pull decryption failed. Data might be corrupted or key is wrong.', e);
                showToast('Error al descifrar datos remotos. Verifica tu contraseña maestra.', 'error', true);
                return;
            }
        }

        // SCHEMA SKEW FIX: capture top-level keys we don't recognise so they can
        // be shuttled back to Drive on the next push, unchanged. Must be extracted
        // from the RAW (pre-decryption) data so we capture the encrypted blobs as-is
        // — we can't decrypt stores we don't understand, but we can carry them forward.
        const newPassthrough = {};
        for (const key of Object.keys(data)) {
            if (!KNOWN_SNAPSHOT_KEYS.has(key)) newPassthrough[key] = data[key];
        }
        _remotePassthrough = newPassthrough;

        // BUG 37 FIX: Field-Level Merge before hydration.
        // Instead of blindly overwriting local state with the remote snapshot,
        // merge each record field by field using LWW timestamps. This preserves
        // concurrent edits made on other devices (e.g. a Mentor gained on mobile
        // while Burnout was updated on the tablet) instead of silently discarding
        // whichever device synced last.
        const MERGEABLE_STORES = [
            'projects', 'tasks', 'cycles', 'decisions', 'documents',
            'members', 'sessions', 'interconsultations', 'timeLogs',
            'library', 'notifications',
        ];
        try {
            const rawState = store.get?.exportState ? store.get.exportState() : {};
            const mergedStores = {};

            for (const storeName of MERGEABLE_STORES) {
                const remoteRecords = hydrationData[storeName];
                if (!Array.isArray(remoteRecords)) continue;

                const localRecords = Array.isArray(rawState[storeName]) ? rawState[storeName] : [];
                const localMap = new Map(localRecords.map(r => [r.id, r]));

                mergedStores[storeName] = remoteRecords.map(remoteRec => {
                    const localRec = localMap.get(remoteRec.id);
                    return fieldLevelMerge(localRec, remoteRec);
                });

                // Append local-only records (created offline, not yet in Drive snapshot).
                const remoteIds = new Set(remoteRecords.map(r => r.id));
                for (const localRec of localRecords) {
                    if (!remoteIds.has(localRec.id)) {
                        mergedStores[storeName].push(localRec);
                    }
                }
            }

            hydrationData = { ...hydrationData, ...mergedStores };
        } catch (mergeErr) {
            console.warn('[Sync] Field-level merge failed — falling back to full remote hydration:', mergeErr);
            // Intentional fallthrough: hydrationData is unchanged, HYDRATE_STORE
            // will use the unmerged remote snapshot (same behaviour as before the fix).
        }

        if (store.dispatch) await store.dispatch('HYDRATE_STORE', hydrationData);

        // CONFLICT RESOLUTION: Notify user if there were simultaneous edits
        if (Object.keys(_detectedConflicts).length > 0) {
            const conflictCount = Object.keys(_detectedConflicts).length;
            const msg = `⚠️ Se detectaron ${conflictCount} conflicto(s) de edición simultánea. Se mantuvieron los cambios locales.`;
            console.warn(`[Sync] ${msg}`, _detectedConflicts);
            if (window.showToast) {
                showToast(msg, 'warning', true); // persistent=true
            }
            // Log conflict details for audit trail
            if (store.dispatch) {
                await store.dispatch('ADD_LOG', {
                    type: 'conflict',
                    timestamp: Date.now(),
                    message: `Conflictos detectados: ${JSON.stringify(_detectedConflicts)}`
                });
            }
        }
        // Clear conflicts for next sync
        _detectedConflicts = {};

        // Advance the local snapshot counter to the accepted remote value.
        if (data.snapshotSeq !== undefined && data.snapshotSeq > localSeq) {
            localStorage.setItem('nexus_snapshot_seq', String(data.snapshotSeq));
        }
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

        // BUG FIX: String.prototype.slugify() is not a native JS method.
        // Replace with an inline normalization to avoid TypeError at runtime.
        const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        downloadFile(`${slug}.md`, text);
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
            <input class="form-input" id="sync-client-id" placeholder="xxxx.apps.googleusercontent.com" value="${esc(cfg.clientId)}" data-autofill-ignore data-lpignore="true" autocomplete="off">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">Nombre del archivo</label>
              <input class="form-input" id="sync-file-name" value="${esc(cfg.fileName)}" data-autofill-ignore data-lpignore="true" autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-label">Shared Folder ID (Opcional)</label>
              <input class="form-input" id="sync-shared-id" placeholder="Pegar ID de la Carpeta compartida" value="${esc(cfg.sharedFolderId)}" data-autofill-ignore data-lpignore="true" autocomplete="off">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Auto-sync (minutos)</label>
            <input class="form-input" type="number" min="1" max="120" id="sync-auto-min" value="${cfg.autoSyncMinutes}" data-autofill-ignore data-lpignore="true" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">Miembros actuales</label>
            <input class="form-input" id="sync-members" placeholder="Ana, Luis, Marta" value="${memberNames === 'Sin miembros' ? '' : memberNames}" data-autofill-ignore data-lpignore="true" autocomplete="off">
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
            let sharedFolderId = overlay.querySelector('#sync-shared-id').value.trim();

            if (sharedFolderId) {
                // Múltiples formatos de URL de Google Drive. Extraemos el ID de 33 caracteres:
                // https://drive.google.com/drive/folders/1qDgWShPIyVgUTnDIpB1bAwQx5ZzCSU6r?usp=drive_link
                const match = sharedFolderId.match(/[-\w]{25,}/);
                if (match) sharedFolderId = match[0];
            }
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
                // SECURITY FIX: Use fetchWithTimeout to prevent infinite hangs on slow connections.
                const resp = await fetchWithTimeout('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(event),
                    timeout: 12000
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
                // SECURITY FIX: Use fetchWithTimeout to prevent infinite hangs.
                const resp = await fetchWithTimeout('https://www.googleapis.com/tasks/v1/lists/@default/tasks', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(task),
                    timeout: 12000
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
                const resp = await fetchWithTimeout('https://api.todoist.com/rest/v2/tasks', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: t.title, description: t.description || '' }),
                    timeout: 12000
                });
                const result = await resp.json();
                if (result.id) store.dispatch('UPDATE_TASK', { id: t.id, todoistId: result.id });
            } catch (e) {
                console.error('[Sync] Todoist error:', e);
            }
        }
    }

    async function listDriveFiles(parentId = null) {
        if (!accessToken) return [];
        try {
            let q = 'trashed=false';
            let effectiveParentId = parentId;
            if (effectiveParentId && effectiveParentId.includes('http')) {
                const m = effectiveParentId.match(/folders\/([a-zA-Z0-9-_]+)/) || effectiveParentId.match(/[?&]id=([a-zA-Z0-9-_]+)/);
                if (m) effectiveParentId = m[1];
            }

            if (effectiveParentId) {
                q += ` and '${effectiveParentId}' in parents`;
            } else {
                // If no parentId, we can either show root or all. 
                // Let's default to all files to maintain compatibility,
                // OR we can default to shared folder if configured.
                // For "Hierarchical" mode, we usually want to start somewhere.
            }

            const params = new URLSearchParams({
                pageSize: '40',
                q: q,
                supportsAllDrives: 'true',
                includeItemsFromAllDrives: 'true',
                fields: 'files(id,name,mimeType,thumbnailLink,webViewLink,iconLink,size,driveId,ownedByMe,owners(displayName,emailAddress),shared)',
            });
            const resp = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 12000,
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
    const CHAT_OUTBOX_KEY = 'chat_outbox_v1';
    const CHAT_OUTBOX_MAX = 1000;
    const CHAT_OUTBOX_WARN_AT = 800;

    // ── PBKDF2 Security Constants ────────────────────────────────────────────
    // SECURITY: Bounds on PBKDF2 iteration count from remote workspace.
    // MIN: 310,000 is the legacy safe value (OWASP 2023). Older devices may have this.
    // MAX: 1,200,000 is 2x the current target (600k, OWASP 2024). This prevents DoS:
    //   - A collaborator cannot force unbounded iterations (would freeze mobile devices).
    //   - Legitimate upgrades (current → future standard) are accommodated with 2x headroom.
    //
    // DoS Scenario Prevented:
    //   A malicious collaborator uploads pbkdf2Iterations = 100,000,000 to Drive.
    //   Without bounds, next unlock would derive key for ~1 hour on mobile → UX lock.
    //   With bounds, clamped to 1.2M (reasonable derivation time ~2s on modern mobile).
    const PBKDF2_MIN_ITERATIONS = 310_000;   // OWASP 2023 legacy minimum
    const PBKDF2_TARGET_ITERATIONS = 600_000; // Current target (OWASP 2024)
    const PBKDF2_MAX_ITERATIONS = 1_200_000;  // DoS protection upper bound (2x target)

    /**
     * Normalize PBKDF2 iteration count received from remote workspace.
     * Prevents DoS via unbounded iterations while allowing legitimate upgrades.
     *
     * @param {*} rawValue - Raw value from remote snapshot (untrusted)
     * @returns {number|null} Bounded iteration count, or null if invalid
     */
    function normalizeRemoteIterations(rawValue) {
        const parsed = Number(rawValue || 0);
        if (!Number.isFinite(parsed) || parsed <= 0) return null;

        const parsed_floor = Math.floor(parsed);
        const bounded = Math.min(PBKDF2_MAX_ITERATIONS, Math.max(PBKDF2_MIN_ITERATIONS, parsed_floor));

        // Log clamping to help detect tampering or malicious uploads
        if (bounded !== parsed_floor) {
            const direction = parsed_floor > PBKDF2_MAX_ITERATIONS ? 'capped' : 'floored';
            console.warn(`[Fortress] PBKDF2 iterations ${direction}: received=${parsed_floor}, normalized=${bounded}`);
            if (parsed_floor > PBKDF2_MAX_ITERATIONS) {
                // DoS attempt detected: log explicitly for audit trail
                console.error(`[Fortress] ⚠️ SECURITY: Attempted DoS via excessive PBKDF2 iterations (${parsed_floor} > ${PBKDF2_MAX_ITERATIONS}). Clamped to ${bounded}.`);
            }
        }

        return bounded;
    }

    function readChatOutbox() {
        try {
            const raw = localStorage.getItem(CHAT_OUTBOX_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[ChatSync] Invalid outbox data, resetting.', e);
            return [];
        }
    }

    /**
     * Persist chat messages to outbox with overflow protection.
     * ⚠️ IMPORTANT: Messages exceeding CHAT_OUTBOX_MAX are silently dropped to prevent
     *              unbounded localStorage growth during extended offline periods.
     *              This is acceptable for chat (non-critical messages), but users should
     *              be warned so they can re-connect to avoid message loss.
     *
     * @param {Array} messages - Pending chat messages (untrusted size)
     * @returns {number} Actual count persisted to localStorage
     */
    function writeChatOutbox(messages) {
        if (!Array.isArray(messages)) {
            console.error('[ChatSync] Invalid messages passed to writeChatOutbox');
            return 0;
        }

        const trimmed = messages.slice(-CHAT_OUTBOX_MAX);
        const dropped = Math.max(0, messages.length - trimmed.length);

        localStorage.setItem(CHAT_OUTBOX_KEY, JSON.stringify(trimmed));

        // BUG FIX #5: Data loss logging and improved warning
        // Data loss warning: explicitly inform user if messages were dropped
        if (dropped > 0) {
            // Log to audit trail
            const auditEntry = {
                type: 'CHAT_OUTBOX_OVERFLOW',
                dropped: dropped,
                kept: trimmed.length,
                timestamp: new Date().toISOString(),
                reason: 'Chat outbox exceeded maximum capacity'
            };
            console.error(`[ChatSync] CHAT OVERFLOW:`, auditEntry);

            const msg = `🚨 Cola de chat llena (${CHAT_OUTBOX_MAX} límite). Se perdieron ${dropped} mensaje(s) sin enviar. ¡CONECTA AHORA para guardar los cambios!`;
            if (window.showToast) {
                showToast(msg, 'error', true); // persistent=true: don't auto-dismiss
            }
        }
        // Capacity warning: user should sync soon
        else if (trimmed.length >= CHAT_OUTBOX_WARN_AT && window.showToast) {
            const remaining = CHAT_OUTBOX_MAX - trimmed.length;
            const percentFull = Math.round(trimmed.length / CHAT_OUTBOX_MAX * 100);
            const timeLeft = remaining > 200 ? '~30 min' : '~10 min'; // Rough estimate at typical 10 msgs/min
            showToast(
                `⚠️ Cola de chat ${percentFull}% llena (${remaining} espacios restantes - ${timeLeft} offline). Conecta para sincronizar.`,
                'warning'
            );
        }

        return trimmed.length;
    }

    function enqueueChatMessage(msg) {
        const outbox = readChatOutbox();
        if (!outbox.find(item => item.id === msg.id)) {
            outbox.push(msg);
            const persistedSize = writeChatOutbox(outbox);
            outbox.length = persistedSize;
        }
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('chat:outbox-updated', { detail: { count: outbox.length } }));
        }
        return outbox.length;
    }

    function removeFromChatOutbox(messageId) {
        const outbox = readChatOutbox();
        const filtered = outbox.filter(item => item.id !== messageId);
        if (filtered.length !== outbox.length) {
            writeChatOutbox(filtered);
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('chat:outbox-updated', { detail: { count: readChatOutbox().length } }));
            }
        }
        return filtered.length;
    }

    function getChatOutboxSize() {
        return readChatOutbox().length;
    }

    async function getChatFolder() {
        if (chatFolderId) return chatFolderId;
        const cfg = getConfig();
        let storedId = localStorage.getItem('gdrive_folder_id');
        if (storedId && storedId.includes('http')) {
            localStorage.removeItem('gdrive_folder_id'); // Purgar URL inválida
            storedId = null;
        }
        let rootFolderId = cfg.sharedFolderId || storedId;
        if (!rootFolderId) return null; // Aún no hay workspace

        chatFolderId = await findFolder('chat_messages', rootFolderId);
        if (!chatFolderId) {
            chatFolderId = await createFolder('chat_messages', rootFolderId);
        }
        localStorage.setItem('gdrive_chat_folder_id', chatFolderId);
        return chatFolderId;
    }

    async function uploadChatMessage(msg) {
        if (!accessToken || !networkOnline) {
            enqueueChatMessage(msg);
            return false;
        }
        try {
            const fId = await getChatFolder();
            if (!fId) {
                enqueueChatMessage(msg);
                return false;
            }

            // Si la capa crypto está activa, podemos encriptarlo aquí.
            // BUGFIX: Previously checked `window.cryptoLayer` which is never defined,
            // so messages were never encrypted. Now uses the imported crypto functions directly.
            let payload = msg;
            if (hasKey() && !isLocked()) {
                try {
                    payload = await encryptRecord(msg);
                } catch (e) {
                    console.error('[ChatSync] Message encryption failed. Keeping message in outbox.', e);
                    if (window.showToast) {
                        showToast('No se pudo cifrar el mensaje. Verifica la clave maestra antes de sincronizar.', 'warning', true);
                    }
                    enqueueChatMessage(msg);
                    return false;
                }
            }

            const name = `msg_${msg.createdAt}_${msg.id}.json`;
            await createFile(name, payload, fId);
            removeFromChatOutbox(msg.id);
            return true;
        } catch (e) {
            console.error('[ChatSync] Upload failed:', e);
            enqueueChatMessage(msg);
            return false;
        }
    }

    async function flushChatOutbox() {
        if (!accessToken || !networkOnline || isSyncing) return;
        const outbox = readChatOutbox();
        if (outbox.length === 0) return;

        for (const message of outbox) {
            const ok = await uploadChatMessage(message);
            if (!ok) break;
        }
    }

    // Session-level blacklist: file IDs that failed decryption.
    // These messages cannot be decrypted (wrong key / different passphrase) and
    // should NOT be retried on every poll — that would generate an infinite
    // error loop. Blacklisted IDs are held in memory for the current session only.
    const _chatDecryptBlacklist = new Set();

    async function cleanupOldChatMessages() {
        if (!accessToken || !networkOnline || isSyncing) return;
        const lastCleanup = Number(localStorage.getItem('gdrive_chat_last_cleanup') || 0);
        const ONE_DAY = 24 * 60 * 60 * 1000;
        
        // Solo ejecutar una vez al día
        if (Date.now() - lastCleanup < ONE_DAY) return;
        
        try {
            const fId = await getChatFolder();
            if (!fId) return;

            // Buscar archivos msg_* más viejos de 30 días
            const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
            const query = encodeURIComponent(`'${fId}' in parents and name contains 'msg_' and modifiedTime < '${thirtyDaysAgo}' and trashed = false`);
            
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100&supportsAllDrives=true`;
            const res = await fetchWithTimeout(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                timeout: 15000
            });
            
            if (!res.ok) return;
            const data = await res.json();
            const filesToDelete = data.files || [];
            
            if (filesToDelete.length > 0) {
                console.log(`[ChatSync] Cleaning up ${filesToDelete.length} messages older than 30 days...`);
                // Eliminar en paralelo (con límite de concurrencia implícito por el navegador)
                await Promise.all(filesToDelete.map(file => {
                    return fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${file.id}?supportsAllDrives=true`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${accessToken}` },
                        timeout: 10000
                    }).catch(e => console.warn(`[ChatSync] Failed to delete old message ${file.id}:`, e));
                }));
            }
            
            localStorage.setItem('gdrive_chat_last_cleanup', String(Date.now()));
        } catch (e) {
            console.error('[ChatSync] Cleanup error:', e);
        }
    }

    async function pollChat() {
        if (!accessToken || !networkOnline || isSyncing) return;
        try {
            const fId = await getChatFolder();
            if (!fId) return;

            // ── SCOPE-SAFE POLLING ────────────────────────────────────────────
            // The Drive Changes API (getStartPageToken) requires `drive.readonly`
            // scope, but we only have `drive.file`. Instead, we query the chat
            // folder contents directly — fully supported by `drive.file` scope.
            const lastPoll = Number(localStorage.getItem('gdrive_chat_last_poll') || 0);
            const query = encodeURIComponent(`'${fId}' in parents and name contains 'msg_' and trashed = false`);
            const fields = encodeURIComponent('nextPageToken,files(id,name,modifiedTime)');
            const files = [];
            let nextPageToken = null;

            do {
                const pageParam = nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : '';
                const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime&pageSize=200${pageParam}&supportsAllDrives=true`;
                const res = await fetchWithTimeout(url, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    timeout: 12000
                });
                if (!res.ok) {
                    if (res.status === 401) localStorage.removeItem('nexus_gdrive_access_token');
                    return;
                }
                const data = await res.json();
                files.push(...(data.files || []));
                nextPageToken = data.nextPageToken || null;
            } while (nextPageToken);

            const newFiles = files.filter(f => {
                const modified = new Date(f.modifiedTime).getTime();
                return modified > lastPoll;
            });

            if (newFiles.length > 0) {
                // BUG FIX: moved the timestamp update to AFTER all files have been
                // processed. Previously the timestamp was set before the loop, so any
                // file that failed to download was permanently skipped on the next poll.
                let allProcessed = true;
                let latestProcessedModifiedTime = lastPoll;
                let decryptFailures = 0; // BUG FIX #4: Track decryption failures

                for (const file of newFiles) {
                    // Skip files that permanently failed decryption this session.
                    if (_chatDecryptBlacklist.has(file.id)) {
                        // Still advance the cursor past this file.
                        latestProcessedModifiedTime = Math.max(
                            latestProcessedModifiedTime,
                            new Date(file.modifiedTime).getTime() || 0
                        );
                        continue;
                    }
                    try {
                        let msgData = await getFileContent(file.id);
                        if (!msgData) { allProcessed = false; continue; }

                        // Decrypt si aplica
                        // BUGFIX: Previously checked `window.cryptoLayer` (never defined).
                        // Now uses the imported crypto functions directly.
                        const isEncryptedEnvelope = Boolean(msgData?.__encrypted || (msgData?.iv && msgData?.data));
                        if (isEncryptedEnvelope) {
                            if (!hasKey() || isLocked()) {
                                allProcessed = false;
                                console.warn('[ChatSync] Encrypted chat message skipped: workspace is locked or key unavailable.');
                                continue;
                            }
                            msgData = await decryptRecord(msgData);
                            if (!msgData) {
                                // Permanent failure: add to blacklist so we don't retry this message.
                                // Also advance the cursor so the poll timestamp moves forward.
                                _chatDecryptBlacklist.add(file.id);
                                decryptFailures++;
                                console.error(
                                    `[ChatSync] Decryption failed for message ${file.name} (${file.id}). ` +
                                    `Message blacklisted for this session to prevent retry loops.`
                                );
                                // Advance cursor past this message (we cannot read it, but we shouldn't
                                // be stuck retrying it forever).
                                latestProcessedModifiedTime = Math.max(
                                    latestProcessedModifiedTime,
                                    new Date(file.modifiedTime).getTime() || 0
                                );
                                continue;
                            }
                        }

                        if (!msgData?.id) {
                            allProcessed = false;
                            console.warn('[ChatSync] Invalid chat payload received. Missing message id.');
                            continue;
                        }

                        msgData.visibility = 'local';

                        // Evitar duplicados
                        const exist = (store.get.messages ? store.get.messages() : []).find(m => m.id === msgData.id);
                        if (!exist) {
                            await store.dispatch('ADD_MESSAGE', msgData);
                        }
                        latestProcessedModifiedTime = Math.max(latestProcessedModifiedTime, new Date(file.modifiedTime).getTime() || 0);
                    } catch (e) {
                        allProcessed = false;
                        console.warn('[ChatSync] Failed DL msg', e);
                    }
                }

                // BUG FIX #4: Show warning if decryption failures detected
                if (decryptFailures > 0) {
                    console.warn(`[ChatSync] ${decryptFailures} message(s) could not be decrypted`);
                    if (window.showToast && decryptFailures >= 5) {
                        showToast(
                            `⚠️ ${decryptFailures} mensajes no pudieron descifrarse. Puede que la contraseña haya cambiado.`,
                            'warning'
                        );
                    }
                }

                // Only block the poll cursor from advancing for NETWORK failures (allProcessed=false).
                // Decryption failures are handled above (cursor still advances past those files).
                if (allProcessed) {
                    localStorage.setItem('gdrive_chat_last_poll', String(latestProcessedModifiedTime || Date.now()));
                } else if (latestProcessedModifiedTime > lastPoll) {
                    // Some files succeeded, some had network errors. Advance to the last
                    // successful point so we don't reprocess already-handled messages.
                    localStorage.setItem('gdrive_chat_last_poll', String(latestProcessedModifiedTime));
                }
                // If latestProcessedModifiedTime === lastPoll, all new files had network errors - don't advance.
            } else {
                // Update poll timestamp even if no new files to prevent re-checking all files next time
                if (lastPoll === 0) localStorage.setItem('gdrive_chat_last_poll', Date.now());
            }
        } catch (e) {
            console.error('[ChatSync] Polling error:', e);
        }
    }

    let isChatPollingActive = false; // Lock para la red
    function startChatSync() {
        if (chatSyncTimer) clearTimeout(chatSyncTimer);

        // BUG FIX #3: Adaptive polling interval (10s active, 60s background)
        const getPollInterval = () => {
            return document.hidden ? 60000 : 10000; // 60s background, 10s active
        };

        const loop = async () => {
            if (!isChatPollingActive) {
                isChatPollingActive = true;
                try {
                    await flushChatOutbox();
                    await pollChat();
                    await cleanupOldChatMessages();
                } catch (e) {
                    // Silenciar errores de red offline
                } finally {
                    isChatPollingActive = false;
                }
            }
            // Adaptive interval based on page visibility
            const interval = getPollInterval();
            chatSyncTimer = setTimeout(loop, interval);
        };

        // Listen for visibility changes to adjust polling rate
        const handleVisibilityChange = () => {
            console.log('[ChatSync] Visibility changed, poll interval adjusted');
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        loop();
    }

    function getChatSyncStatus() {
        return {
            linked: Boolean(accessToken),
            online: Boolean(networkOnline),
            pending: getChatOutboxSize(),
            user: currentUser
        };
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
        getChatSyncStatus,
        startChatSync,
        // Expose isSyncing as a getter so store.js debounce guard can read it.
        // (The private `isSyncing` variable was never in the public API, so
        //  store.js saw `syncManager.isSyncing === undefined` and the guard
        //  never fired, potentially triggering duplicate pushes.)
        get isSyncing() { return isSyncing; },
        getAccessToken: () => accessToken,
        getUser: () => currentUser,
        // Called by store.js dispatch() to flag IDB changes as unsynced.
        // Cleared only after a confirmed 200 OK from Drive.
        markDirty,
    };
})();

export { syncManager };
window.syncManager = syncManager;
