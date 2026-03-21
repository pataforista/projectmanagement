/**
 * views/notes-wiki.js — Wiki jerárquica inspirada en BookStack
 * Estructura: Libros → Capítulos → Páginas
 * Datos almacenados en el store de documents con wikiType: 'book' | 'chapter' | 'page'
 */

const WIKI_CSS = `
  .wiki-layout {
    display: grid;
    grid-template-columns: 220px 200px 1fr;
    height: 100%;
    overflow: hidden;
  }
  .wiki-panel {
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-surface);
  }
  .wiki-panel-header {
    padding: 12px 14px 8px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .wiki-panel-header h4 {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
  .wiki-panel-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
  }
  .wiki-item {
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.83rem;
    color: var(--text-secondary);
    transition: background 0.12s, color 0.12s;
    display: flex;
    align-items: center;
    gap: 7px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .wiki-item:hover { background: var(--bg-surface-2); color: var(--text-primary); }
  .wiki-item.active {
    background: var(--bg-accent);
    color: var(--accent-primary);
    font-weight: 600;
  }
  .wiki-item i { width: 13px; height: 13px; flex-shrink: 0; }
  .wiki-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .wiki-item .wiki-del {
    opacity: 0; width: 14px; height: 14px; flex-shrink: 0;
    color: var(--accent-danger); margin-left: auto;
  }
  .wiki-item:hover .wiki-del { opacity: 1; }
  .wiki-editor-area {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-body);
  }
  .wiki-editor-header {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    background: var(--bg-surface);
  }
  .wiki-page-title-input {
    flex: 1;
    font-size: 1.1rem;
    font-weight: 600;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-family: inherit;
  }
  .wiki-page-title-input::placeholder { color: var(--text-muted); }
  .wiki-editor-textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    padding: 20px;
    font-family: var(--font-mono, monospace);
    font-size: 0.9rem;
    background: transparent;
    color: var(--text-primary);
    line-height: 1.7;
  }
  .wiki-preview {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    line-height: 1.75;
    display: none;
  }
  .wiki-preview h1 { font-size: 1.8em; border-bottom: 2px solid var(--border-color); padding-bottom: 0.3em; }
  .wiki-preview h2 { font-size: 1.4em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.2em; margin-top: 1.6em; }
  .wiki-preview h3 { font-size: 1.15em; margin-top: 1.3em; }
  .wiki-preview blockquote { border-left: 3px solid var(--accent-primary); padding-left: 1em; color: var(--text-secondary); margin: 1em 0; }
  .wiki-preview code { background: var(--bg-surface-2); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 0.85em; }
  .wiki-preview a { color: var(--accent-teal); text-decoration: none; }
  .wiki-preview a:hover { text-decoration: underline; }
  .wiki-empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    gap: 12px;
    font-size: 0.88rem;
  }
  .wikilink.is-ghost {
    color: var(--accent-danger);
    border-bottom: 1px dashed var(--accent-danger);
    opacity: 0.8;
  }
  .wiki-tag {
    color: var(--accent-teal);
    background: var(--accent-teal-bg);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }
  .backlinks-section {
    margin-top: 40px;
    padding: 20px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-surface-2);
    border-radius: 12px;
  }
  .backlink-item {
    font-size: 0.85rem;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .backlink-item:hover {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }
  .wiki-empty-state i { width: 40px; height: 40px; opacity: 0.3; }
`;

