/**
 * ui.js — User Interface Utilities
 * Handles sidebar, themes, search, and global UI effects.
 */

import { syncManager } from './sync.js';
import { showSessionSwitcher } from './ui/session-switcher.js';

export function initUIToggles() {
    const container = document.querySelector('.app-container');
    const sidebarBtn = document.getElementById('btn-sidebar-toggle');
    const themeBtn = document.getElementById('btn-theme-toggle');

    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        container?.classList.add('collapsed-sidebar');
    }

    sidebarBtn?.addEventListener('click', () => {
        const isCollapsed = container?.classList.toggle('collapsed-sidebar');
        localStorage.setItem('sidebar-collapsed', !!isCollapsed);
    });

    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeBtn?.addEventListener('click', () => {
        let currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const themes = ['dark', 'light', 'rosel', 'celada', 'zen', 'analog-horror', 'moomins', 'pokemon', 'zelda', 'ukiyo-e'];
        const currentIdx = themes.indexOf(currentTheme);
        const newTheme = themes[(currentIdx + 1) % themes.length];
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
        if (window.showToast) window.showToast('Tema cambiado a: ' + newTheme, 'info');
    });

    // Mobile Menu
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.sidebar');

    const toggleMobileMenu = () => {
        sidebar?.classList.toggle('open');
        sidebarOverlay?.classList.toggle('open');
    };

    mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
    sidebarOverlay?.addEventListener('click', toggleMobileMenu);

    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar?.classList.remove('open');
                sidebarOverlay?.classList.remove('open');
            }
        });
    });

    document.getElementById('btn-user-profile')?.addEventListener('click', () => {
        if (window.openProfileModal) window.openProfileModal();
    });
}

/**
 * OPCIÓN 3: Initialize Session Switcher in topbar
 * Allows users to quickly switch between multiple Google accounts
 */
export function initSessionSwitcher() {
    const btn = document.getElementById('btn-session-switcher');
    if (!btn) return;

    // Show button if SessionManager is available
    if (window.SessionManager) {
        btn.style.display = 'flex';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showSessionSwitcher();
        });

        // Show button tooltip with keyboard shortcut
        btn.title = 'Cambiar sesión o cuenta (Alt+S)';

        // Keyboard shortcut: Alt+S to open session switcher
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 's') {
                e.preventDefault();
                showSessionSwitcher();
            }
        });
    }
}

/**
 * Initializes the workspace mode toggle (Individual ↔ Equipo).
 * Persists choice in localStorage and applies data-workspace-mode on <body>.
 */
export function initWorkspaceMode() {
    const saved = localStorage.getItem('workspace-mode') || 'solo';
    _applyMode(saved);

    document.getElementById('mode-btn-solo')?.addEventListener('click', () => _applyMode('solo'));
    document.getElementById('mode-btn-team')?.addEventListener('click', () => _applyMode('team'));
}

function _applyMode(mode) {
    document.body.setAttribute('data-workspace-mode', mode);
    localStorage.setItem('workspace-mode', mode);

    // Toggle pill active state
    document.getElementById('mode-btn-solo')?.classList.toggle('active', mode === 'solo');
    document.getElementById('mode-btn-team')?.classList.toggle('active', mode === 'team');

    // Update or insert the mode badge in the topbar breadcrumb
    const breadcrumbs = document.querySelector('.breadcrumbs');
    let badge = document.getElementById('mode-topbar-badge');
    if (breadcrumbs) {
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'mode-topbar-badge';
            badge.className = 'mode-badge';
            breadcrumbs.appendChild(badge);
        }
        if (mode === 'solo') {
            badge.innerHTML = '<i data-feather="user"></i> Individual';
        } else {
            badge.innerHTML = '<i data-feather="users"></i> Equipo';
        }
        if (window.feather) feather.replace();
    }

    // If current view is now hidden by mode filter, navigate to dashboard
    const currentView = window.router?.current?.viewName;
    if (currentView) {
        const activeNavItem = document.querySelector(`.nav-item[data-view="${currentView}"][data-scope]`);
        if (activeNavItem) {
            const scope = activeNavItem.dataset.scope;
            if ((scope === 'solo' && mode === 'team') || (scope === 'team' && mode === 'solo')) {
                window.router.navigate('/dashboard');
            }
        }
    }

    if (window.showToast) {
        const label = mode === 'solo' ? 'Individual' : 'Equipo';
        window.showToast(`Modo ${label} activado`, 'info');
    }
}

