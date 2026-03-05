/**
 * views/writing.js — Manuscript Mode (Scrivener-like)
 */

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
              ${writingProjects.map(prj => `<option value="${prj.id}" ${prj.id === activeProjectId ? 'selected' : ''}>${esc(prj.name)}</option>`).join('')}
            </select>
          </div>
          
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
            <div class="editor-actions">
              <button class="btn btn-icon" title="Exportar .md" id="wr-export"><i data-feather="download"></i></button>
              <button class="btn btn-primary btn-sm" id="wr-save">Guardar</button>
            </div>
          </header>
          <div class="editor-body">
            <textarea id="wr-editor" class="manuscript-textarea" placeholder="Empieza a escribir aquí...">${esc(doc.content || '')}</textarea>
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

    // Bindings
    root.querySelector('#wr-proj-select').addEventListener('change', (e) => {
      activeProjectId = e.target.value;
      localStorage.setItem('active_writing_project', activeProjectId);
      renderInner();
    });

    editor.addEventListener('input', updateWordCount);

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
