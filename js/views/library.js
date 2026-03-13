/**
 * views/library.js — Research & Library View
 * Resources for Biomedical Research, Teaching, and Project Management
 */

// Local state for library view
let currentLibraryViewMode = 'grid'; // 'grid' | 'table'
let currentLibraryTab = 'zotero'; // 'zotero' | 'drive'
let currentLibrarySearch = ''; // Search query
let currentLibraryGroup = 'all'; // 'all' | 'none' | groupName
let zoteroPopoverCloseHandler = null;

function renderLibrary(root) {
  const libraryItems = store.get.library() || [];

  root.innerHTML = `
    <div class="view-inner" style="display:flex; flex-direction:column; height:100%;">
      <div class="view-header">
        <div class="view-header-text">
          <h1>Biblioteca de Recursos</h1>
          <p class="view-subtitle">Gestión del conocimiento e investigación.</p>
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
             <!-- Search -->
             <div style="position:relative; display:flex; align-items:center;">
               <i data-feather="search" style="position:absolute; left:8px; width:13px; height:13px; color:var(--text-muted);"></i>
               <input type="text" id="lib-search" class="form-input" placeholder="Buscar..." value="${esc(currentLibrarySearch)}"
                 style="padding-left:28px; height:32px; font-size:0.82rem; width:180px;"
                 oninput="setLibrarySearch(this.value)">
             </div>

             <div class="btn-group" style="margin-right: 12px; display: flex; background: var(--bg-surface-2); border-radius: var(--radius-md); padding: 4px;">
               <button class="btn btn-ghost btn-sm ${currentLibraryViewMode === 'grid' ? 'active' : ''}" onclick="setLibraryViewMode('grid')" title="Mosaico">
                 <i data-feather="grid" style="width: 14px; height: 14px;"></i>
               </button>
               <button class="btn btn-ghost btn-sm ${currentLibraryViewMode === 'table' ? 'active' : ''}" onclick="setLibraryViewMode('table')" title="Tabla">
                 <i data-feather="list" style="width: 14px; height: 14px;"></i>
               </button>
             </div>

             <input type="file" id="zotero-import-file" accept=".json" style="display:none;" />
             <div class="dropdown-wrapper" style="display:flex; gap:8px;">
               <button class="btn btn-secondary btn-sm" onclick="exportLibraryAsBibTeX()" title="BibTeX"><i data-feather="download"></i></button>
               <button class="btn btn-primary btn-sm" id="btn-zotero-sync"><i data-feather="refresh-cw"></i> Sincronizar</button>
               <button class="btn btn-icon btn-sm" id="btn-zotero-config"><i data-feather="settings"></i></button>
               <button class="btn btn-icon btn-sm" id="btn-doi-resolver" title="Resolver DOI"><i data-feather="link-2"></i></button>
             </div>
           ` : `
             <button class="btn btn-secondary" onclick="syncManager.openPanel()">
               <i data-feather="settings"></i> Configurar Drive
             </button>
           `}
        </div>
      </div>

      <div class="library-layout" style="flex:1; display:flex; gap:20px; overflow:hidden;">
        ${currentLibraryTab === 'zotero' ? `
          <aside class="library-sidebar glass-panel" style="width:200px; display:flex; flex-direction:column; padding:15px; border-radius:var(--radius-md); background:var(--bg-surface-1);">
            <h3 style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
              <i data-feather="folder" style="width:12px;"></i> Grupos
            </h3>
            <div id="library-groups-list" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px;">
              ${renderGroupsList(libraryItems)}
            </div>
            <button class="btn btn-ghost btn-xs" style="margin-top:10px; justify-content:flex-start; color:var(--text-muted);" onclick="createNewGroup()">
              <i data-feather="plus" style="width:12px;"></i> Nuevo grupo
            </button>
          </aside>
          <div class="library-main" id="library-content-area" style="flex:1; overflow-y:auto; display:flex; flex-direction:column;">
            ${renderZoteroContent(libraryItems)}
          </div>
        ` : `
          <div id="library-content-area" style="flex:1; overflow-y:auto;">
            <div class="loader-wrap"><i data-feather="loader" class="spin"></i> Cargando Drive...</div>
          </div>
        `}
      </div>
    </div>`;

  if (window.feather) feather.replace();

  if (currentLibraryTab === 'zotero') {
    bindZoteroEvents();
  } else {
    loadDriveContent();
  }
}

function renderGroupsList(items) {
  const groupsCount = {};
  let total = items.length;
  let noGroup = 0;

  items.forEach(i => {
    if (!i.groups || i.groups.length === 0) {
      noGroup++;
    } else {
      i.groups.forEach(g => {
        groupsCount[g] = (groupsCount[g] || 0) + 1;
      });
    }
  });

  const sortedGroups = Object.keys(groupsCount).sort();

  return `
    <button class="btn-sidebar ${currentLibraryGroup === 'all' ? 'active' : ''}" onclick="setLibraryGroup('all')">
      <i data-feather="layers"></i> <span>Todos</span> <span class="count">${total}</span>
    </button>
    <button class="btn-sidebar ${currentLibraryGroup === 'none' ? 'active' : ''}" onclick="setLibraryGroup('none')">
      <i data-feather="slash"></i> <span>Sin grupo</span> <span class="count">${noGroup}</span>
    </button>
    <hr style="margin:8px 0; border:none; border-top:1px solid var(--border-color); opacity:0.3;">
    ${sortedGroups.map(g => `
      <button class="btn-sidebar ${currentLibraryGroup === g ? 'active' : ''}" onclick="setLibraryGroup('${esc(g)}')">
        <i data-feather="hash"></i> <span>${esc(g)}</span> <span class="count">${groupsCount[g]}</span>
      </button>
    `).join('')}
  `;
}

window.setLibraryGroup = function (group) {
  currentLibraryGroup = group;
  renderLibrary(document.getElementById('app-root'));
};

function renderZoteroContent(allItems) {
  // 1. Filter by Group
  let items = allItems;
  if (currentLibraryGroup === 'none') {
    items = allItems.filter(i => !i.groups || i.groups.length === 0);
  } else if (currentLibraryGroup !== 'all') {
    items = allItems.filter(i => i.groups && i.groups.includes(currentLibraryGroup));
  }

  // 2. Filter by Search
  const q = currentLibrarySearch.toLowerCase().trim();
  if (q) {
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.author || '').toLowerCase().includes(q) ||
      (i.publicationTitle || '').toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  const withDOI = items.filter(i => i.doi);

  return `
    <div style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
      <div style="background:var(--bg-surface-2); padding:4px 10px; border-radius:20px; font-size:0.75rem; border:1px solid var(--border-color);">
        <span style="color:var(--text-muted); font-weight:600;">Grupo:</span> ${esc(currentLibraryGroup === 'all' ? 'Todos' : currentLibraryGroup === 'none' ? 'Sin grupo' : currentLibraryGroup)}
      </div>
      <div style="flex:1;"></div>
      ${statPill(items.length, 'Referencias', 'book')}
      ${statPill(items.filter(i => i.itemType === 'article-journal').length, 'Artículos', 'file-text')}
    </div>
    <div style="flex:1;">
      ${items.length === 0
      ? emptyState('book-open', allItems.length === 0
        ? 'Tu biblioteca está vacía_ Sincroniza con Zotero para empezar.'
        : 'No hay resultados que coincidan con los filtros.')
      : (currentLibraryViewMode === 'table' ? renderLibraryTable(items) : renderLibraryGrid(items))}
    </div>
  `;
}

let currentLibraryFolderId = null; // null = root or shared folder
let libraryPathStack = []; // Array of {id, name}

async function loadDriveContent(targetFolderId = null) {
  const container = document.getElementById('library-content-area');
  if (!container) return;

  currentLibraryFolderId = targetFolderId;

  // Render Skeleton/Loader
  container.innerHTML = `<div class="loader-wrap" style="margin-top:40px;"><i data-feather="loader" class="spin"></i> Cargando contenido de Drive...</div>`;
  if (window.feather) feather.replace();

  let files = [];
  const mobileMode = window.isMobileRuntime?.() || false;
  
  try {
    // If we are at the beginning (null), try to use the shared folder from config as starting point
    let effectiveFolderId = targetFolderId;
    if (!effectiveFolderId) {
       const cfg = syncManager.getConfig();
       effectiveFolderId = cfg.sharedFolderId || null;
    }

    files = await syncManager.listDriveFiles(effectiveFolderId);
  } catch (err) {
    console.error('Error loading Drive files:', err);
    container.innerHTML = emptyState('alert-circle', 'No se pudo cargar el contenido de Drive.');
    if (window.feather) feather.replace();
    return;
  }

  // Breadcrumbs UI
  const renderBreadcrumbs = () => {
    return `
      <div class="drive-breadcrumbs" style="display:flex; align-items:center; gap:8px; margin-bottom:16px; font-size:0.85rem; background:var(--bg-surface-2); padding:8px 12px; border-radius:var(--radius-md); border:1px solid var(--border-color);">
        <button class="btn btn-ghost btn-xs" onclick="navigateToDriveFolder(null, 'Inicio')" style="padding:4px 8px;">
          <i data-feather="home" style="width:14px; height:14px; margin-right:4px;"></i> Drive
        </button>
        ${libraryPathStack.map((step, index) => `
          <i data-feather="chevron-right" style="width:12px; height:12px; opacity:0.4;"></i>
          <button class="btn btn-ghost btn-xs" onclick="navigateToDriveFolder('${step.id}', '${esc(step.name)}', true, ${index})" style="padding:4px 8px; max-width:120px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
            ${esc(step.name)}
          </button>
        `).join('')}
      </div>
    `;
  };

  if (files.length === 0 && !targetFolderId) {
    container.innerHTML = emptyState('cloud-off', 'No se encontraron archivos en Drive o no estás conectado.');
    if (window.feather) feather.replace();
    return;
  }

  container.innerHTML = `
    ${renderBreadcrumbs()}
    <div style="background:var(--accent-info-bg); border-left:4px solid var(--accent-info); padding:10px 15px; border-radius:4px; margin-bottom:20px; font-size:0.75rem; color:var(--text-secondary); display:flex; align-items:center; gap:10px;">
      <i data-feather="info" style="width:16px; height:16px; color:var(--accent-info);"></i>
      <span>Estás en: <strong>${libraryPathStack.length > 0 ? esc(libraryPathStack[libraryPathStack.length-1].name) : 'Raíz / Workspace'}</strong>. Los archivos son de solo lectura.</span>
    </div>

    ${files.length === 0 ? emptyState('folder-minus', 'Esta carpeta está vacía.') : `
      <div class="drive-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:20px;">
        ${files.map(file => {
          const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
          const icon = isFolder ? 'folder' : getFileIcon(file.mimeType);
          const fileSizeLabel = isFolder ? 'Carpeta' : `${(Number(file.size || 0) / 1024 / 1024).toFixed(2)} MB`;
          
          const thumbnailLink = safeUrl(file.thumbnailLink);
          const iconLink = safeUrl(file.iconLink);
          const webViewLink = safeUrl(file.webViewLink);
          const ownerLabel = file.owners?.[0]?.displayName || 'Externo';
          
          return `
            <div class="card glass-panel drive-card ${isFolder ? 'folder-card' : ''}" 
                 style="padding:12px; display:flex; flex-direction:column; gap:8px; transition: all 0.2s; cursor:${isFolder ? 'pointer' : 'default'};"
                 ${isFolder ? `onclick="navigateToDriveFolder('${file.id}', '${esc(file.name)}', false)"` : ''}>
              
              <div class="drive-thumb" style="height:110px; background:var(--bg-surface-2); border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center; position:relative;">
                ${(thumbnailLink && !mobileMode && !isFolder)
                  ? `<img src="${thumbnailLink}" alt="Vista previa" style="width:100%; height:100%; object-fit:cover;">`
                  : `<i data-feather="${icon}" style="width:32px; height:32px; color:${isFolder ? 'var(--accent-primary)' : 'var(--text-muted)'}; opacity:0.8;"></i>`}
                  ${(iconLink && !isFolder) ? `<img src="${iconLink}" alt="File icon" style="position:absolute; bottom:4px; right:4px; width:16px; height:16px; background:white; border-radius:2px; padding:2px;">` : ''}
                  ${isFolder ? `<div style="position:absolute; bottom:6px; left:50%; transform:translateX(-50%); font-size:0.6rem; font-weight:800; color:var(--accent-primary); background:var(--accent-primary-bg); padding:1px 6px; border-radius:4px; border:1px solid var(--accent-primary);">EXPLORAR</div>` : ''}
              </div>

              <div style="overflow:hidden;">
                <h4 style="font-size:0.8rem; margin:0; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${esc(file.name)}">${esc(file.name)}</h4>
                <p style="font-size:0.65rem; color:var(--text-muted); margin:2px 0 0 0;">${fileSizeLabel} · ${esc(ownerLabel)}</p>
              </div>

              ${!isFolder ? `
                <a href="${webViewLink || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="margin-top:auto; font-size:0.75rem;">
                  <i data-feather="external-link" style="width:12px;"></i> Abrir
                </a>
              ` : `
                 <button class="btn btn-primary btn-sm" style="margin-top:auto; font-size:0.75rem;">
                  <i data-feather="folder-plus" style="width:12px;"></i> Abrir carpeta
                </button>
              `}
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;
  if (window.feather) feather.replace();
}