export function refreshSidebarProjects() {
    const container = document.getElementById('sidebar-projects');
    if (!container) return;
    const allProjects = store.get.projects().filter(p => p.status !== 'archivado');

    const renderNode = (parentId, depth = 0) => {
        const children = allProjects.filter(p => (parentId === null ? !p.parentId : p.parentId === parentId));
        if (children.length === 0) return '';

        return children.map(p => {
            const taskCount = store.get.tasksByProject(p.id).filter(t => t.status !== 'Terminado' && t.status !== 'Archivado').length;
            const hasChildren = allProjects.some(c => c.parentId === p.id);
            return `
                <div class="nested-project-wrapper" data-id="${p.id}" data-depth="${depth}">
                    <a href="#/project/${p.id}" class="nav-item sidebar-project-item" data-view="project-${p.id}" data-id="${p.id}" draggable="true"
                       style="padding-left: ${16 + (depth * 14)}px; --depth-offset: ${16 + depth * 14}px;"
                       title="${esc(p.name)}${depth > 0 ? ' (subproyecto)' : ''}">
                        <span class="project-dot" style="color:${p.color || 'var(--accent-primary)'}"></span>
                        <span class="nav-item-text">${esc(p.name)}</span>
                        ${hasChildren ? `<span style="font-size:0.65rem;color:var(--text-muted);margin-left:2px;opacity:0.7;">▾</span>` : ''}
                        ${taskCount > 0 ? `<span class="nav-count">${taskCount}</span>` : ''}
                    </a>
                    <div class="project-children">
                        ${renderNode(p.id, depth + 1)}
                    </div>
                </div>
            `;
        }).join('');
    };

    container.innerHTML = renderNode(null);
    container.querySelectorAll('.sidebar-project-item').forEach(item => {
        item.addEventListener('dragstart', handleProjectDragStart);
        item.addEventListener('dragover', handleProjectDragOver);
        item.addEventListener('drop', handleProjectDrop);
        item.addEventListener('dragend', handleProjectDragEnd);
    });
}

// Drag & Drop Helpers
let dragSrcEl = null;

function handleProjectDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.style.opacity = '0.4';
}

function handleProjectDragOver(e) { 
    if (e.preventDefault) e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move'; 
    return false; 
}

function handleProjectDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragSrcEl !== this) {
        const srcId = dragSrcEl.dataset.id;
        const tgtId = this.dataset.id;
        if (e.ctrlKey) {
            store.dispatch('UPDATE_PROJECT', { id: srcId, parentId: tgtId });
        } else {
            const all = store.get.projects().filter(p => p.status !== 'archivado');
            const srcIdx = all.findIndex(p => p.id === srcId);
            const tgtIdx = all.findIndex(p => p.id === tgtId);
            if (srcIdx > -1 && tgtIdx > -1) {
                const [moved] = all.splice(srcIdx, 1);
                all.splice(tgtIdx, 0, moved);
                const targetParent = all[tgtIdx].parentId || null;
                store.dispatch('UPDATE_PROJECT', { id: srcId, parentId: targetParent });
                store.dispatch('UPDATE_PROJECT_ORDERS', all.map((p, i) => ({ id: p.id, order: i })));
            }
        }
    }
    return false;
}

function handleProjectDragEnd() {
    this.style.opacity = '1';
    document.querySelectorAll('.sidebar-project-item').forEach(item => item.classList.remove('drag-over'));
}

export function openSearch() {
    document.getElementById('search-overlay')?.classList.add('open');
    document.getElementById('search-input')?.focus();
    handleSearch('');
}

export function closeSearch() {
    document.getElementById('search-overlay')?.classList.remove('open');
    if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
}

