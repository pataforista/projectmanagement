/**
 * views/document.js — Living document editor per project
 */

let _docSaveTimer = null;

function renderDocumentView(root, params) {
    const { projectId } = params;
    const projects = store.get.projects();

    // Standalone view (from nav) vs embedded in project tab
    const isStandalone = !params._embedded;

    if (isStandalone) {
        if (!projectId && projects.length === 0) {
            root.innerHTML = `<div class="view-inner">${emptyState('file-text', 'Crea un proyecto primero para tener un documento vivo.')}</div>`;
            return;
        }

        // If no projectId, show project selector
        if (!projectId) {
            root.innerHTML = `
        <div class="view-inner">
          <div class="view-header">
            <div class="view-header-text"><h1>Documentos</h1><p class="view-subtitle">Documentos vivos de cada proyecto.</p></div>
          </div>
          <div class="projects-grid">
            ${projects.map(p => `
              <div class="project-card" style="--project-color:${p.color || 'var(--accent-primary)'}; cursor:pointer;"
                onclick="router.navigate('/project/${p.id}/document')">
                <div class="project-card-name">${esc(p.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Abrir documento vivo</div>
              </div>`).join('')}
          </div>
        </div>`;
            return;
        }
    }

    const p = store.get.projectById(projectId);
    const doc = store.get.documentByProject(projectId);
    const blocks = doc?.content || defaultDocContent(p);

    const wrap = document.createElement('div');
    wrap.className = isStandalone ? 'view-inner' : '';
    wrap.innerHTML = `
    ${isStandalone ? `
    <div class="view-header">
      <div class="view-header-text">
        <h1>Documento: ${esc(p?.name || 'Proyecto')}</h1>
        <p class="view-subtitle">Documento vivo — se guarda automáticamente.</p>
      </div>
      <div class="view-actions">
        <button class="btn btn-secondary btn-sm" id="doc-add-heading-btn"><i data-feather="type"></i> Título</button>
        <button class="btn btn-secondary btn-sm" id="doc-add-para-btn"><i data-feather="align-left"></i> Párrafo</button>
        <button class="btn btn-secondary btn-sm" id="doc-add-check-btn"><i data-feather="check-square"></i> Checklist</button>
        <button class="btn btn-secondary btn-sm" id="doc-add-div-btn"><i data-feather="minus"></i> Divisor</button>
      </div>
    </div>` : `
    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" id="doc-add-heading-btn"><i data-feather="type"></i> + Título</button>
      <button class="btn btn-ghost btn-sm" id="doc-add-para-btn"><i data-feather="align-left"></i> + Párrafo</button>
      <button class="btn btn-ghost btn-sm" id="doc-add-check-btn"><i data-feather="check-square"></i> + Checklist</button>
    </div>`}
    <div class="doc-editor" id="doc-editor"></div>
    <div class="doc-autosave" id="doc-autosave">Guardado ✓</div>`;

    root.appendChild(wrap);

    if (isStandalone) feather.replace();

    const editor = wrap.querySelector('#doc-editor');
    renderDocBlocks(editor, blocks);

    function getBlocks() {
        const out = [];
        editor.querySelectorAll('[data-block-type]').forEach(el => {
            const type = el.dataset.blockType;
            if (type === 'heading') out.push({ type, text: el.value || el.textContent });
            else if (type === 'heading2') out.push({ type, text: el.value || el.textContent });
            else if (type === 'paragraph') out.push({ type, text: el.value || el.textContent });
            else if (type === 'divider') out.push({ type });
            else if (type === 'checklist') {
                const items = [];
                el.querySelectorAll('.doc-checklist-item').forEach(li => {
                    items.push({
                        text: li.querySelector('input[type=text]')?.value || '',
                        done: li.querySelector('input[type=checkbox]')?.checked || false,
                    });
                });
                out.push({ type, items });
            }
        });
        return out;
    }

    function scheduleSave() {
        clearTimeout(_docSaveTimer);
        _docSaveTimer = setTimeout(async () => {
            const content = getBlocks();
            await store.dispatch('SAVE_DOCUMENT', { projectId, content });
            const indicator = wrap.querySelector('#doc-autosave');
            if (indicator) {
                indicator.classList.add('visible');
                setTimeout(() => indicator.classList.remove('visible'), 2000);
            }
        }, 1500);
    }

    editor.addEventListener('input', scheduleSave);
    editor.addEventListener('change', scheduleSave);

    // Add block buttons
    wrap.querySelector('#doc-add-heading-btn')?.addEventListener('click', () => {
        addBlockToEditor(editor, { type: 'heading2', text: 'Nuevo título...' });
        scheduleSave();
    });
    wrap.querySelector('#doc-add-para-btn')?.addEventListener('click', () => {
        addBlockToEditor(editor, { type: 'paragraph', text: '' });
        scheduleSave();
    });
    wrap.querySelector('#doc-add-check-btn')?.addEventListener('click', () => {
        addBlockToEditor(editor, { type: 'checklist', items: [{ text: '', done: false }] });
        scheduleSave();
    });
    wrap.querySelector('#doc-add-div-btn')?.addEventListener('click', () => {
        addBlockToEditor(editor, { type: 'divider' });
        scheduleSave();
    });
}

function renderDocBlocks(editor, blocks) {
    editor.innerHTML = '';
    blocks.forEach(b => addBlockToEditor(editor, b));
}

function addBlockToEditor(editor, block) {
    const wrap = document.createElement('div');
    wrap.className = 'doc-block';
    wrap.dataset.blockType = block.type;

    if (block.type === 'heading') {
        const el = document.createElement('textarea');
        el.className = 'doc-block-heading';
        el.dataset.blockType = 'heading';
        el.value = block.text || '';
        el.rows = 1;
        el.placeholder = 'Título principal...';
        autoResize(el);
        el.addEventListener('input', () => autoResize(el));
        wrap.appendChild(el);
    } else if (block.type === 'heading2') {
        const el = document.createElement('textarea');
        el.className = 'doc-block-heading2';
        el.dataset.blockType = 'heading2';
        el.value = block.text || '';
        el.rows = 1;
        el.placeholder = 'Subtítulo...';
        autoResize(el);
        el.addEventListener('input', () => autoResize(el));
        wrap.appendChild(el);
    } else if (block.type === 'paragraph') {
        const el = document.createElement('textarea');
        el.className = 'doc-block-paragraph';
        el.dataset.blockType = 'paragraph';
        el.value = block.text || '';
        el.rows = 2;
        el.placeholder = 'Escribe algo...';
        autoResize(el);
        el.addEventListener('input', () => autoResize(el));
        wrap.appendChild(el);
    } else if (block.type === 'divider') {
        const el = document.createElement('hr');
        el.className = 'doc-block-divider';
        el.dataset.blockType = 'divider';
        wrap.appendChild(el);
    } else if (block.type === 'checklist') {
        wrap.dataset.blockType = 'checklist';
        (block.items || []).forEach(item => {
            const li = document.createElement('div');
            li.className = 'doc-checklist-item';
            li.innerHTML = `
        <input type="checkbox" ${item.done ? 'checked' : ''}>
        <input type="text" value="${esc(item.text || '')}" placeholder="Ítem..." style="flex:1;background:none;border:none;font-size:0.875rem; color: var(--text-primary);">`;
            wrap.appendChild(li);
        });
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-ghost btn-sm';
        addBtn.style.marginTop = '4px';
        addBtn.innerHTML = '<i data-feather="plus"></i> Ítem';
        addBtn.addEventListener('click', () => {
            const li = document.createElement('div');
            li.className = 'doc-checklist-item';
            li.innerHTML = `<input type="checkbox"><input type="text" placeholder="Ítem..." style="flex:1;background:none;border:none;font-size:0.875rem; color: var(--text-primary);">`;
            wrap.insertBefore(li, addBtn);
            feather.replace();
            li.querySelector('input[type=text]')?.focus();
        });
        wrap.appendChild(addBtn);
    }

    editor.appendChild(wrap);
    feather.replace();
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function defaultDocContent(p) {
    if (!p) return [{ type: 'heading', text: 'Documento' }];
    return [
        { type: 'heading', text: p.name },
        { type: 'paragraph', text: p.goal || '' },
        { type: 'heading2', text: 'Propósito' },
        { type: 'paragraph', text: '' },
        { type: 'heading2', text: 'Pendientes sustantivos' },
        { type: 'checklist', items: [{ text: 'Definir alcance', done: false }] },
        { type: 'divider' },
        { type: 'heading2', text: 'Decisiones tomadas' },
        { type: 'paragraph', text: '' },
    ];
}