// ─── State ────────────────────────────────────────────────────────────────────
let wikiState = {
  activeBookId: null,
  activeChapterId: null,
  activePageId: null,
  editingContent: '',
  previewMode: false
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Cache de entradas wiki (se recarga en cada renderAll desde dbAPI)
let _wikiDocs = [];

async function wikiReload() {
  const all = await window.dbAPI.getAll('documents');
  _wikiDocs = all.filter(d => d.wikiType && d.wikiType.startsWith('wiki-'));
}

function wikiGetAll(type) {
  return _wikiDocs.filter(d => d.wikiType === type);
}

function wikiGetChildren(type, parentId) {
  return _wikiDocs.filter(d => d.wikiType === type && d.parentId === parentId);
}

async function wikiSave(entry) {
  const record = { ...entry, updatedAt: Date.now() };
  await window.dbAPI.put('documents', record);
  // Update local cache
  const idx = _wikiDocs.findIndex(d => d.id === record.id);
  if (idx !== -1) _wikiDocs[idx] = record;
  else _wikiDocs.push(record);
}

async function wikiDelete(id) {
  await window.dbAPI.delete('documents', id);
  _wikiDocs = _wikiDocs.filter(d => d.id !== id);
}

function renderMarkdown(text) {
  const allPages = wikiGetAll('wiki-page');

  return (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Obsidian Wiki-links with existence check
    .replace(/\[\[(.*?)\]\]/g, (match, title) => {
      const exists = allPages.some(p => (p.title || '').toLowerCase() === title.toLowerCase());
      return `<a href="#/notes-wiki" class="wikilink ${exists ? '' : 'is-ghost'}" data-title="${title}">${title}</a>`;
    })
    // Obsidian Tags #tag
    .replace(/(^|\s)#([a-zA-Z0-9_\-]+)/g, '$1<span class="wiki-tag" data-tag="$2">#$2</span>')
    .replace(/^---$/gim, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

// ─── Main render ──────────────────────────────────────────────────────────────

function renderNotesWiki(root) {
  // Inject CSS once
  if (!document.getElementById('wiki-style')) {
    const s = document.createElement('style');
    s.id = 'wiki-style';
    s.textContent = WIKI_CSS;
    document.head.appendChild(s);
  }

  const renderAll = async () => {
    await wikiReload();
    const books = wikiGetAll('wiki-book');
    const chapters = wikiState.activeBookId ? wikiGetChildren('wiki-chapter', wikiState.activeBookId) : [];
    const pages = wikiState.activeChapterId ? wikiGetChildren('wiki-page', wikiState.activeChapterId) : [];
    const activePage = wikiState.activePageId ? _wikiDocs.find(d => d.id === wikiState.activePageId) : null;

    root.innerHTML = `
      <div class="view-inner" style="display:flex; flex-direction:column; height:100%; padding:0;">
        <!-- Header -->
        <div class="view-header" style="padding:12px 20px; border-bottom:1px solid var(--border-color); flex-shrink:0;">
          <div class="view-header-text">
            <h1>Wiki del Workspace</h1>
            <p class="view-subtitle">Documentación jerárquica: Libros → Capítulos → Páginas</p>
          </div>
          <div class="view-actions">
            <button class="btn btn-secondary btn-sm" id="wiki-today" title="Nota Diaria">
              <i data-feather="calendar"></i> Hoy
            </button>
            <div style="width:1px; background:var(--border-color); margin:0 4px;"></div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
              ${books.length} libros · ${wikiGetAll('wiki-chapter').length} capítulos · ${wikiGetAll('wiki-page').length} páginas
            </div>
          </div>
        </div>

        <!-- Wiki Layout -->
        <div class="wiki-layout" style="flex:1; overflow:hidden;">

          <!-- BOOKS PANEL -->
          <div class="wiki-panel">
            <div class="wiki-panel-header">
              <h4><i data-feather="book" style="width:12px;height:12px;display:inline;"></i> Libros</h4>
              <button class="btn btn-ghost btn-xs" id="wiki-new-book" title="Nuevo Libro">
                <i data-feather="plus" style="width:12px;height:12px;"></i>
              </button>
            </div>
            <div class="wiki-panel-list" id="wiki-books-list">
              ${books.length ? books.map(b => `
                <div class="wiki-item ${b.id === wikiState.activeBookId ? 'active' : ''}"
                     data-id="${b.id}" data-type="book">
                  <i data-feather="book-open"></i>
                  <span class="wiki-item-title">${esc(b.title || 'Sin título')}</span>
                  <i data-feather="trash-2" class="wiki-del" data-del="${b.id}" data-del-type="wiki-book"></i>
                </div>`).join('')
              : `<div style="padding:10px 12px; font-size:0.75rem; color:var(--text-muted);">Crea tu primer libro</div>`}
            </div>
          </div>

          <!-- CHAPTERS PANEL -->
          <div class="wiki-panel">
            <div class="wiki-panel-header">
              <h4><i data-feather="folder" style="width:12px;height:12px;display:inline;"></i> Capítulos</h4>
              ${wikiState.activeBookId ? `
              <button class="btn btn-ghost btn-xs" id="wiki-new-chapter" title="Nuevo Capítulo">
                <i data-feather="plus" style="width:12px;height:12px;"></i>
              </button>` : ''}
            </div>
            <div class="wiki-panel-list" id="wiki-chapters-list">
              ${!wikiState.activeBookId
                ? `<div style="padding:10px 12px; font-size:0.75rem; color:var(--text-muted);">Selecciona un libro</div>`
                : chapters.length ? chapters.map(c => `
                <div class="wiki-item ${c.id === wikiState.activeChapterId ? 'active' : ''}"
                     data-id="${c.id}" data-type="chapter">
                  <i data-feather="folder"></i>
                  <span class="wiki-item-title">${esc(c.title || 'Sin título')}</span>
                  <i data-feather="trash-2" class="wiki-del" data-del="${c.id}" data-del-type="wiki-chapter"></i>
                </div>`).join('')
                : `<div style="padding:10px 12px; font-size:0.75rem; color:var(--text-muted);">Crea el primer capítulo</div>`
              }
            </div>
          </div>

          <!-- EDITOR/PAGES AREA -->
          <div class="wiki-editor-area">
            ${!wikiState.activeChapterId ? `
              <div class="wiki-empty-state">
                <i data-feather="book"></i>
                <span>Selecciona un capítulo para ver sus páginas</span>
              </div>
            ` : !wikiState.activePageId ? `
              <!-- Pages list for selected chapter -->
              <div class="wiki-editor-header">
                <span style="font-size:0.95rem; font-weight:600;">
                  ${esc(chapters.find(c => c.id === wikiState.activeChapterId)?.title || 'Capítulo')}
                </span>
                <button class="btn btn-primary btn-sm" id="wiki-new-page">
                  <i data-feather="plus"></i> Nueva Página
                </button>
              </div>
              <div style="padding:16px; display:flex; flex-wrap:wrap; gap:12px; overflow-y:auto; flex:1;">
                ${pages.length ? pages.map(pg => `
                  <div class="wiki-page-card" data-id="${pg.id}" style="
                    background:var(--bg-card); border:1px solid var(--border-color); border-radius:10px;
                    padding:16px; cursor:pointer; width:200px; transition:box-shadow 0.15s;
                  " onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='none'">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                      <i data-feather="file-text" style="width:14px; color:var(--accent-primary);"></i>
                      <span style="font-size:0.88rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(pg.title || 'Sin título')}</span>
                    </div>
                    <p style="font-size:0.75rem; color:var(--text-muted); margin:0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">
                      ${esc((pg.content || '').replace(/[#*>\-`]/g, '').substring(0, 120))}
                    </p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                      <span style="font-size:0.7rem; color:var(--text-muted);">
                        ${pg.updatedAt ? new Date(pg.updatedAt).toLocaleDateString('es-ES') : ''}
                      </span>
                      <button class="btn btn-ghost btn-xs wiki-del-page" data-del="${pg.id}" style="color:var(--accent-danger); opacity:0.6;">
                        <i data-feather="trash-2" style="width:11px;height:11px;"></i>
                      </button>
                    </div>
                  </div>
                `).join('')
                : `<div style="color:var(--text-muted); font-size:0.85rem; margin:20px;">No hay páginas en este capítulo. ¡Crea la primera!</div>`}
              </div>
            ` : `
              <!-- Page Editor -->
              <div class="wiki-editor-header">
                <button class="btn btn-ghost btn-sm" id="wiki-back-to-pages" title="Volver a la lista de páginas">
                  <i data-feather="arrow-left"></i>
                </button>
                <input type="text" class="wiki-page-title-input" id="wiki-page-title"
                       value="${esc(activePage?.title || '')}" placeholder="Título de la página...">
                <div style="display:flex; gap:6px; margin-left:auto;">
                  <button class="btn btn-ghost btn-sm" id="wiki-preview-toggle" title="${wikiState.previewMode ? 'Editar' : 'Vista previa'}">
                    <i data-feather="${wikiState.previewMode ? 'edit-2' : 'eye'}"></i>
                    ${wikiState.previewMode ? 'Editar' : 'Vista Previa'}
                  </button>
                  <button class="btn btn-primary btn-sm" id="wiki-save-page">
                    <i data-feather="save"></i> Guardar
                  </button>
                </div>
              </div>
              <!-- Breadcrumb -->
              <div style="padding:4px 20px; background:var(--bg-surface-2); font-size:0.73rem; color:var(--text-muted); border-bottom:1px solid var(--border-color); flex-shrink:0;">
                ${esc(books.find(b => b.id === wikiState.activeBookId)?.title || '')}
                <i data-feather="chevron-right" style="width:10px;height:10px;display:inline;"></i>
                ${esc(chapters.find(c => c.id === wikiState.activeChapterId)?.title || '')}
                <i data-feather="chevron-right" style="width:10px;height:10px;display:inline;"></i>
                ${esc(activePage?.title || 'Página')}
              </div>
              <!-- Editor / Preview -->
              <div id="wiki-editor-body" style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                <textarea id="wiki-page-content" class="wiki-editor-textarea"
                          style="${wikiState.previewMode ? 'display:none;' : ''}"
                          placeholder="Escribe el contenido en Markdown...&#10;&#10;Usa [[Título de página]] para enlaces entre páginas."
                >${esc(activePage?.content || '')}</textarea>
                <div id="wiki-preview-panel" class="wiki-preview content-view"
                     style="${wikiState.previewMode ? 'display:block;' : 'display:none;'}">
                  ${renderMarkdown(activePage?.content || '')}

                  <!-- Backlinks Section -->
                  <div class="backlinks-section">
                    <h5 style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:12px;">Menciones vinculadas</h5>
                    <div id="wiki-backlinks-list">
                      ${(() => {
                        const title = activePage?.title?.toLowerCase();
                        if (!title) return '';
                        const allPages = wikiGetAll('wiki-page');
                        const linking = allPages.filter(p => p.id !== activePage.id && (p.content || '').toLowerCase().includes(`[[${title}]]`));
                        return linking.length
                          ? linking.map(p => `
                            <div class="backlink-item" data-id="${p.id}">
                              <i data-feather="link-2" style="width:14px; height:14px;"></i>
                              <span>${esc(p.title)}</span>
                            </div>`).join('')
                          : '<div style="font-size:0.8rem; color:var(--text-muted);">Sin menciones detectadas.</div>';
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            `}
          </div>

        </div>
      </div>
    `;

    feather.replace();
    attachWikiListeners(root, books, chapters, pages);
  };

  renderAll().catch(e => console.error('[Wiki] render error', e));
}

function attachWikiListeners(root, books, chapters, pages) {
  // ── New Book ────────────────────────────────────────────────────────────────
  root.querySelector('#wiki-new-book')?.addEventListener('click', async () => {
    const title = prompt('Nombre del nuevo libro:');
    if (!title?.trim()) return;
    const id = `wiki-book-${Date.now()}`;
    await wikiSave({ id, wikiType: 'wiki-book', title: title.trim(), content: '' });
    wikiState.activeBookId = id;
    wikiState.activeChapterId = null;
    wikiState.activePageId = null;
    renderNotesWiki(root);
  });

  // ── New Chapter ─────────────────────────────────────────────────────────────
  root.querySelector('#wiki-new-chapter')?.addEventListener('click', async () => {
    const title = prompt('Nombre del nuevo capítulo:');
    if (!title?.trim()) return;
    const id = `wiki-chapter-${Date.now()}`;
    await wikiSave({ id, wikiType: 'wiki-chapter', parentId: wikiState.activeBookId, title: title.trim(), content: '' });
    wikiState.activeChapterId = id;
    wikiState.activePageId = null;
    renderNotesWiki(root);
  });

  // ── New Page ────────────────────────────────────────────────────────────────
  root.querySelector('#wiki-new-page')?.addEventListener('click', async () => {
    const title = prompt('Título de la nueva página:');
    if (!title?.trim()) return;
    const id = `wiki-page-${Date.now()}`;
    await wikiSave({ id, wikiType: 'wiki-page', parentId: wikiState.activeChapterId, title: title.trim(), content: '' });
    wikiState.activePageId = id;
    wikiState.previewMode = false;
    renderNotesWiki(root);
  });

  // ── Select Book ─────────────────────────────────────────────────────────────
  root.querySelectorAll('.wiki-item[data-type="book"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.wiki-del')) return;
      wikiState.activeBookId = el.dataset.id;
      wikiState.activeChapterId = null;
      wikiState.activePageId = null;
      renderNotesWiki(root);
    });
  });

  // ── Select Chapter ──────────────────────────────────────────────────────────
  root.querySelectorAll('.wiki-item[data-type="chapter"]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.wiki-del')) return;
      wikiState.activeChapterId = el.dataset.id;
      wikiState.activePageId = null;
      renderNotesWiki(root);
    });
  });

  // ── Select Page card ────────────────────────────────────────────────────────
  root.querySelectorAll('.wiki-page-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.wiki-del-page')) return;
      wikiState.activePageId = el.dataset.id;
      wikiState.previewMode = false;
      renderNotesWiki(root);
    });
  });

  // ── Delete items ────────────────────────────────────────────────────────────
  root.querySelectorAll('[data-del]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.del;
      const type = el.dataset.delType || 'wiki-page';
      const label = type === 'wiki-book' ? 'libro' : type === 'wiki-chapter' ? 'capítulo' : 'página';
      if (!confirm(`¿Eliminar este ${label}? Esta acción no se puede deshacer.`)) return;
      await wikiDelete(id);
      if (type === 'wiki-book') { wikiState.activeBookId = null; wikiState.activeChapterId = null; wikiState.activePageId = null; }
      if (type === 'wiki-chapter') { wikiState.activeChapterId = null; wikiState.activePageId = null; }
      if (type === 'wiki-page') { wikiState.activePageId = null; }
      renderNotesWiki(root);
    });
  });

  root.querySelectorAll('.wiki-del-page').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('¿Eliminar esta página?')) return;
      await wikiDelete(el.dataset.del);
      renderNotesWiki(root);
    });
  });

  // ── Back to pages list ──────────────────────────────────────────────────────
  root.querySelector('#wiki-back-to-pages')?.addEventListener('click', () => {
    wikiState.activePageId = null;
    wikiState.previewMode = false;
    renderNotesWiki(root);
  });

  // ── Preview toggle ──────────────────────────────────────────────────────────
  root.querySelector('#wiki-preview-toggle')?.addEventListener('click', () => {
    wikiState.previewMode = !wikiState.previewMode;
    const textarea = root.querySelector('#wiki-page-content');
    const preview = root.querySelector('#wiki-preview-panel');
    if (wikiState.previewMode) {
      const md = textarea?.value || '';
      if (preview) preview.innerHTML = renderMarkdown(md);
      if (textarea) textarea.style.display = 'none';
      if (preview) preview.style.display = 'block';
    } else {
      if (textarea) textarea.style.display = '';
      if (preview) preview.style.display = 'none';
    }
    const btn = root.querySelector('#wiki-preview-toggle');
    if (btn) btn.innerHTML = wikiState.previewMode
      ? '<i data-feather="edit-2"></i> Editar'
      : '<i data-feather="eye"></i> Vista Previa';
    feather.replace();
  });

  // ── Save page ───────────────────────────────────────────────────────────────
  root.querySelector('#wiki-save-page')?.addEventListener('click', async () => {
    const title = root.querySelector('#wiki-page-title')?.value.trim();
    const content = root.querySelector('#wiki-page-content')?.value || '';
    if (!title) return showToast('El título no puede estar vacío.', 'warning');
    await wikiSave({
      id: wikiState.activePageId,
      wikiType: 'wiki-page',
      parentId: wikiState.activeChapterId,
      title,
      content
    });
    showToast('Página guardada.', 'success');
  });

  // ── Auto-save on content change ─────────────────────────────────────────────
  const contentArea = root.querySelector('#wiki-page-content');
  if (contentArea) {
    let saveTimer;
    contentArea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const title = root.querySelector('#wiki-page-title')?.value.trim();
        const content = contentArea.value;
        if (wikiState.activePageId && title) {
          await wikiSave({
            id: wikiState.activePageId,
            wikiType: 'wiki-page',
            parentId: wikiState.activeChapterId,
            title,
            content
          });
        }
      }, 2000); // Auto-save después de 2s de inactividad
    });
  }

  // ── Wikilink navigation & creation ──────────────────────────────────────────
  root.querySelectorAll('.wikilink').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const targetTitle = link.dataset.title;
      if (!targetTitle) return;
      const allPages = wikiGetAll('wiki-page');
      let target = allPages.find(p => (p.title || '').toLowerCase() === targetTitle.toLowerCase());

      if (!target) {
        // Ghost link logic: Create on click
        if (confirm(`La página "${targetTitle}" no existe. ¿Deseas crearla?`)) {
          const id = `wiki-page-${Date.now()}`;
          // Use current chapter as parent if available, or first chapter of first book
          let parentId = wikiState.activeChapterId;
          if (!parentId) {
            const firstBook = wikiGetAll('wiki-book')[0];
            const firstChapter = firstBook ? wikiGetChildren('wiki-chapter', firstBook.id)[0] : null;
            parentId = firstChapter ? firstChapter.id : null;
          }

          if (!parentId) return showToast('Crea un libro y un capítulo primero.', 'warning');

          target = { id, wikiType: 'wiki-page', parentId, title: targetTitle, content: '' };
          await wikiSave(target);
          showToast(`Página "${targetTitle}" creada.`, 'success');
        } else {
          return;
        }
      }

      if (target) {
        wikiState.activePageId = target.id;
        const chapter = wikiGetAll('wiki-chapter').find(c => c.id === target.parentId);
        if (chapter) {
          wikiState.activeChapterId = chapter.id;
          const book = wikiGetAll('wiki-book').find(b => b.id === chapter.parentId);
          if (book) wikiState.activeBookId = book.id;
        }
        renderNotesWiki(root);
      }
    });
  });

  // ── Daily Note (Today) ──────────────────────────────────────────────────────
  root.querySelector('#wiki-today')?.addEventListener('click', async () => {
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const allPages = wikiGetAll('wiki-page');
    let target = allPages.find(p => p.title === todayStr);

    if (!target) {
      // Create Daily Note
      let diarioBook = wikiGetAll('wiki-book').find(b => b.title.toLowerCase() === 'diario');
      if (!diarioBook) {
        const bid = `wiki-book-diario-${Date.now()}`;
        await wikiSave({ id: bid, wikiType: 'wiki-book', title: 'Diario' });
        diarioBook = { id: bid };
      }

      let generalChapter = wikiGetChildren('wiki-chapter', diarioBook.id).find(c => c.title.toLowerCase() === 'general');
      if (!generalChapter) {
        const cid = `wiki-chapter-gen-${Date.now()}`;
        await wikiSave({ id: cid, wikiType: 'wiki-chapter', parentId: diarioBook.id, title: 'General' });
        generalChapter = { id: cid };
      }

      const pid = `wiki-page-today-${Date.now()}`;
      target = { id: pid, wikiType: 'wiki-page', parentId: generalChapter.id, title: todayStr, content: `# ${todayStr}\n\nNotas del día...` };
      await wikiSave(target);
      showToast('Nota diaria creada.', 'success');
    }

    wikiState.activePageId = target.id;
    const chapter = wikiGetAll('wiki-chapter').find(c => c.id === target.parentId);
    if (chapter) {
      wikiState.activeChapterId = chapter.id;
      wikiState.activeBookId = chapter.parentId;
    }
    renderNotesWiki(root);
  });

  // ── Backlinks navigation ────────────────────────────────────────────────────
  root.querySelectorAll('.backlink-item').forEach(item => {
    item.addEventListener('click', () => {
      wikiState.activePageId = item.dataset.id;
      const target = _wikiDocs.find(d => d.id === wikiState.activePageId);
      if (target) {
        const chapter = wikiGetAll('wiki-chapter').find(c => c.id === target.parentId);
        if (chapter) {
          wikiState.activeChapterId = chapter.id;
          wikiState.activeBookId = chapter.parentId;
        }
        renderNotesWiki(root);
      }
    });
  });
}

window.renderNotesWiki = renderNotesWiki;
