/**
 * views/library.js — Research & Library View
 * Resources for Biomedical Research, Teaching, and Project Management
 */

// Local state for library view
let currentLibraryViewMode = 'grid'; // 'grid' | 'table'
let currentLibraryTab = 'zotero'; // 'zotero' | 'drive'

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
           <!-- Tab Switcher -->
           <div class="btn-group" style="background: var(--bg-surface-2); border-radius: var(--radius-md); padding: 4px; display: flex; gap: 4px;">
             <button class="btn btn-ghost btn-sm ${currentLibraryTab === 'zotero' ? 'active' : ''}" onclick="setLibraryTab('zotero')">
               <i data-feather="book"></i> Zotero
             </button>
             <button class="btn btn-ghost btn-sm ${currentLibraryTab === 'drive' ? 'active' : ''}" onclick="setLibraryTab('drive')">
               <i data-feather="hard-drive"></i> Google Drive
             </button>
           </div>

           <div style="flex: 1;"></div>

           ${currentLibraryTab === 'zotero' ? `
             <div class="btn-group" style="margin-right: 12px; display: flex; background: var(--bg-surface-2); border-radius: var(--radius-md); padding: 4px;">
               <button class="btn btn-ghost btn-sm ${currentLibraryViewMode === 'grid' ? 'active' : ''}" style="padding: 4px 8px;" onclick="setLibraryViewMode('grid')" title="Vista Mosaico">
                 <i data-feather="grid" style="width: 14px; height: 14px;"></i>
               </button>
               <button class="btn btn-ghost btn-sm ${currentLibraryViewMode === 'table' ? 'active' : ''}" style="padding: 4px 8px;" onclick="setLibraryViewMode('table')" title="Vista Tabla (Dataview)">
                 <i data-feather="list" style="width: 14px; height: 14px;"></i>
               </button>
             </div>
             
             <input type="file" id="zotero-import-file" accept=".json" style="display:none;" />
             <div class="dropdown-wrapper" style="display:flex; gap:8px;">
               <button class="btn btn-secondary" onclick="document.getElementById('zotero-import-file').click()" title="Importar CSL JSON manual">
                 <i data-feather="upload-cloud"></i> Archivo
               </button>
               <button class="btn btn-primary" id="btn-zotero-sync" title="Sincronizar en vivo con API">
                 <i data-feather="refresh-cw"></i> Sincronizar Zotero
               </button>
               <button class="btn btn-icon" id="btn-zotero-config" title="Configurar Zotero API">
                 <i data-feather="settings"></i>
               </button>
             </div>
           ` : `
             <button class="btn btn-secondary" onclick="syncManager.openPanel()">
               <i data-feather="settings"></i> Configurar Drive
             </button>
           `}
        </div>
      </div>

      <div class="library-container" id="library-content-area" style="flex:1; display:flex; flex-direction:column;">
        ${currentLibraryTab === 'zotero' ? renderZoteroContent(libraryItems) : '<div class="loader-wrap"><i data-feather="loader" class="spin"></i> Cargando Drive...</div>'}
      </div>
    </div>`;

  if (window.feather) feather.replace();

  if (currentLibraryTab === 'zotero') {
    bindZoteroEvents();
  } else {
    loadDriveContent();
  }
}

function renderZoteroContent(items) {
  return `
    <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
      ${statPill(items.length, 'Referencias Totales', 'book')}
      ${statPill(items.filter(i => i.itemType === 'article-journal').length, 'Artículos', 'file-text')}
    </div>
    <div style="flex:1;">
      ${items.length === 0
      ? emptyState('book-open', 'Tu biblioteca está vacía. Añade tus llaves API web de Zotero y dale a sincronizar.')
      : (currentLibraryViewMode === 'table' ? renderLibraryTable(items) : renderLibraryGrid(items))}
    </div>
  `;
}

async function loadDriveContent() {
  const container = document.getElementById('library-content-area');
  if (!container) return;

  let files = [];
  try {
    files = await syncManager.listDriveFiles();
  } catch (err) {
    console.error('Error loading Drive files:', err);
    container.innerHTML = emptyState('alert-circle', 'No se pudo cargar el contenido de Drive.');
    if (window.feather) feather.replace();
    return;
  }

  if (files.length === 0) {
    container.innerHTML = emptyState('cloud-off', 'No se encontraron archivos en Drive o no estás conectado.');
    if (window.feather) feather.replace();
    return;
  }

  container.innerHTML = `
    <div class="drive-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:20px;">
      ${files.map(file => {
    const mimeType = file.mimeType || '';
    const icon = getFileIcon(mimeType);
    const fileSize = Number(file.size || 0);
    const thumbnailLink = safeUrl(file.thumbnailLink);
    const iconLink = safeUrl(file.iconLink);
    const webViewLink = safeUrl(file.webViewLink);
    return `
          <div class="card glass-panel drive-card" style="padding:12px; display:flex; flex-direction:column; gap:8px; transition: transform 0.2s; cursor:default;">
            <div class="drive-thumb" style="height:110px; background:var(--bg-surface-2); border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center; position:relative;">
              ${thumbnailLink
        ? `<img src="${thumbnailLink}" alt="Vista previa de ${esc(file.name || 'archivo')}" style="width:100%; height:100%; object-fit:cover;">`
        : `<i data-feather="${icon}" style="width:32px; height:32px; opacity:0.4;"></i>`}
                ${iconLink ? `<img src="${iconLink}" alt="Icono de archivo" style="position:absolute; bottom:4px; right:4px; width:16px; height:16px; background:white; border-radius:2px; padding:2px;">` : ''}
            </div>
            <div style="overflow:hidden;">
              <h4 style="font-size:0.8rem; margin:0; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${esc(file.name)}">${esc(file.name)}</h4>
              <p style="font-size:0.65rem; color:var(--text-muted); margin:2px 0 0 0;">${(fileSize / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <a href="${webViewLink || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:auto; font-size:0.75rem; ${webViewLink ? '' : 'pointer-events:none; opacity:0.6;'}">
              <i data-feather="external-link" style="width:12px;"></i> Abrir
            </a>
          </div>
        `;
  }).join('')}
    </div>
  `;
  if (window.feather) feather.replace();
}

function safeUrl(url) {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch (_e) {
    return '';
  }

  return '';
}

function getFileIcon(mime) {
  if (mime.includes('pdf')) return 'file-text';
  if (mime.includes('image')) return 'image';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'table';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'monitor';
  if (mime.includes('document') || mime.includes('word')) return 'edit-3';
  return 'file';
}

window.setLibraryTab = function (tab) {
  currentLibraryTab = tab;
  renderLibrary(document.getElementById('app-root'));
};

function bindZoteroEvents() {
  const btnSync = document.getElementById('btn-zotero-sync');
  const btnConfig = document.getElementById('btn-zotero-config');
  const popover = document.getElementById('zotero-config-popover');
  const btnSaveCfg = document.getElementById('btn-zot-save-cfg');

  const fileInput = document.getElementById('zotero-import-file');
  if (fileInput) fileInput.addEventListener('change', handleZoteroImport);

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
