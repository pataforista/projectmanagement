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
        <div class="view-actions" style="position:relative;">
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
           <div class="dropdown-wrapper">
             <button class="btn btn-secondary" onclick="document.getElementById('zotero-import-file').click()" title="Importar CSL JSON manual">
               <i data-feather="upload-cloud"></i> Archivo
             </button>
             <button class="btn btn-primary" id="btn-zotero-sync" title="Sincronizar en vivo con API" style="margin-left: 8px;">
               <i data-feather="refresh-cw"></i> Sincronizar Zotero
             </button>
             <button class="btn btn-icon" id="btn-zotero-config" title="Configurar Zotero API" style="margin-left:8px;">
               <i data-feather="settings"></i>
             </button>
             
             <div class="popover-menu glass-panel" id="zotero-config-popover" style="display:none; position:absolute; right:0; top:40px; width:300px; padding:16px; border-radius:8px; z-index:100; text-align:left;">
               <h4 style="margin:0 0 12px 0; font-size:0.9rem;">Configuración Zotero API</h4>
               <p style="font-size:0.75rem; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">Obtén tu UserID y Web API Key gratuitos desde las preferencias de tu cuenta en zotero.org.</p>
               <input class="form-input" id="zot-user-id" placeholder="Zotero User ID (ej. 1234567)" style="margin-bottom:8px;" value="${esc(zoteroApi.getCredentials().userId)}">
               <input class="form-input" id="zot-api-key" placeholder="API Key secreta" type="password" style="margin-bottom:12px;" value="${esc(zoteroApi.getCredentials().apiKey)}">
               <button class="btn btn-primary btn-sm" id="btn-zot-save-cfg" style="width:100%;">Guardar credenciales</button>
             </div>
           </div>
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
      ? emptyState('book-open', 'Tu biblioteca está vacía. Añade tus llaves API web de Zotero y dale a sincronizar, o sube manualmente un archivo CSL-JSON.')
      : (currentLibraryViewMode === 'table' ? renderLibraryTable(libraryItems) : renderLibraryGrid(libraryItems))}
      </div>
    </div>`;

  feather.replace();

  // Zotero API logic
  const fileInput = document.getElementById('zotero-import-file');
  if (fileInput) fileInput.addEventListener('change', handleZoteroImport);

  const btnSync = document.getElementById('btn-zotero-sync');
  const btnConfig = document.getElementById('btn-zotero-config');
  const popover = document.getElementById('zotero-config-popover');
  const btnSaveCfg = document.getElementById('btn-zot-save-cfg');

  if (btnConfig && popover) {
    btnConfig.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
    });

    // Close popover when clicking outside
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== btnConfig) {
        popover.style.display = 'none';
      }
    });
  }

  if (btnSaveCfg) {
    btnSaveCfg.addEventListener('click', () => {
      const uid = document.getElementById('zot-user-id').value;
      const key = document.getElementById('zot-api-key').value;
      zoteroApi.setCredentials(uid, key);
      popover.style.display = 'none';
      showToast('Credenciales guardadas localmente', 'success');
    });
  }

  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.innerHTML = '<i data-feather="loader" class="spin"></i> Sincronizando...';
      feather.replace();

      const success = await zoteroApi.syncLibrary();
      if (success) {
        renderLibrary(document.getElementById('app-root'));
      } else {
        btnSync.innerHTML = '<i data-feather="refresh-cw"></i> Sincronizar Zotero';
        feather.replace();
      }
    });
  }
}

window.deleteLibraryItem = async function (id) {
  if (confirm("¿Estás seguro de querer borrar esta referencia de tu biblioteca local?")) {
    const lib = store.get.library().filter(i => i.id !== id);
    await store.dispatch('CLEAR_LIBRARY_AND_SYNC', lib);
    renderLibrary(document.getElementById('app-root'));
  }
};

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
                    <td style="padding: 12px; display:flex; gap:8px;">
                        <a href="${item.uri}" class="btn btn-sm btn-ghost" title="Abrir en Zotero" style="color:var(--accent-primary);">
                          <i data-feather="external-link" style="width: 14px; height: 14px;"></i>
                        </a>
                        <button class="btn btn-sm btn-ghost" title="Eliminar referencia" style="color:var(--accent-danger);" onclick="deleteLibraryItem('${item.id}')">
                          <i data-feather="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
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

window.renderLibrary = renderLibrary;