export async function handleSearch(q) {
    const results = document.getElementById('search-results');
    if (!results) return;
    if (!q.trim()) { results.innerHTML = `<div class="search-hint">Escribe para buscar tareas, proyectos, documentos y notas…</div>`; return; }
    const ql = q.toLowerCase();

    // ── Búsqueda básica (en memoria, sin async) ──────────────────────────────
    const matchedProjs = store.get.projects().filter(p => p.name.toLowerCase().includes(ql)).slice(0, 4);
    const matchedTasks = store.get.allTasks().filter(t =>
        t.title.toLowerCase().includes(ql) ||
        (t.description || '').toLowerCase().includes(ql)
    ).slice(0, 6);

    // ── Check if user wants semantic search (natural language patterns) ────────
    const hasNLPatterns = /about|related|para|con|on|like|que|que tenga|search for/i.test(q);
    let semanticResults = [];
    if (hasNLPatterns && window.ollamaApi) {
      try {
        const allItems = [
          ...store.get.projects().map(p => ({ ...p, name: p.name, description: p.goal })),
          ...store.get.allTasks().map(t => ({ ...t, name: t.title, description: t.description }))
        ];
        const results = await window.ollamaApi.semanticSearch(q, allItems.slice(0, 30));
        semanticResults = results.slice(0, 4);
      } catch (e) {
        console.log('[Search] Semantic search not available:', e.message);
      }
    }

    // ── Full-text en documentos (desde dbAPI para incluir contenido) ──────────
    let matchedDocs = [];
    let matchedWiki = [];
    try {
        const allDocs = await window.dbAPI.getAll('documents');
        allDocs.filter(d => !d._deleted && d.wikiType === undefined).forEach(d => {
            const titleMatch = (d.title || '').toLowerCase().includes(ql);
            const contentMatch = (d.content || '').toLowerCase().includes(ql);
            if (titleMatch || contentMatch) {
                // Get a short excerpt around the match
                let excerpt = '';
                if (contentMatch && !titleMatch) {
                    const idx = (d.content || '').toLowerCase().indexOf(ql);
                    const start = Math.max(0, idx - 40);
                    excerpt = '…' + (d.content || '').substring(start, start + 100).replace(/\n/g, ' ') + '…';
                }
                matchedDocs.push({ ...d, _excerpt: excerpt });
            }
        });
        matchedDocs = matchedDocs.slice(0, 5);

        // ── Full-text en notas Wiki ────────────────────────────────────────────
        allDocs.filter(d => !d._deleted && d.wikiType && d.wikiType.startsWith('wiki-')).forEach(d => {
            const titleMatch = (d.title || '').toLowerCase().includes(ql);
            const contentMatch = (d.content || '').toLowerCase().includes(ql);
            if (titleMatch || contentMatch) {
                let excerpt = '';
                if (contentMatch && !titleMatch) {
                    const idx = (d.content || '').toLowerCase().indexOf(ql);
                    const start = Math.max(0, idx - 30);
                    excerpt = '…' + (d.content || '').substring(start, start + 80).replace(/\n/g, ' ') + '…';
                }
                matchedWiki.push({ ...d, _excerpt: excerpt });
            }
        });
        matchedWiki = matchedWiki.slice(0, 4);
    } catch (_e) { /* DB not ready yet */ }

    // ── Búsqueda en biblioteca ─────────────────────────────────────────────────
    const matchedLib = (store.get.library ? store.get.library() : []).filter(lib =>
        (lib.title || '').toLowerCase().includes(ql) ||
        (lib.author || '').toLowerCase().includes(ql) ||
        (lib.citeKey || '').toLowerCase().includes(ql)
    ).slice(0, 3);

    const total = matchedProjs.length + matchedTasks.length + matchedDocs.length + matchedWiki.length + matchedLib.length;

    if (!total) {
        results.innerHTML = `<div class="search-hint">Sin resultados para "<b>${esc(q)}</b>".</div>`;
        return;
    }

    // Highlight matching term in text
    const highlight = (text) => {
        if (!text) return '';
        const safe = esc(text);
        const re = new RegExp(`(${esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return safe.replace(re, '<mark style="background:var(--accent-primary); color:white; border-radius:2px; padding:0 2px;">$1</mark>');
    };

    const sections = [];

    if (matchedProjs.length) {
        sections.push(`<div class="search-section-label">Proyectos</div>`);
        sections.push(...matchedProjs.map(p => `
            <div class="search-result-item" onclick="router.navigate('/project/${p.id}'); closeSearch();">
                <i data-feather="briefcase" style="color:${p.color || 'var(--accent-primary)'}"></i>
                <div class="res-info">
                    <span class="res-title">${highlight(p.name)}</span>
                    <span class="res-meta">Proyecto · ${p.status || ''}</span>
                </div>
            </div>`));
    }

    if (matchedTasks.length) {
        sections.push(`<div class="search-section-label">Tareas</div>`);
        sections.push(...matchedTasks.map(t => `
            <div class="search-result-item" onclick="router.navigate('/backlog'); closeSearch();">
                <i data-feather="check-square"></i>
                <div class="res-info">
                    <span class="res-title">${highlight(t.title)}</span>
                    <span class="res-meta">Tarea · ${t.status || ''}</span>
                </div>
            </div>`));
    }

    if (matchedDocs.length) {
        sections.push(`<div class="search-section-label">Documentos</div>`);
        sections.push(...matchedDocs.map(d => `
            <div class="search-result-item" onclick="router.navigate('/writing'); closeSearch();">
                <i data-feather="file-text" style="color:var(--accent-teal)"></i>
                <div class="res-info">
                    <span class="res-title">${highlight(d.title || 'Documento sin título')}</span>
                    ${d._excerpt ? `<span class="res-meta" style="font-style:italic;">${highlight(d._excerpt)}</span>` : '<span class="res-meta">Documento de escritura</span>'}
                </div>
            </div>`));
    }

    if (matchedWiki.length) {
        sections.push(`<div class="search-section-label">Wiki</div>`);
        sections.push(...matchedWiki.map(d => `
            <div class="search-result-item" onclick="router.navigate('/notes-wiki'); closeSearch();">
                <i data-feather="book-open" style="color:var(--accent-warning)"></i>
                <div class="res-info">
                    <span class="res-title">${highlight(d.title || 'Página sin título')}</span>
                    ${d._excerpt ? `<span class="res-meta" style="font-style:italic;">${highlight(d._excerpt)}</span>` : `<span class="res-meta">${d.wikiType === 'wiki-book' ? 'Libro' : d.wikiType === 'wiki-chapter' ? 'Capítulo' : 'Página'} de Wiki</span>`}
                </div>
            </div>`));
    }

    if (matchedLib.length) {
        sections.push(`<div class="search-section-label">Biblioteca</div>`);
        sections.push(...matchedLib.map(lib => `
            <div class="search-result-item" onclick="router.navigate('/library'); closeSearch();">
                <i data-feather="book" style="color:var(--accent-primary)"></i>
                <div class="res-info">
                    <span class="res-title">${highlight(lib.title || 'Recurso sin título')}</span>
                    <span class="res-meta">${lib.author ? highlight(lib.author) : 'Biblioteca'}</span>
                </div>
            </div>`));
    }

    // ── Semantic search results (AI-powered) ────────────────────────────────────
    if (semanticResults.length > 0) {
        sections.push(`<div class="search-section-label" style="margin-top:12px; display:flex; align-items:center; gap:6px;">
            <i data-feather="zap" style="width:14px; height:14px; color:var(--accent-warning);"></i> Búsqueda Semántica
        </div>`);
        sections.push(...semanticResults.map(r => {
            const item = r.item;
            const isProject = item.type && Object.keys(PROJECT_TYPES || {}).includes(item.type);
            const isTask = item.status && !item.type;
            const typeLabel = isProject ? 'Proyecto' : isTask ? 'Tarea' : 'Elemento';
            const icon = isProject ? 'briefcase' : 'check-square';
            const navUrl = isProject ? `/project/${item.id}` : '/backlog';
            return `
            <div class="search-result-item" onclick="router.navigate('${navUrl}'); closeSearch();" style="opacity:0.85;">
                <i data-feather="${icon}" style="color:var(--accent-warning)"></i>
                <div class="res-info">
                    <span class="res-title">${esc(item.name)}</span>
                    <span class="res-meta">${typeLabel} · Relevancia: ${r.score}%</span>
                </div>
            </div>`;
        }));
    }

    results.innerHTML = sections.join('');
    if (window.feather) feather.replace();
}

export function openQuickAdd() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'quick-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:340px; border-radius:12px; overflow:hidden;">
            <div class="modal-header" style="padding:16px 20px; border-bottom:1px solid var(--border-color);">
                <h2 style="font-size:1.1rem; font-weight:700;">Captura Rápida</h2>
                <button class="btn btn-icon" id="qa-close"><i data-feather="x"></i></button>
            </div>
            <div class="modal-body" style="padding:16px; gap:8px;">
                <button class="btn btn-secondary btn-sm" style="width:100%; justify-content:flex-start;" onclick="document.getElementById('quick-overlay').remove(); openTaskDetail({title: '', status: 'Capturado', priority: 'media'});">
                    <i data-feather="check-square" style="width:16px; height:16px;"></i> Nueva Tarea
                </button>
                <button class="btn btn-secondary btn-sm" style="width:100%; justify-content:flex-start;" onclick="document.getElementById('quick-overlay').remove(); openProjectModal();">
                    <i data-feather="briefcase" style="width:16px; height:16px;"></i> Nuevo Proyecto
                </button>
                <button class="btn btn-secondary btn-sm" style="width:100%; justify-content:flex-start;" onclick="document.getElementById('quick-overlay').remove(); openCycleModal();">
                    <i data-feather="refresh-cw" style="width:16px; height:16px;"></i> Nuevo Ciclo
                </button>
                <button class="btn btn-secondary btn-sm" style="width:100%; justify-content:flex-start;" onclick="document.getElementById('quick-overlay').remove(); openDecisionModal();">
                    <i data-feather="zap" style="width:16px; height:16px;"></i> Nueva Decisión
                </button>
            </div>
        </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    if (window.feather) feather.replace();
    overlay.querySelector('#qa-close')?.addEventListener('click', () => overlay.remove());
}

export async function exportData() {
    try {
        const data = {
            version: '1.0', exportedAt: new Date().toISOString(),
            projects: store.get.projects(), tasks: store.get.allTasks(),
            cycles: store.get.cycles(), decisions: store.get.decisions()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workspace-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (window.showToast) window.showToast('Datos exportados con éxito');
    } catch (err) {
        if (window.showToast) window.showToast('Error al exportar datos', 'error');
    }
}

/**
 * Updates the topbar sync status widget dot + label.
 * Called by syncManager events and on boot.
 */
export function updateTopbarSyncWidget() {
    const dot = document.getElementById('sync-widget-dot');
    const label = document.getElementById('sync-widget-label');
    if (!dot || !label) return;

    const isOnline = navigator.onLine;
    const status = window.syncManager?.getChatSyncStatus
        ? window.syncManager.getChatSyncStatus()
        : { linked: false, online: isOnline, pending: 0 };

    // Also try the main sync indicator if getChatSyncStatus is not specific enough
    const syncState = document.getElementById('sync-state-label')?.textContent?.toLowerCase() || '';

    if (!isOnline) {
        dot.className = 'sync-status-dot offline';
        label.textContent = 'Sin conexión';
    } else if (!status.linked) {
        dot.className = 'sync-status-dot offline';
        label.textContent = 'Local';
    } else if ((status.pending || 0) > 0 || syncState.includes('sincronizando')) {
        dot.className = 'sync-status-dot pending';
        label.textContent = 'Sincronizando…';
    } else if (syncState.includes('error') || syncState.includes('fallo')) {
        dot.className = 'sync-status-dot error';
        label.textContent = 'Error sync';
    } else {
        dot.className = 'sync-status-dot synced';
        label.textContent = 'Sincronizado';
    }
}

export function initGlobalEffects() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;
        const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 1.5;
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.cssText = `width:${size}px;height:${size}px;left:${x - rect.left - size / 2}px;top:${y - rect.top - size / 2}px;`;
        
        // MITIGATION: Browser extensions like Bitwarden/LastPass sometimes crash when 
        // they see rapid DOM mutations like our ripple effect. We tag it to be ignored.
        ripple.setAttribute('data-autofill-ignore', 'true');
        ripple.setAttribute('data-lpignore', 'true');
        ripple.setAttribute('data-form-type', 'other');
        
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
}
