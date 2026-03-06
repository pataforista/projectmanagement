/**
 * utils/vault-export.js — Vault export utilities
 *
 * Exports all workspace documents as individual Markdown files in a ZIP,
 * compatible with Zettlr and Logseq folder-based vaults.
 *
 * Requires JSZip loaded via CDN or npm. If unavailable, falls back to
 * downloading a single concatenated Markdown file.
 */

/**
 * Sanitises a string for use as a filename.
 * @param {string} name
 * @returns {string}
 */
function sanitiseFilename(name) {
    return (name || 'sin-titulo')
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        .replace(/\s+/g, '-')
        .substring(0, 120)
        .toLowerCase();
}

/**
 * Builds Pandoc-compatible YAML frontmatter for a document.
 * @param {Object} doc   - Document record from store
 * @param {Object} proj  - Project record from store (optional)
 * @returns {string}
 */
function buildFrontmatter(doc, proj) {
    const lines = ['---'];
    lines.push(`title: "${(doc.title || proj?.name || 'Sin título').replace(/"/g, "'")}"`);
    if (proj?.type) lines.push(`type: ${proj.type}`);
    if (doc.updatedAt) lines.push(`updated: ${new Date(doc.updatedAt).toISOString().slice(0, 10)}`);
    if (doc.properties) {
        Object.entries(doc.properties).forEach(([k, v]) => {
            lines.push(`${k}: ${JSON.stringify(v)}`);
        });
    }
    lines.push('---', '');
    return lines.join('\n');
}

/**
 * Exports all documents as a vault ZIP (Zettlr / Logseq compatible).
 * Falls back to concatenated .md download if JSZip is unavailable.
 *
 * @param {Object} storeRef  - Reference to the global store object
 */
async function exportVault(storeRef) {
    const documents = storeRef.get.documents() || [];
    const projects  = storeRef.get.projects()  || [];

    if (!documents.length) {
        showToast('No hay documentos para exportar.', 'warning');
        return;
    }

    const date = new Date().toISOString().slice(0, 10);

    // ── ZIP path (preferred) ──────────────────────────────────────────────
    if (typeof JSZip !== 'undefined') {
        const zip = new JSZip();
        const vault = zip.folder('workspace-vault');

        documents.forEach(doc => {
            const proj = projects.find(p => p.id === doc.projectId);
            const fm   = buildFrontmatter(doc, proj);
            const body = doc.content || '';
            const file  = sanitiseFilename(doc.title || proj?.name || doc.id) + '.md';
            vault.file(file, fm + body);
        });

        // Also export library as a references.bib if zoteroApi is available
        if (window.zoteroApi?.exportAsBibTeX) {
            const lib = storeRef.get.library() || [];
            if (lib.length) {
                vault.file('references.bib', zoteroApi.exportAsBibTeX(lib));
                vault.file('references.json', zoteroApi.exportAsCSLJSON(lib));
            }
        }

        // Index file (Logseq-style contents.md)
        const index = [
            '# Workspace Vault',
            '',
            `Exportado el ${date}`,
            '',
            '## Documentos',
            '',
            ...documents.map(doc => {
                const proj = projects.find(p => p.id === doc.projectId);
                const file = sanitiseFilename(doc.title || proj?.name || doc.id);
                return `- [[${file}]]`;
            }),
        ].join('\n');
        vault.file('contents.md', index);

        const blob = await zip.generateAsync({ type: 'blob' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `workspace-vault-${date}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`${documents.length} documentos exportados como vault ZIP.`, 'success');

    } else {
        // ── Fallback: single concatenated .md ───────────────────────────
        const parts = documents.map(doc => {
            const proj = projects.find(p => p.id === doc.projectId);
            const fm   = buildFrontmatter(doc, proj);
            return fm + (doc.content || '') + '\n\n---\n\n';
        });
        const blob = new Blob([parts.join('')], { type: 'text/markdown' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `workspace-vault-${date}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exportados ${documents.length} documentos en un solo archivo (JSZip no disponible para ZIP).`, 'info');
    }
}

window.exportVault = exportVault;
