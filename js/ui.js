/**
 * ui.js — User Interface Utilities
 * Handles sidebar, themes, search, and global UI effects.
 */

import { syncManager } from './sync.js';

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
        const themes = ['dark', 'light', 'rosel', 'celada', 'zen'];
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

export function refreshSidebarProjects() {
    const container = document.getElementById('sidebar-projects');
    if (!container) return;
    const allProjects = store.get.projects().filter(p => p.status !== 'archivado');

    const renderNode = (parentId, depth = 0) => {
        const children = allProjects.filter(p => (parentId === null ? !p.parentId : p.parentId === parentId));
        if (children.length === 0) return '';

        return children.map(p => {
            const taskCount = store.get.tasksByProject(p.id).filter(t => t.status !== 'Terminado' && t.status !== 'Archivado').length;
            return `
                <div class="nested-project-wrapper" data-id="${p.id}">
                    <a href="#/project/${p.id}" class="nav-item sidebar-project-item" data-view="project-${p.id}" data-id="${p.id}" draggable="true" style="padding-left: ${16 + (depth * 14)}px;">
                        <span class="project-dot" style="color:${p.color || 'var(--accent-primary)'}"></span>
                        <span class="nav-item-text">${esc(p.name)}</span>
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

    results.innerHTML = sections.join('');
    if (window.feather) feather.replace();
}

export function openQuickAdd() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'quick-overlay';
    overlay.innerHTML = `
        <div class="modal" style="max-width:340px;">
            <div class="modal-header"><h2>Nuevo…</h2><button class="btn btn-icon" id="qa-close"><i data-feather="x"></i></button></div>
            <div class="modal-body" style="gap:8px;">
                <button class="btn btn-secondary" onclick="document.getElementById('quick-overlay').remove(); openTaskModal();"><i data-feather="check-square"></i> Tarea</button>
                <button class="btn btn-secondary" onclick="document.getElementById('quick-overlay').remove(); openProjectModal();"><i data-feather="briefcase"></i> Proyecto</button>
                <button class="btn btn-secondary" onclick="document.getElementById('quick-overlay').remove(); openCycleModal();"><i data-feather="refresh-cw"></i> Ciclo</button>
                <button class="btn btn-secondary" onclick="document.getElementById('quick-overlay').remove(); openDecisionModal();"><i data-feather="zap"></i> Decisión</button>
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
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
}
