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

            // Build cite key: FirstAuthorLastname + Year
            const firstCreator = data.creators && data.creators[0];
            const lastName = firstCreator ? (firstCreator.lastName || firstCreator.name || 'anon') : 'anon';
            const year = data.date ? String(data.date).match(/\d{4}/) : null;
            const citeKey = `${lastName.toLowerCase().replace(/\s+/g, '')}${year ? year[0] : ''}`;

            // Link to local zotero if available, else web
            const uri = `zotero://select/items/${data.key}`;

            return {
                id: `zot-${data.key}`,
                zoteroKey: data.key,
                citeKey: citeKey,
                title: data.title || 'Sin Título',
                author: authorStr,
                itemType: data.itemType,
                date: data.date || '',
                year: year ? year[0] : '',
                abstractNote: data.abstractNote || '',
                doi: data.DOI || '',
                url: data.url || '',
                publicationTitle: data.publicationTitle || data.bookTitle || '',
                journalAbbreviation: data.journalAbbreviation || '',
                volume: data.volume || '',
                issue: data.issue || '',
                pages: data.pages || '',
                publisher: data.publisher || '',
                place: data.place || '',
                tags: (data.tags || []).map(t => t.tag),
                groups: [], // Initialize for JabRef-style groups
                uri: uri,
                importedAt: Date.now()
            };
        });
    }

    /**
     * Converts workspace library items to BibTeX format string.
     * @param {Array} items - Library items from store
     * @returns {string} BibTeX formatted string
     */
    function exportAsBibTeX(items) {
        const zoteroTypeToBib = {
            'article-journal': 'article',
            'book': 'book',
            'bookSection': 'incollection',
            'chapter': 'incollection',
            'conferencePaper': 'inproceedings',
            'thesis': 'phdthesis',
            'report': 'techreport',
            'webpage': 'misc',
            'document': 'misc',
        };

        return items.map(item => {
            const bibType = zoteroTypeToBib[item.itemType] || 'misc';
            const key = item.citeKey || item.id;

            const fields = [];
            if (item.title) fields.push(`  title     = {${item.title}}`);
            if (item.author) fields.push(`  author    = {${item.author}}`);
            if (item.year || item.date) fields.push(`  year      = {${item.year || item.date}}`);
            if (item.publicationTitle) fields.push(`  journal   = {${item.publicationTitle}}`);
            if (item.journalAbbreviation) fields.push(`  journaltitle = {${item.journalAbbreviation}}`);
            if (item.volume) fields.push(`  volume    = {${item.volume}}`);
            if (item.issue) fields.push(`  number    = {${item.issue}}`);
            if (item.pages) fields.push(`  pages     = {${item.pages}}`);
            if (item.publisher) fields.push(`  publisher = {${item.publisher}}`);
            if (item.place) fields.push(`  address   = {${item.place}}`);
            if (item.doi) fields.push(`  doi       = {${item.doi}}`);
            if (item.url) fields.push(`  url       = {${item.url}}`);
            if (item.abstractNote) fields.push(`  abstract  = {${item.abstractNote.replace(/[{}]/g, '')}}`);

            return `@${bibType}{${key},\n${fields.join(',\n')}\n}`;
        }).join('\n\n');
    }

    /**
     * Converts workspace library items to CSL-JSON array.
     * @param {Array} items - Library items from store
     * @returns {string} JSON string
     */
    function exportAsCSLJSON(items) {
        const cslItems = items.map(item => {
            const csl = {
                id: item.citeKey || item.id,
                type: item.itemType || 'article',
                title: item.title,
            };
            if (item.author) {
                // Parse "Lastname, Firstname; Lastname2, Firstname2" back to CSL authors
                csl.author = item.author.split(';').map(a => {
                    const parts = a.trim().split(',');
                    return parts.length >= 2
                        ? { family: parts[0].trim(), given: parts[1].trim() }
                        : { literal: a.trim() };
                });
            }
            if (item.year) csl.issued = { 'date-parts': [[parseInt(item.year, 10)]] };
            if (item.publicationTitle) csl['container-title'] = item.publicationTitle;
            if (item.volume) csl.volume = item.volume;
            if (item.issue) csl.issue = item.issue;
            if (item.pages) csl.page = item.pages;
            if (item.doi) csl.DOI = item.doi;
            if (item.url) csl.URL = item.url;
            if (item.abstractNote) csl.abstract = item.abstractNote;
            return csl;
        });
        return JSON.stringify(cslItems, null, 2);
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
        syncLibrary,
        exportAsBibTeX,
        exportAsCSLJSON,
        fetchItemNotes
    };
})();

window.zoteroApi = zoteroApi;
