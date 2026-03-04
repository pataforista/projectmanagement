/**
 * api/zotero.js — Live synchronization with Zotero Web API v3
 */

const zoteroApi = (() => {
    const BASE_URL = 'https://api.zotero.org';

    function getCredentials() {
        return {
            userId: localStorage.getItem('zotero_user_id') || '',
            apiKey: localStorage.getItem('zotero_api_key') || ''
        };
    }

    function setCredentials(userId, apiKey) {
        localStorage.setItem('zotero_user_id', userId.trim());
        localStorage.setItem('zotero_api_key', apiKey.trim());
    }

    async function fetchItems() {
        const creds = getCredentials();
        if (!creds.userId || !creds.apiKey) {
            throw new Error("Faltan las credenciales de Zotero (User ID o API Key)");
        }

        // Fetch top-level items, returning full data and bib
        const url = `${BASE_URL}/users/${creds.userId}/items/top?v=3&format=json&include=data,bib&limit=100`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Zotero-API-Version': '3',
                'Zotero-API-Key': creds.apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Error de Zotero API: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return json;
    }

    function parseItemsToWorkspace(zoteroJson) {
        return zoteroJson.map(item => {
            const data = item.data;

            // Attempt to extract Author
            let authorStr = 'Autor desconocido';
            if (data.creators && data.creators.length > 0) {
                authorStr = data.creators.map(c => c.lastName ? `${c.lastName}, ${c.firstName || ''}` : c.name).join('; ');
            }

            // Link to local zotero if available, else web
            const uri = `zotero://select/items/${data.key}`;

            return {
                id: `zot-${data.key}`,
                title: data.title || 'Sin Título',
                author: authorStr,
                itemType: data.itemType,
                date: data.date || '',
                abstractNote: data.abstractNote || '',
                uri: uri,
                importedAt: Date.now()
            };
        });
    }

    async function syncLibrary() {
        try {
            showToast('Conectando a Zotero...', 'info');
            const rawData = await fetchItems();
            const libraryItems = parseItemsToWorkspace(rawData);

            // Clear old and insert new (simple sync strategy for now)
            store.dispatch('CLEAR_LIBRARY_AND_SYNC', libraryItems);
            showToast(`¡Sincronización exitosa! ${libraryItems.length} referencias cargadas.`, 'success');
            return true;
        } catch (err) {
            console.error(err);
            showToast(err.message, 'error');
            return false;
        }
    }

    return {
        getCredentials,
        setCredentials,
        syncLibrary
    };
})();

window.zoteroApi = zoteroApi;