window.navigateToDriveFolder = function(id, name, isBreadcrumb = false, breadcrumbIndex = -1) {
  if (id === null) {
    libraryPathStack = [];
  } else if (isBreadcrumb) {
    libraryPathStack = libraryPathStack.slice(0, breadcrumbIndex + 1);
  } else {
    // Evitar duplicados si ya estamos ahí o si es una navegación circular (raro en Drive)
    if (!libraryPathStack.find(i => i.id === id)) {
       libraryPathStack.push({ id, name });
    }
  }
  loadDriveContent(id);
};

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
    if (zoteroPopoverCloseHandler) {
      document.removeEventListener('click', zoteroPopoverCloseHandler);
    }
    zoteroPopoverCloseHandler = (e) => {
      if (!popover.contains(e.target) && e.target !== btnConfig) {
        popover.style.display = 'none';
      }
    };
    document.addEventListener('click', zoteroPopoverCloseHandler);
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

  const btnDoiResolver = document.getElementById('btn-doi-resolver');
  if (btnDoiResolver) {
    btnDoiResolver.addEventListener('click', async () => {
      const doi = prompt('Introduce el DOI de la referencia (ej: 10.1038/s41586-020-2012-7):');
      if (!doi) return;

      try {
        btnDoiResolver.innerHTML = '<i data-feather="loader" class="spin"></i> Resolviendo...';
        feather.replace();

        const item = await crossrefApi.fetchMetadata(doi);
        await store.dispatch('IMPORT_LIBRARY', { items: [item] });

        showToast('Referencia importada con éxito', 'success');
        renderLibrary(document.getElementById('app-root'));
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnDoiResolver.innerHTML = '<i data-feather="link-2"></i> Resolver DOI';
        feather.replace();
      }
    });
  }
}

