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

export function handleSearch(q) {
    const results = document.getElementById('search-results');
    if (!results) return;
    if (!q.trim()) { results.innerHTML = `<div class="search-hint">Escribe para buscar...</div>`; return; }
    const ql = q.toLowerCase();
    const matchedProjs = store.get.projects().filter(p => p.name.toLowerCase().includes(ql)).slice(0, 4);
    const matchedTasks = store.get.allTasks().filter(t => t.title.toLowerCase().includes(ql)).slice(0, 8);

    if (!matchedTasks.length && !matchedProjs.length) {
        results.innerHTML = `<div class="search-hint">Sin resultados para "${esc(q)}".</div>`;
        return;
    }
    results.innerHTML = [
        ...matchedProjs.map(p => `
            <div class="search-result-item" onclick="router.navigate('/project/${p.id}'); closeSearch();">
                <i data-feather="briefcase" style="color:${p.color || 'var(--accent-primary)'}"></i>
                <div class="res-info"><span class="res-title">${esc(p.name)}</span><span class="res-meta">Proyecto</span></div>
            </div>`),
        ...matchedTasks.map(t => `
            <div class="search-result-item" onclick="router.navigate('/backlog'); closeSearch();">
                <i data-feather="check-square"></i>
                <div class="res-info"><span class="res-title">${esc(t.title)}</span><span class="res-meta">Tarea</span></div>
            </div>`)
    ].join('');
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
