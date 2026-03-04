/**
 * sync.js — Google Drive Synchronization Manager
 * Handles OAuth2 (GIS) and Drive API operations.
 */

const syncManager = (() => {
    let tokenClient;
    let accessToken = null;
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
    const SCOPES = 'https://www.googleapis.com/auth/drive.file';

    // Placeholder Client ID - User needs to provide their own for production
    const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

    let isSyncing = false;

    /**
     * Load GIS and GAPI scripts
     */
    async function init() {
        return new Promise((resolve) => {
            const gisScript = document.createElement('script');
            gisScript.src = 'https://accounts.google.com/gsi/client';
            gisScript.onload = () => {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: (resp) => {
                        if (resp.error) {
                            console.error('GIS Error:', resp);
                            showToast('Error de autenticación con Google', 'error');
                            return;
                        }
                        accessToken = resp.access_token;
                        localStorage.setItem('gdrive_token', accessToken);
                        localStorage.setItem('gdrive_connected', 'true');
                        updateSyncUI('online');
                        push(); // Initial push after login
                    },
                });
                resolve();
            };
            document.head.appendChild(gisScript);
        });
    }

    function authenticate() {
        if (!tokenClient) return;
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }

    function disconnect() {
        accessToken = null;
        localStorage.removeItem('gdrive_token');
        localStorage.setItem('gdrive_connected', 'false');
        updateSyncUI('offline');
    }

    /**
     * Push current store + syncQueue to Google Drive
     */
    async function push() {
        if (!accessToken || isSyncing) return;
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const data = {
                version: '1.0',
                updatedAt: Date.now(),
                projects: store.get.projects(),
                tasks: store.get.allTasks(),
                cycles: store.get.cycles(),
                decisions: store.get.decisions(),
                logs: store.get.logs ? store.get.logs() : []
            };

            // Search for existing file
            let fileId = localStorage.getItem('gdrive_file_id');
            if (!fileId) {
                fileId = await findFile('workspace-data.json');
            }

            if (fileId) {
                await updateFile(fileId, data);
            } else {
                const newId = await createFile('workspace-data.json', data);
                localStorage.setItem('gdrive_file_id', newId);
            }

            updateSyncUI('online');
            console.log('[Sync] Push successful');
        } catch (err) {
            console.error('[Sync] Push failed:', err);
            if (err.status === 401) {
                accessToken = null;
                updateSyncUI('error');
            }
        } finally {
            isSyncing = false;
        }
    }

    /**
     * Pull remote data and merge
     */
    async function pull() {
        if (!accessToken || isSyncing) return;
        isSyncing = true;
        updateSyncUI('syncing');

        try {
            const fileId = await findFile('workspace-data.json');
            if (!fileId) {
                updateSyncUI('online');
                return;
            }

            const remoteData = await getFileContent(fileId);
            // Simple merge: remote wins if newer
            const localUpdate = localStorage.getItem('last_sync_local') || 0;
            if (remoteData.updatedAt > localUpdate) {
                console.log('[Sync] Remote data is newer, merging...');
                // In a production app, we would perform complex merging.
                // For this MVP, we refresh local database with remote data.
                await seedFromRemote(remoteData);
                localStorage.setItem('last_sync_local', remoteData.updatedAt);
                showToast('Datos sincronizados desde la nube');
            }

            updateSyncUI('online');
        } catch (err) {
            console.error('[Sync] Pull failed:', err);
            updateSyncUI('error');
        } finally {
            isSyncing = false;
        }
    }

    // ── Drive API Helpers ─────────────────────────────────────────────────────

    async function findFile(name) {
        const q = `name='${name}' and trashed=false`;
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
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
            body: form
        });
        const result = await resp.json();
        return result.id;
    }

    async function updateFile(id, content) {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(content)
        });
    }

    async function getFileContent(id) {
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return await resp.json();
    }

    async function seedFromRemote(data) {
        if (store.dispatch) {
            await store.dispatch('HYDRATE_STORE', data);
        }
    }

    function updateSyncUI(status) {
        const btn = document.getElementById('btn-sync-toggle');
        const indicator = document.getElementById('sync-indicator');
        if (!btn || !indicator) return;

        indicator.classList.remove('status-online', 'status-offline', 'status-syncing', 'status-error');

        switch (status) {
            case 'online':
                indicator.classList.add('status-online');
                btn.title = 'Conectado a Google Drive';
                break;
            case 'syncing':
                indicator.classList.add('status-syncing');
                btn.title = 'Sincronizando...';
                break;
            case 'error':
                indicator.classList.add('status-error');
                btn.title = 'Error de sincronización';
                break;
            default:
                indicator.classList.add('status-offline');
                btn.title = 'Conectar Google Drive';
        }
    }

    return { init, authenticate, disconnect, push, pull };
})();

window.syncManager = syncManager;
