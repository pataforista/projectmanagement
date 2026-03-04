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
                data-action="navigate-document" data-project-id="${esc(p.id)}">
                <div class="project-card-name">${esc(p.name)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px;">Abrir documento vivo</div>
              </div>`).join('')}
          </div>
        </div>`;

            // Event delegation for document navigation
            root.querySelectorAll('[data-action="navigate-document"][data-project-id]').forEach(el => {
                el.addEventListener('click', () => router.navigate('/project/' + el.dataset.projectId + '/document'));
            });
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
        <p class="view-subtitle">Documento vivo — se guarda automáticamente. Presiona <kbd>/</kbd> para bloques.</p>
      </div>
      <div class="view-actions">
        <button class="btn btn-secondary btn-sm" id="doc-export-md-btn"><i data-feather="download"></i> Exportar MD</button>
      </div>
    </div>` : `
    <div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
      <p style="font-size:0.8rem; color:var(--text-muted);">Editor de bloques. Escribe <kbd>/</kbd> para insertar.</p>
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
            if (type === 'heading' || type === 'heading2' || type === 'paragraph' || type === 'code') {
                out.push({ type, text: el.value || el.textContent });
            } else if (type === 'callout') {
                out.push({ type, text: el.querySelector('textarea').value });
            } else if (type === 'divider') {
                out.push({ type });
            } else if (type === 'checklist') {
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

    editor.addEventListener('keydown', e => {
        if (e.key === '/') {
            const active = document.activeElement;
            if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
                // Only trigger if at start of line
                if (active.selectionStart === 0 || active.value.trim() === '') {
                    setTimeout(() => showSlashMenu(active, editor, scheduleSave), 10);
                }
            }
        }
    });

    wrap.querySelector('#doc-export-md-btn')?.addEventListener('click', () => {
        const content = getBlocks();
        const text = content.map(b => {
            if (b.type === 'heading') return `# ${b.text}`;
            if (b.type === 'heading2') return `## ${b.text}`;
            if (b.type === 'paragraph') return b.text;
            if (b.type === 'divider') return '---';
            if (b.type === 'code') return `\`\`\`\n${b.text}\n\`\`\``;
            if (b.type === 'callout') return `> [!NOTE]\n> ${b.text}`;
            if (b.type === 'checklist') return b.items.map(i => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
            return '';
        }).join('\n\n');
        downloadFile(`${p.name.toLowerCase().replace(/\s+/g, '-')}.md`, text);
    });

}

function renderDocBlocks(editor, blocks) {
    editor.innerHTML = '';
    blocks.forEach(b => addBlockToEditor(editor, b));
}

function addBlockToEditor(editor, block, insertAfterEl = null) {
    const wrap = document.createElement('div');
    wrap.className = 'doc-block';
    wrap.dataset.blockType = block.type;

    const actions = document.createElement('div');
    actions.className = 'block-actions';
    actions.innerHTML = `<button class="btn btn-icon btn-xs" title="Eliminar bloque"><i data-feather="trash-2"></i></button>`;
    actions.querySelector('button').onclick = () => {
        wrap.remove();
        editor.dispatchEvent(new Event('input')); // trigger save
    };
    wrap.appendChild(actions);

    let focusEl;

    if (block.type === 'heading' || block.type === 'heading2' || block.type === 'paragraph' || block.type === 'code') {
        const el = document.createElement('textarea');
        el.className = `doc-block-${block.type}`;
        el.value = block.text || '';
        el.dataset.blockType = block.type;
        el.placeholder = block.type === 'code' ? 'Escribe código...' : 'Escribe algo...';
        autoResize(el);
        el.addEventListener('input', () => autoResize(el));
        wrap.appendChild(el);
        focusEl = el;
    } else if (block.type === 'callout') {
        const container = document.createElement('div');
        container.className = 'doc-block-callout';
        container.innerHTML = `<i data-feather="info"></i><textarea style="flex:1;background:none;border:none;color:inherit;resize:none;" placeholder="Nota informativa..."></textarea>`;
        const tx = container.querySelector('textarea');
        tx.value = block.text || '';
        autoResize(tx);
        tx.addEventListener('input', () => autoResize(tx));
        wrap.appendChild(container);
        focusEl = tx;
    } else if (block.type === 'divider') {
        const el = document.createElement('hr');
        el.className = 'doc-block-divider';
        wrap.appendChild(el);
    } else if (block.type === 'checklist') {
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

    if (insertAfterEl) {
        insertAfterEl.after(wrap);
    } else {
        editor.appendChild(wrap);
    }

    feather.replace();
    if (focusEl) focusEl.focus();
}

function showSlashMenu(triggerEl, editor, onSelected) {
    const rect = triggerEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;

    const options = [
        { label: 'Título', type: 'heading', icon: 'type' },
        { label: 'Subtítulo', type: 'heading2', icon: 'type' },
        { label: 'Párrafo', type: 'paragraph', icon: 'align-left' },
        { label: 'Checklist', type: 'checklist', icon: 'check-square' },
        { label: 'Nota / Callout', type: 'callout', icon: 'info' },
        { label: 'Código', type: 'code', icon: 'code' },
        { label: 'Divisor', type: 'divider', icon: 'minus' },
    ];

    menu.innerHTML = options.map(opt => `
    <div class="slash-item" data-type="${opt.type}">
      <i data-feather="${opt.icon}"></i>
      <span>${opt.label}</span>
    </div>
  `).join('');

    document.body.appendChild(menu);
    feather.replace();

    const close = () => menu.remove();

    menu.querySelectorAll('.slash-item').forEach(item => {
        item.onclick = () => {
            const type = item.dataset.type;
            const parentBlock = triggerEl.closest('.doc-block');
            // Remove the trigger slash
            if (triggerEl.value.startsWith('/')) triggerEl.value = triggerEl.value.slice(1);

            if (triggerEl.value.trim() === '' && parentBlock) {
                // Replace current block if empty
                const blockContent = type === 'checklist' ? { type, items: [{ text: '', done: false }] } : { type, text: '' };
                addBlockToEditor(editor, blockContent, parentBlock);
                parentBlock.remove();
            } else {
                addBlockToEditor(editor, { type, text: '' }, parentBlock);
            }
            onSelected();
            close();
        };
    });

    // Close on click outside
    setTimeout(() => {
        window.addEventListener('click', close, { once: true });
    }, 10);
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
