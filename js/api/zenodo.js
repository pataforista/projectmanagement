/**
 * api/zenodo.js — Zenodo REST API v3 integration
 *
 * Covers the full deposit lifecycle:
 *   1. createDeposition(metadata) → returns {id, doi_url, links}
 *   2. uploadFile(depositionId, content, filename) → uploads a text/binary file
 *   3. publishDeposition(depositionId) → publishes and returns assigned DOI
 *
 * Credentials are stored in localStorage (token only, no OAuth needed for personal tokens).
 * Sandbox mode uses https://sandbox.zenodo.org; production uses https://zenodo.org.
 */

const zenodoApi = (() => {
    const PROD_BASE  = 'https://zenodo.org/api';
    const SAND_BASE  = 'https://sandbox.zenodo.org/api';

    function getCredentials() {
        return {
            token:    localStorage.getItem('zenodo_token') || '',
            sandbox:  localStorage.getItem('zenodo_sandbox') !== 'false' // default: sandbox ON for safety
        };
    }

    function setCredentials(token, sandbox = true) {
        localStorage.setItem('zenodo_token', token.trim());
        localStorage.setItem('zenodo_sandbox', String(sandbox));
    }

    function baseUrl() {
        return getCredentials().sandbox ? SAND_BASE : PROD_BASE;
    }

    function headers() {
        const { token } = getCredentials();
        if (!token) throw new Error('Falta el token de acceso de Zenodo.');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    /**
     * Creates a new empty deposition (draft record).
     * @param {Object} metadata  - Zenodo metadata object
     * @returns {Promise<Object>} Deposition object with {id, conceptdoi, links, …}
     *
     * Minimal metadata example:
     *   { upload_type: 'software', title: 'My Project', creators: [{name: 'Doe, John'}],
     *     description: 'Description.', access_right: 'open', license: 'cc-by' }
     */
    async function createDeposition(metadata) {
        const res = await fetchWithTimeout(`${baseUrl()}/deposit/depositions`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ metadata })
        });
        if (!res.ok) {
            let errorMsg = res.statusText || `HTTP ${res.status}`;
            try {
                const err = await res.json();
                errorMsg = err.message || err.error_description || errorMsg;
            } catch (e) {
                // JSON parse failed, use statusText
            }
            throw new Error(`Zenodo createDeposition: ${res.status} — ${errorMsg}`);
        }
        return res.json();
    }

    /**
     * Uploads a single file to an existing deposition.
     * @param {string} depositionId
     * @param {string|Blob} content  - Text string or Blob
     * @param {string} filename      - e.g. 'project-export.json'
     * @returns {Promise<Object>}
     */
    async function uploadFile(depositionId, content, filename) {
        const { token } = getCredentials();
        if (!token) throw new Error('Falta el token de acceso de Zenodo.');

        const blob = content instanceof Blob ? content : new Blob([content], { type: 'text/plain' });
        const form = new FormData();
        form.append('file', blob, filename);

        const res = await fetchWithTimeout(`${baseUrl()}/deposit/depositions/${depositionId}/files`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }, // no Content-Type: browser sets multipart boundary
            body: form
        });
        if (!res.ok) {
            let errorMsg = res.statusText || `HTTP ${res.status}`;
            try {
                const err = await res.json();
                errorMsg = err.message || err.error_description || errorMsg;
            } catch (e) {
                // JSON parse failed, use statusText
            }
            throw new Error(`Zenodo uploadFile: ${res.status} — ${errorMsg}`);
        }
        return res.json();
    }

    /**
     * Publishes a deposition. IRREVERSIBLE in production.
     * @param {string} depositionId
     * @returns {Promise<Object>} Published record with {doi, doi_url, …}
     */
    async function publishDeposition(depositionId) {
        const res = await fetchWithTimeout(`${baseUrl()}/deposit/depositions/${depositionId}/actions/publish`, {
            method: 'POST',
            headers: headers()
        });
        if (!res.ok) {
            let errorMsg = res.statusText || `HTTP ${res.status}`;
            try {
                const err = await res.json();
                errorMsg = err.message || err.error_description || errorMsg;
            } catch (e) {
                // JSON parse failed, use statusText
            }
            throw new Error(`Zenodo publishDeposition: ${res.status} — ${errorMsg}`);
        }
        return res.json();
    }

    /**
     * High-level helper: create deposition, upload workspace JSON export, publish.
     * @param {Object} project  - Project object from store
     * @param {Object} options  - { publish: boolean, description: string }
     * @returns {Promise<{depositionId, doiUrl}>}
     */
    async function depositProject(project, options = {}) {
        const today = new Date().toISOString().slice(0, 10);

        const metadata = {
            upload_type: 'software',
            title: project.name,
            creators: [{ name: options.author || 'Autor Desconocido' }],
            description: options.description || project.description || `Exportación del proyecto "${project.name}" desde Workspace.`,
            access_right: 'open',
            license: 'cc-by',
            keywords: ['workspace', project.type || 'proyecto'].filter(Boolean),
            publication_date: today
        };

        showToast('Creando depósito en Zenodo...', 'info');
        const deposition = await createDeposition(metadata);

        // Export workspace project data as JSON
        const exportData = {
            project,
            exportedAt: today,
            source: 'Workspace'
        };
        const filename = `${project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${today}.json`;
        await uploadFile(deposition.id, JSON.stringify(exportData, null, 2), filename);

        if (options.publish) {
            showToast('Publicando en Zenodo (esto asigna un DOI permanente)...', 'info');
            const published = await publishDeposition(deposition.id);
            return { depositionId: published.id, doiUrl: published.doi_url, doi: published.doi };
        }

        return {
            depositionId: deposition.id,
            doiUrl: deposition.links?.html || '',
            doi: null // not yet published
        };
    }

    return {
        getCredentials,
        setCredentials,
        createDeposition,
        uploadFile,
        publishDeposition,
        depositProject
    };
})();

window.zenodoApi = zenodoApi;
