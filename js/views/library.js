/**
 * views/library.js — Research & Library View
 * Resources for Biomedical Research, Teaching, and Project Management
 */

// Local state for library view
let currentLibraryViewMode = 'grid'; // 'grid' | 'table'

function renderLibrary(root) {
  const libraryItems = store.get.library() || [];

  root.innerHTML = `
    <div class="view-inner">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Biblioteca de Recursos</h1>
          <p class="view-subtitle">Gestión del conocimiento, investigación y docencia.</p>
        </div>
        <div class="view-actions">
           <!-- View Mode Toggle -->
           <div class="btn-group" style="margin-right: 12px; display: flex; background: var(--bg-surface-2); border-radius: var(--radius-md); padding: 4px;">
             <button class="btn btn-ghost btn-sm ${currentLibraryViewMode === 'grid' ? 'active' : ''}" style="padding: 4px 8px;" onclick="setLibraryViewMode('grid')" title="Vista Mosaico">
               <i data-feather="grid" style="width: 14px; height: 14px;"></i>
             </button>
             <button class="btn btn-ghost btn-sm ${currentLibraryViewMode === 'table' ? 'active' : ''}" style="padding: 4px 8px;" onclick="setLibraryViewMode('table')" title="Vista Tabla (Dataview)">
               <i data-feather="list" style="width: 14px; height: 14px;"></i>
             </button>
           </div>
           
           <input type="file" id="zotero-import-file" accept=".json" style="display:none;" />
           <button class="btn btn-secondary" onclick="document.getElementById('zotero-import-file').click()">
             <i data-feather="upload-cloud"></i> Importar Zotero
           </button>
        </div>
      </div>

      <!-- Library Stats -->
      <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
        ${statPill(libraryItems.length, 'Referencias Totales', 'book')}
        ${statPill(libraryItems.filter(i => i.itemType === 'article-journal').length, 'Artículos', 'file-text')}
        ${statPill(libraryItems.filter(i => i.itemType === 'book').length, 'Libros', 'bookmark')}
      </div>

      <div class="library-container" style="flex:1; display:flex; flex-direction:column;">
        ${libraryItems.length === 0
      ? emptyState('book-open', 'Tu biblioteca está vacía. Exporta tu colección desde Zotero como CSL-JSON o JSON normal e impórtala aquí.')
      : (currentLibraryViewMode === 'table' ? renderLibraryTable(libraryItems) : renderLibraryGrid(libraryItems))}
      </div>
    </div>`;

  feather.replace();

  // Attach File Upload Event
  const fileInput = document.getElementById('zotero-import-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleZoteroImport);
  }
}

window.setLibraryViewMode = function (mode) {
  currentLibraryViewMode = mode;
  renderLibrary(document.getElementById('app-root'));
};

function renderLibraryTable(items) {
  return `
    <div class="card glass-panel" style="overflow: auto;">
        <table class="list-table" style="width: 100%; text-align: left; border-collapse: collapse;">
            <thead>
                <tr>
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Tipo</th>
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Título</th>
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Autores</th>
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Año</th>
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Acción</th>
                </tr>
            </thead>
            <tbody>
                ${items.sort((a, b) => b.importedAt - a.importedAt).map(item => `
                <tr style="border-bottom: 1px solid var(--border-highlight); transition: background 0.2s;">
                    <td style="padding: 12px;"><span class="badge badge-neutral">${item.itemType}</span></td>
                    <td style="padding: 12px; font-weight: 500;">${esc(item.title)}</td>
                    <td style="padding: 12px; color: var(--text-secondary); font-size: 0.85rem;">${esc(item.author || '---')}</td>
                    <td style="padding: 12px; color: var(--text-secondary); font-size: 0.85rem;">${item.date ? escaAño(item.date) : '---'}</td>
                    <td style="padding: 12px;">
                        <a href="${item.uri}" class="btn btn-sm btn-ghost" style="color:var(--accent-primary);">
                          <i data-feather="external-link" style="width: 14px; height: 14px;"></i>
                        </a>
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;
}

function escaAño(dateString) {
  // Attempt to extract just the year from ISO strings or generic dates
  if (!dateString) return '';
  const m = String(dateString).match(/\d{4}/);
  return m ? m[0] : String(dateString);
}

async function handleZoteroImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Zotero exports can be an array (CSL JSON) or an object with 'items' array
    const items = Array.isArray(data) ? data : (data.items || []);

    if (!items || items.length === 0) {
      showToast('El archivo JSON no contiene referencias válidas.', 'error');
      return;
    }

    const parsedItems = items.map(processZoteroItem).filter(i => i !== null);

    if (parsedItems.length === 0) {
      showToast('No se pudieron procesar las referencias.', 'error');
      return;
    }

    await store.dispatch('IMPORT_LIBRARY', { items: parsedItems });
    renderLibrary(document.getElementById('app-root'));

  } catch (err) {
    console.error('Error parsing Zotero JSON:', err);
    showToast('Error al leer el archivo JSON.', 'error');
  }
}

function processZoteroItem(raw) {
  // Basic validation
  if (!raw.title) return null;

  // Handle CSL-JSON author format
  let authorString = '';
  if (raw.author && Array.isArray(raw.author)) {
    authorString = raw.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', ');
  } else if (raw.creators && Array.isArray(raw.creators)) {
    authorString = raw.creators.map(c => `${c.firstName || ''} ${c.lastName || ''}`.trim()).join(', ');
  }

  // Build the select URI
  // If it's pure Zotero JSON, it has a key. If it's CSL, it has an 'id' that might look like a URL or string.
  const itemKey = raw.key || raw.id;
  // We try to make a generic select link. Usually zotero://select/items/[key]
  const zoteroUri = `zotero://select/items/${itemKey}`;

  return {
    id: `lib-${Date.now()}-${itemKey || Math.random().toString(36).slice(2)}`,
    originalKey: itemKey,
    title: raw.title,
    author: authorString,
    abstract: raw.abstract || raw.abstractNote || '',
    date: raw.issued && raw.issued['date-parts'] ? raw.issued['date-parts'][0][0] : (raw.date || ''),
    itemType: raw.type || raw.itemType || 'document',
    uri: zoteroUri,
    importedAt: Date.now()
  };
}
