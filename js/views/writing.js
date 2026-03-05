/**
 * views/writing.js — Manuscript Mode (Scrivener-like)
 */

const SLASH_MENU_CSS = `
  .slash-menu {
    position: absolute;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    z-index: 10000;
    width: 200px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .slash-item {
    padding: 8px 10px;
    font-size: 0.82rem;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background 0.15s;
  }
  .slash-item:hover {
    background: var(--bg-surface-2);
  }
  .slash-item i {
    width: 14px;
    height: 14px;
    color: var(--text-muted);
  }
`;

function renderWriting(root) {
  // Include all project types that involve text work
  const projects = store.get.projects().filter(p =>
    ['Artículo', 'Libro', 'Investigación', 'Clase', 'Presentación', 'Capítulo'].includes(p.type)
  );

  // If no writing-type projects, show all projects as fallback
  const writingProjects = projects.length > 0 ? projects : store.get.projects();

  let activeProjectId = localStorage.getItem('active_writing_project') || (writingProjects[0]?.id) || null;

  const renderInner = () => {
    const p = store.get.projectById(activeProjectId);
    const doc = store.get.documentByProject(activeProjectId) || { sections: [], content: '', title: '' };
    const sessions = activeProjectId
      ? store.get.sessionsByProject(activeProjectId).filter(s => s.type === 'Escritura')
      : [];

    if (!writingProjects.length) {
      root.innerHTML = `<div class="view-inner">${emptyState('type', 'Crea un proyecto de tipo Artículo, Libro o Investigación para usar el modo escritura.')}</div>`;
      return;
    }

    root.innerHTML = `
      <div class="writing-layout">
        
        <!-- Sidebar: Sections & Goals -->
        <aside class="writing-sidebar glass-panel">
          <div class="writing-sidebar-header">
            <h3>Manuscrito</h3>
            <select class="writing-project-select" id="wr-proj-select">
              </select>
          </div>
          
          <div class="tabs" style="padding:0 12px; margin-bottom:12px;">
            <button class="tab-btn active btn-xs" data-writing-tab="sections" style="flex:1;">Secciones</button>
            <button class="tab-btn btn-xs" data-writing-tab="history" style="flex:1;">Historial</button>
            <button class="tab-btn btn-xs" data-writing-tab="connections" style="flex:1;">Conexiones</button>
          </div>

          <div id="writing-tab-content">
            <div class="writing-sections" id="wr-sections-list">
              ${(doc.sections || []).length > 0
        ? doc.sections.map((sec, i) => `
                    <div class="writing-section-item" style="padding:8px 12px; border-radius:6px; cursor:pointer; font-size:0.83rem; color:var(--text-secondary); display:flex; align-items:center; gap:8px;" onclick="loadSection(${i})">
                      <i data-feather="file-text" style="width:12px;height:12px;"></i>
                      ${esc(sec.title || 'Sección sin título')}
                    </div>`).join('')
        : `<div style="padding:8px 12px; font-size:0.78rem; color:var(--text-muted);">Sin secciones</div>`
      }
              <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:flex-start; margin-top:12px;" onclick="addManuscriptSection()">
                <i data-feather="plus"></i> Nueva Sección
              </button>
            </div>
          </div>
          
          <div style="padding:12px; border-top:1px solid var(--border-color); margin-top:auto;">
            <button class="btn btn-secondary btn-sm" style="width:100%;" id="wr-gen-bib">
              <i data-feather="book"></i> Generar Bibliografía
            </button>
          </div>
          
          <div class="writing-goals">
            <div class="goal-header">
              <span>Meta diaria</span>
              <span class="goal-progress" id="wr-goal-progress">0/500 palabras</span>
            </div>
            <div class="progress-bar-small"><div class="progress-fill" id="wr-goal-bar" style="width:0%"></div></div>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:8px;">
              ${sessions.length} sesiones de escritura registradas
            </div>
          </div>
        </aside>

        <!-- Main: Editor -->
        <main class="writing-editor-area">
          <header class="editor-header">
            <div class="editor-title-wrap">
              <input type="text" class="editor-title-input" id="wr-section-title" placeholder="Título de la sección..." value="${esc(doc.title || '')}">
              <span class="word-count" id="wr-word-count">0 palabras</span>
            </div>
            <div class="editor-actions" style="display:flex; gap:8px;">
              <button class="btn btn-icon btn-sm" title="Usar Plantilla Académica" id="wr-template-btn"><i data-feather="file-plus"></i></button>
              <button class="btn btn-icon btn-sm" title="Metadatos YAML (Propiedades)" id="wr-properties-btn"><i data-feather="settings"></i></button>
              <button class="btn btn-icon btn-sm" title="Crear Snapshot (Versión)" id="wr-snapshot"><i data-feather="camera"></i></button>
              <button class="btn btn-icon btn-sm" title="Exportar .md" id="wr-export"><i data-feather="download"></i></button>
              <button class="btn btn-primary btn-sm" id="wr-save">Guardar</button>
            </div>
          </header>
          <div class="editor-header-meta" style="padding:0 20px; border-bottom:1px solid var(--border-color); background:var(--bg-surface-2); display:none;" id="wr-properties-panel">
            <div style="font-size:0.7rem; font-weight:700; color:var(--text-muted); padding:8px 0; display:flex; justify-content:space-between; align-items:center;">
              PROPIEDADES (YAML)
              <button class="btn btn-ghost btn-xs" id="wr-prop-toggle">✕</button>
            </div>
            <textarea id="wr-properties" class="form-textarea" style="min-height:60px; font-family:monospace; font-size:0.75rem; border:none; background:transparent; padding:0 0 12px 0;" placeholder="estado: borrador&#10;revisor: Dr. Gomez"></textarea>
          </div>
          <div class="editor-body" style="position:relative; flex:1; display:flex; flex-direction:column;">
            <div id="wr-annotations-layer" style="position:absolute; top:0; left:0; pointer-events:none; width:100%; height:100%; overflow:hidden; padding:20px; font-family:inherit; white-space:pre-wrap; color:transparent; line-height:1.6; z-index:1;"></div>
            <textarea id="wr-editor" class="manuscript-textarea" style="position:relative; z-index:2; background:transparent; flex:1;" placeholder="Empieza a escribir aquí...">${esc(doc.content || '')}</textarea>
          </div>
        </main>

      </div>
    `;

    feather.replace();

    // Count words on load
    const editor = root.querySelector('#wr-editor');
    const updateWordCount = () => {
      const words = editor.value.trim().split(/\s+/).filter(w => w.length > 0).length;
      root.querySelector('#wr-word-count').textContent = `${words} palabras`;
      // Update goal bar (500 words/day default)
      const goalWords = parseInt(localStorage.getItem('writing_goal') || '500', 10);
      const pct = Math.min(100, Math.round((words / goalWords) * 100));
      root.querySelector('#wr-goal-progress').textContent = `${words}/${goalWords} palabras`;
      root.querySelector('#wr-goal-bar').style.width = `${pct}%`;
    };
    updateWordCount();

    // ── Yjs Integration ──
    // Note: In a real PWA we'd load these via script or ESM
    let ydoc, ytext;
    if (typeof Y !== 'undefined') {
      ydoc = new Y.Doc();
      // Use projectId as room name to keep docs separate
      const indexeddbProvider = new IndexeddbPersistence(activeProjectId, ydoc);
      ytext = ydoc.getText('codemirror'); // using 'codemirror' as key convention

      ytext.observe(event => {
        if (event.transaction.origin !== null) { // only if change is local
          editor.value = ytext.toString();
          updateWordCount();
        }
      });

      editor.addEventListener('input', () => {
        // This is a naive sync for textarea, better with CodeMirror
        ytext.delete(0, ytext.length);
        ytext.insert(0, editor.value);
      });
    }

    // ── Slash Commands (/) Logic ──
    // Guard: inject CSS only once across all navigations
    if (!document.getElementById('slash-menu-style')) {
      const style = document.createElement('style');
      style.id = 'slash-menu-style';
      style.textContent = SLASH_MENU_CSS;
      document.head.appendChild(style);
    }

    let slashMenu = null;

    const closeSlashMenu = () => {
      if (slashMenu) {
        slashMenu.remove();
        slashMenu = null;
      }
    };

    const getCursorXY = (textarea, selectionPoint) => {
      const { offsetLeft: left, offsetTop: top } = textarea;
      const mirror = document.createElement('div');
      const style = window.getComputedStyle(textarea);
      for (const prop of style) mirror.style[prop] = style[prop];
      mirror.style.position = 'absolute';
      mirror.style.visibility = 'hidden';
      mirror.style.whiteSpace = 'pre-wrap';
      mirror.style.width = textarea.offsetWidth + 'px';
      mirror.style.top = '0'; mirror.style.left = '0';

      const content = textarea.value.substring(0, selectionPoint);
      mirror.textContent = content;
      const span = document.createElement('span');
      span.textContent = textarea.value.substring(selectionPoint) || '.';
      mirror.appendChild(span);
      document.body.appendChild(mirror);
      const { offsetLeft, offsetTop } = span;
      document.body.removeChild(mirror);
      return { x: left + offsetLeft, y: top + offsetTop };
    };

    editor.addEventListener('keyup', (e) => {
      if (e.key === '/') {
        const { selectionStart } = editor;
        const coords = getCursorXY(editor, selectionStart);

        closeSlashMenu();
        slashMenu = document.createElement('div');
        slashMenu.className = 'slash-menu';
        slashMenu.style.left = `${coords.x}px`;
        slashMenu.style.top = `${coords.y + 20}px`;

        const options = [
          { id: 'cita', icon: 'book-open', label: 'Cita Académica' },
          { id: 'img', icon: 'image', label: 'Imagen' },
          { id: 'ref', icon: 'link', label: 'Ref Zotero' },
          { id: 'title', icon: 'type', label: 'Título H2' }
        ];

        slashMenu.innerHTML = options.map(o => `
          <div class="slash-item" data-action="${o.id}">
            <i data-feather="${o.icon}"></i> ${o.label}
          </div>
        `).join('');

        root.appendChild(slashMenu);
        feather.replace();

        slashMenu.querySelectorAll('.slash-item').forEach(item => {
          item.onclick = () => {
            const action = item.dataset.action;
            let insert = '';
            if (action === 'cita') insert = '> "Texto de la cita" (Autor, Año)';
            if (action === 'img') insert = '![Descripción](url)';
            if (action === 'title') insert = '## ';

            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const text = editor.value;
            editor.value = text.substring(0, start - 1) + insert + text.substring(end);
            editor.focus();
            closeSlashMenu();
            updateWordCount();
          };
        });
      } else if (e.key === 'Escape') {
        closeSlashMenu();
      }
    });

    document.addEventListener('click', (e) => {
      if (slashMenu && !slashMenu.contains(e.target)) closeSlashMenu();
    });
    root.querySelectorAll('[data-writing-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('[data-writing-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.writingTab;
        const container = root.querySelector('#writing-tab-content');
        if (tab === 'sections') {
          // Re-render sections logic here or just rely on the full render
          renderInner();
        } else if (tab === 'history') {
          const snapshots = store.get.snapshots()
            .filter(s => s.projectId === activeProjectId)
            .sort((a, b) => a.timestamp - b.timestamp); // Sort ascending to reconstruct

          const displaySnaps = [...snapshots].reverse(); // Show latest first

          container.innerHTML = `
            <div class="writing-history" style="padding:10px;">
              ${displaySnaps.length ? displaySnaps.map(s => `
                <div class="history-item" style="padding:8px; background:var(--bg-surface-2); border-radius:6px; margin-bottom:8px; font-size:0.75rem;">
                  <div style="font-weight:600; margin-bottom:4px;">${new Date(s.timestamp).toLocaleString()}</div>
                  <div style="display:flex; gap:4px;">
                    <button class="btn btn-xs btn-secondary wr-restore" data-id="${s.id}">Ver/Restaurar</button>
                    <button class="btn btn-xs btn-ghost wr-del-snap" data-id="${s.id}" style="color:var(--accent-danger);"><i data-feather="trash-2" style="width:10px;height:10px;"></i></button>
                  </div>
                </div>
              `).join('') : '<div style="color:var(--text-muted); font-size:0.75rem; text-align:center;">No hay versiones guardadas.</div>'}
            </div>
          `;
          feather.replace();
          container.querySelectorAll('.wr-restore').forEach(b => {
            b.onclick = async () => {
              // To restore a delta-based snapshot, we need to find the base and apply sequence of deltas
              // For simplicity in this V2, we assume chain: Snap0(content) -> Snap1(delta) -> Snap2(delta)
              let targetContent = '';
              for (const s of snapshots) {
                if (s.content) targetContent = s.content;
                else if (s.delta) {
                  const { applyDelta } = await import('../utils/versioning.js');
                  targetContent = applyDelta(targetContent, s.delta);
                }
                if (s.id === b.dataset.id) break;
              }

              if (confirm('¿Deseas cargar esta versión en el editor? Los cambios actuales no guardados se perderán.')) {
                editor.value = targetContent;
                updateWordCount();
                showToast('Versión reconstruida y restaurada.', 'info');
              }
            };
          });
          container.querySelectorAll('.wr-del-snap').forEach(b => {
            b.onclick = async () => {
              if (confirm('¿Eliminar esta versión?')) {
                await store.dispatch('DELETE_SNAPSHOT', { id: b.dataset.id });
                btn.click(); // refresh
              }
            };
          });
        } else if (tab === 'connections') {
          const docId = activeProjectId;
          const backlinks = store.get.getBacklinks(docId) || [];
          const unlinked = store.get.getUnlinkedMentions(docId) || [];

          container.innerHTML = `
            <div class="writing-connections" style="padding:10px;">
              <h4 style="font-size:0.75rem; color:var(--text-muted); margin-bottom:10px; text-transform:uppercase;">Backlinks</h4>
              ${backlinks.length ? backlinks.map(b => `
                <div class="connection-item" style="padding:8px; background:var(--bg-surface-2); border-radius:6px; margin-bottom:8px; font-size:0.8rem; cursor:pointer;" onclick="app.navigate('writing?project=${b.id}')">
                  ${esc(b.title)}
                </div>
              `).join('') : '<div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:12px;">Sin enlaces directos.</div>'}
              
              <h4 style="font-size:0.75rem; color:var(--text-muted); margin:15px 0 10px; text-transform:uppercase;">Menciones</h4>
              ${unlinked.length ? unlinked.map(u => `
                <div class="connection-item" style="padding:8px; border:1px dashed var(--border-color); border-radius:6px; margin-bottom:8px; font-size:0.8rem; color:var(--text-secondary);">
                  ${esc(u.title)}
                </div>
              `).join('') : '<div style="color:var(--text-muted); font-size:0.75rem;">Sin menciones detectadas.</div>'}
            </div>
          `;
        }
      });
    });

    // Annotations (Contextual Comments)
    const renderAnnotations = () => {
      const annotations = store.get.annotationsByProject(activeProjectId);
      const layer = root.querySelector('#wr-annotations-layer');
      if (!layer) return;

      let text = editor.value;
      let html = esc(text);

      // Simple highlighting for annotations (this is hard without a rich editor, but let's try a basic approach)
      // For a more advanced version, we'd need a div instead of textarea or sync scrolls
      // For now, let's just show a badge/count
    };

    editor.addEventListener('mouseup', () => {
      const selection = window.getSelection().toString().trim();
      if (selection && selection.length > 3) {
        // Show a small floating button to "Annotate"
        // Implementation of floating pop-up logic
        const range = selection;
        // Simplified for now: button in header
      }
    });

    // Templates button
    root.querySelector('#wr-template-btn')?.addEventListener('click', async () => {
      const { ACADEMIC_TEMPLATES } = await import('../utils/templates.js');
      const keys = Object.keys(ACADEMIC_TEMPLATES);
      const choice = prompt(`Escoge una plantilla:\n${keys.map((k, i) => `${i + 1}. ${k}`).join('\n')}`);
      if (choice && keys[choice - 1]) {
        const template = ACADEMIC_TEMPLATES[keys[choice - 1]];
        if (confirm(`¿Aplicar plantilla "${template.title}"? Sobrescribirá el contenido actual.`)) {
          editor.value = template.content;
          root.querySelector('#wr-section-title').value = template.title;
          updateWordCount();
          showToast('Plantilla aplicada.', 'success');
        }
      }
    });

    // Snapshot button
    root.querySelector('#wr-snapshot').addEventListener('click', async () => {
      const content = editor.value;
      if (!content.trim()) return showToast('El documento está vacío.', 'warning');
      await store.dispatch('ADD_SNAPSHOT', {
        projectId: activeProjectId,
        content,
        title: root.querySelector('#wr-section-title').value.trim()
      });
    });

    // Properties Toggle
    root.querySelector('#wr-properties-btn')?.addEventListener('click', () => {
      const panel = root.querySelector('#wr-properties-panel');
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    root.querySelector('#wr-prop-toggle')?.addEventListener('click', () => {
      const panel = root.querySelector('#wr-properties-panel');
      if (panel) panel.style.display = 'none';
    });

    // Save button
    root.querySelector('#wr-save').addEventListener('click', async () => {
      const title = root.querySelector('#wr-section-title').value.trim();
      const content = editor.value;
      await store.dispatch('SAVE_DOCUMENT', {
        projectId: activeProjectId,
        title,
        content,
        updatedAt: Date.now()
      });
      showToast('Documento guardado.', 'success');
    });

    // Export button
    root.querySelector('#wr-export').addEventListener('click', () => {
      const title = root.querySelector('#wr-section-title').value.trim() || p?.name || 'manuscrito';
      const content = editor.value;
      downloadFile(`${title}.md`, content);
      showToast('Archivo exportado.', 'success');
    });

    // Bibliography Generator
    root.querySelector('#wr-gen-bib').addEventListener('click', () => {
      const tasks = store.get.tasksByProject(activeProjectId);
      const refIds = new Set();
      tasks.forEach(t => { if (t.referenceIds) t.referenceIds.forEach(id => refIds.add(id)); });

      const library = store.get.library();
      const deps = library.filter(lib => refIds.has(lib.id));

      if (!deps.length) return showToast('No hay referencias vinculadas a tareas de este proyecto.', 'warning');

      const bib = deps.map(d => {
        const authors = d.author || 'A.N.';
        const year = d.date ? new Date(d.date).getFullYear() : 's.f.';
        return `${authors} (${year}). ${d.title}. ${d.publicationTitle || ''}.`;
      }).sort().join('\n\n');

      const content = editor.value;
      editor.value = content + '\n\n# Bibliografía\n\n' + bib;
      updateWordCount();
      showToast('Bibliografía generada al final del documento.', 'success');
    });

    // Sync scrolling for annotations layer if we were using it
    editor.addEventListener('scroll', () => {
      const layer = root.querySelector('#wr-annotations-layer');
      if (layer) layer.scrollTop = editor.scrollTop;
    });

    // Auto-save every 30 seconds
    const autoSaveInterval = setInterval(async () => {
      if (!document.hidden) {
        const content = editor.value;
        if (content.trim()) {
          await store.dispatch('SAVE_DOCUMENT', {
            projectId: activeProjectId,
            content,
            title: root.querySelector('#wr-section-title').value.trim(),
            updatedAt: Date.now()
          });
        }
      }
    }, 30000);

    // Cleanup auto-save on navigation
    window.addEventListener('route:change', () => clearInterval(autoSaveInterval), { once: true });
  };

  renderInner();
}

window.addManuscriptSection = function () {
  showToast('Función de carpetas/secciones: añade una sección en el editor principal y guarda.', 'info');
};

window.renderWriting = renderWriting;
