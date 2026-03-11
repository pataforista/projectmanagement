/**
 * api/crossref.js — CrossRef REST API integration
 * Used to resolve DOIs into rich metadata (CSL-JSON).
 */

const crossrefApi = (() => {
    const BASE_URL = 'https://api.crossref.org/works';

    // Polite pool contact email (customize if needed)
    const CONTACT_EMAIL = 'research-tools@example.com';

    /**
     * Fetches metadata for a given DOI.
     * @param {string} doi - Digital Object Identifier
     * @returns {Promise<Object>} Processed metadata in internal format
     */
    async function fetchMetadata(doi) {
        const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//, '');
        const url = `${BASE_URL}/${encodeURIComponent(cleanDoi)}?mailto=${encodeURIComponent(CONTACT_EMAIL)}`;

        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) {
                if (response.status === 404) throw new Error('DOI no encontrado en CrossRef.');
                throw new Error(`Error de CrossRef: ${response.status} ${response.statusText}`);
            }

            const json = await response.json();
            const item = json.message;

            return parseCrossRefToWorkspace(item);
        } catch (err) {
            console.error('CrossRef Fetch Error:', err);
            throw err;
        }
    }

    /**
     * Maps CrossRef response to our internal Workspace library format.
     */
    function parseCrossRefToWorkspace(item) {
        // Extract Year
        let year = '';
        if (item.issued && item.issued['date-parts'] && item.issued['date-parts'][0]) {
            year = String(item.issued['date-parts'][0][0]);
        } else if (item.created && item.created['date-parts']) {
            year = String(item.created['date-parts'][0][0]);
        }

        // Extract Authors
        let authorStr = 'Autor desconocido';
        if (item.author && item.author.length > 0) {
            authorStr = item.author.map(a => a.family ? `${a.family}, ${a.given || ''}` : a.name).join('; ');
        }

        // Generate citeKey (FirstAuthorYear)
        const firstAuthor = item.author && item.author[0];
        const lastName = firstAuthor ? (firstAuthor.family || firstAuthor.name || 'anon') : 'anon';
        const citeKey = `${lastName.toLowerCase().replace(/\s+/g, '')}${year}`;

        return {
            id: `cr-${item.DOI.replace(/[^a-z0-9]/gi, '-')}`,
            title: item.title ? item.title[0] : 'Sin Título',
            author: authorStr,
            year: year,
            date: year,
            doi: item.DOI,
            url: item.URL || `https://doi.org/${item.DOI}`,
            publicationTitle: item['container-title'] ? item['container-title'][0] : '',
            itemType: item.type === 'journal-article' ? 'article-journal' : (item.type || 'document'),
            citeKey: citeKey,
            publisher: item.publisher || '',
            volume: item.volume || '',
            issue: item.issue || '',
            pages: item.page || '',
            tags: [],
            uri: `https://doi.org/${item.DOI}`,
            importedAt: Date.now()
        };
    }

    return {
        fetchMetadata
    };
})();

window.crossrefApi = crossrefApi;