window.deleteLibraryItem = async function (id) {
  if (confirm("¿Estás seguro de querer borrar esta referencia de tu biblioteca local?\n\nℹ️ Esto solo borra la referencia del Workspace local. No afectará a tu cuenta de Zotero.")) {
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
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Grupos/Tags</th>
                    <th style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">Acción</th>
                </tr>
            </thead>
            <tbody>
                ${items.sort((a, b) => b.importedAt - a.importedAt).map(item => `
                <tr style="border-bottom: 1px solid var(--border-highlight); transition: background 0.2s;">
                    <td style="padding: 12px;"><span class="badge badge-neutral">${esc(item.itemType || '?')}</span></td>
                    <td style="padding: 12px; font-weight: 500; max-width:280px;">
                      <span title="${esc(item.title)}">${esc(item.title)}</span>
                      ${item.publicationTitle ? `<div style="font-size:0.73rem; color:var(--text-muted); margin-top:2px;">${esc(item.publicationTitle)}</div>` : ''}
                    </td>
                    <td style="padding: 12px; color: var(--text-secondary); font-size: 0.85rem;">${esc(item.author || '---')}</td>
                    <td style="padding: 12px; color: var(--text-secondary); font-size: 0.85rem;">${item.year || (item.date ? escaAño(item.date) : '---')}</td>
                    <td style="padding: 12px;">
                      <div style="display:flex; flex-direction:column; gap:6px;">
                        <div style="display:flex; flex-wrap:wrap; gap:4px; max-width:150px;">
                          ${(item.groups || []).map(g => `
                            <span class="badge badge-primary" style="font-size:0.65rem; padding:1px 6px; cursor:pointer;" onclick="removeFromGroup('${item.id}', '${esc(g)}')">
                              ${esc(g)} &times;
                            </span>
                          `).join('')}
                          <button class="btn btn-ghost btn-xs" style="padding:0 4px; font-size:0.65rem;" onclick="addToGroup('${item.id}')" title="Añadir a grupo">
                            <i data-feather="plus" style="width:10px; height:10px;"></i>
                          </button>
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:2px;">
                           ${(item.tags || []).map(t => `<span style="font-size:0.6rem; color:var(--text-muted);">#${esc(t)}</span>`).join(' ')}
                        </div>
                      </div>
                    </td>
                    <td style="padding: 12px; display:flex; gap:8px;">
                        <button class="btn btn-sm btn-ghost" title="Auto-etiquetar con AI Local" onclick="autoTagItem('${item.id}')">
                          <i data-feather="cpu" style="width: 14px; height: 14px; color:var(--accent-teal);"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost" title="Copiar clave de cita [@${esc(item.citeKey || item.id)}]"
                          onclick="navigator.clipboard.writeText('[@${esc(item.citeKey || item.id)}]').then(()=>showToast('Clave copiada','success'))">
                          <i data-feather="copy" style="width: 14px; height: 14px;"></i>
                        </button>
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

window.addToGroup = async function (itemId) {
  const group = prompt('Nombre del grupo para añadir (JabRef-style):');
  if (!group) return;
  const item = store.get.library().find(i => i.id === itemId);
  if (!item) return;

  const groups = [...(item.groups || [])];
  if (!groups.includes(group)) {
    groups.push(group);
    await store.dispatch('UPDATE_LIBRARY_ITEM', { id: itemId, groups });
    renderLibrary(document.getElementById('app-root'));
  }
};

window.removeFromGroup = async function (itemId, groupName) {
  const item = store.get.library().find(i => i.id === itemId);
  if (!item) return;

  const groups = (item.groups || []).filter(g => g !== groupName);
  await store.dispatch('UPDATE_LIBRARY_ITEM', { id: itemId, groups });
  renderLibrary(document.getElementById('app-root'));
};

window.createNewGroup = function () {
  const group = prompt('Nombre del nuevo grupo:');
  if (group) {
    showToast(`Grupo "${group}" creado. Añade referencias a este grupo usando el botón "+" en la lista.`, 'info');
    // Groups are virtual until an item is assigned, so we just prompt
  }
};

function renderLibraryGrid(items) {
  return `
    <div class="library-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:20px;">
      ${items.map(item => `
        <div class="card glass-panel" style="padding:16px; display:flex; flex-direction:column; gap:12px; position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span class="badge badge-neutral" style="font-size:0.65rem;">${esc(item.itemType || 'document')}</span>
            <div style="display:flex; gap:4px;">
              <button class="btn btn-icon btn-xs" onclick="navigator.clipboard.writeText('[@${esc(item.citeKey || item.id)}]').then(()=>showToast('Clave copiada','success'))" title="Copiar clave">
                <i data-feather="copy" style="width:12px; height:12px;"></i>
              </button>
              <button class="btn btn-icon btn-xs" title="Auto-etiquetar con AI" onclick="autoTagItem('${item.id}')">
                <i data-feather="cpu" style="width:12px; height:12px; color:var(--accent-teal);"></i>
              </button>
              <button class="btn btn-icon btn-xs" style="color:var(--accent-danger);" onclick="deleteLibraryItem('${item.id}')">
                <i data-feather="trash-2" style="width:12px; height:12px;"></i>
              </button>
            </div>
          </div>
          <div>
            <h4 style="font-size:0.9rem; margin:0 0 4px 0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${esc(item.title)}">${esc(item.title)}</h4>
            <p style="font-size:0.75rem; color:var(--text-muted); margin:0;">${esc(item.author || '---')}</p>
          </div>
          
          <div style="display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
              ${(item.groups || []).map(g => `
                <span class="badge badge-primary" style="font-size:0.6rem; padding:1px 5px;">${esc(g)}</span>
              `).join('')}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:2px;">
              ${(item.tags || []).map(t => `<span style="font-size:0.55rem; color:var(--text-muted);">#${esc(t)}</span>`).join(' ')}
            </div>
          </div>

          <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.75rem; font-weight:600; color:var(--text-secondary);">${item.year || escaAño(item.date)}</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-xs" onclick="addToGroup('${item.id}')" title="Añadir a grupo">
                <i data-feather="folder-plus" style="width:12px; height:12px;"></i>
              </button>
              <a href="${item.uri}" class="btn btn-ghost btn-xs" style="color:var(--accent-primary);">
                <i data-feather="external-link" style="width:12px; height:12px;"></i>
              </a>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
    tags: raw.tags || [],
    groups: [], // Initialize for JabRef-style groups
    uri: zoteroUri,
    importedAt: Date.now()
  };
}

window.autoTagItem = async function (itemId) {
  const item = store.get.library().find(i => i.id === itemId);
  if (!item) return;

  try {
    showToast('Generando etiquetas con AI local...', 'info');
    const tags = await ollamaApi.suggestTags(item.title, item.abstractNote || item.abstract || '');
    if (tags && tags.length > 0) {
      const existingTags = item.tags || [];
      const newTags = [...new Set([...existingTags, ...tags])];
      await store.dispatch('UPDATE_LIBRARY_ITEM', { id: itemId, tags: newTags });
      showToast('Etiquetas generadas y añadidas.', 'success');
      renderLibrary(document.getElementById('app-root'));
    } else {
      showToast('No se pudieron generar etiquetas. Revisa Ollama.', 'warning');
    }
  } catch (err) {
    showToast('Error al conectar con Ollama.', 'error');
  }
};

window.renderLibrary = renderLibrary;

window.setLibrarySearch = function (q) {
  currentLibrarySearch = q;
  const root = document.getElementById('app-root');
  const items = store.get.library() || [];
  const contentArea = document.getElementById('library-content-area');
  if (contentArea) {
    contentArea.innerHTML = renderZoteroContent(items);
    if (window.feather) feather.replace();
  }
};

window.exportLibraryAsBibTeX = function () {
  const items = store.get.library() || [];
  if (!items.length) return showToast('La biblioteca está vacía.', 'warning');
  if (!window.zoteroApi?.exportAsBibTeX) return showToast('Función de exportación no disponible.', 'error');
  const bib = zoteroApi.exportAsBibTeX(items);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`biblioteca-${date}.bib`, bib);
  showToast(`${items.length} referencias exportadas como BibTeX.`, 'success');
};

window.exportLibraryAsCSL = function () {
  const items = store.get.library() || [];
  if (!items.length) return showToast('La biblioteca está vacía.', 'warning');
  if (!window.zoteroApi?.exportAsCSLJSON) return showToast('Función de exportación no disponible.', 'error');
  const json = zoteroApi.exportAsCSLJSON(items);
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`biblioteca-${date}.json`, json);
  showToast(`${items.length} referencias exportadas como CSL-JSON.`, 'success');
};
