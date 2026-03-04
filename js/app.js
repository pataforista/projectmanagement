/**
 * app.js — Bootstrap: init DB → load store → register SW → init router + search
 * All view modules must be loaded before this file.
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ── 0. App Lock (Auth) ─────────────────────────────────────────────────────
    const authOverlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const authPassword = document.getElementById('auth-password');
    const authSubtitle = document.getElementById('auth-subtitle');

    const hashStr = str => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
        return hash.toString();
    };

    let savedHash = localStorage.getItem('workspace_lock_hash');

    await new Promise(resolve => {
        if (!authOverlay) return resolve(); // Fallback if HTML is missing

        if (!savedHash) {
            authOverlay.classList.add('open');
            authSubtitle.textContent = "Crea una contraseña maestra para bloquear tu Workspace.";
            authForm.onsubmit = (e) => {
                e.preventDefault();
                const pwd = authPassword.value.trim();
                if (pwd.length < 4) {
                    authPassword.style.border = '1px solid var(--accent-warning)';
                    setTimeout(() => authPassword.style.border = '', 1000);
                    return;
                }
                localStorage.setItem('workspace_lock_hash', hashStr(pwd));
                authOverlay.classList.remove('open');
                resolve();
            };
        } else {
            authOverlay.classList.add('open');
            authSubtitle.textContent = "Ingresa tu contraseña para acceder.";
            authForm.onsubmit = (e) => {
                e.preventDefault();
                const pwd = authPassword.value.trim();
                if (hashStr(pwd) === savedHash) {
                    authOverlay.classList.remove('open');
                    resolve();
                } else {
                    authPassword.style.border = '1px solid var(--accent-danger)';
                    authPassword.value = '';
                    setTimeout(() => authPassword.style.border = '', 1000);
                }
            };
        }
    });

    // ── 1. Initialize IndexedDB (fail-safe: routing still works without it) ────
    try {
        await initDB();
    } catch (e) {
        console.warn('[Boot] IndexedDB init failed — continuing without persistence:', e);
        // IndexedDB failed (e.g. VersionError from stale cache). App runs in-memory until
        // user clears site data. Instruct user on next build if this happens repeatedly.
    }

    // ── 2. Load & seed store ───────────────────────────────────────────────────
    try {
        await store.load();
        await store.seedIfEmpty();
    } catch (e) {
        console.warn('[Boot] Store load failed — running with empty state:', e);
    }

    // ── 3. Register service worker ─────────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    }

    // ── 4. Register all views with router ──────────────────────────────────────
    router
        .on('dashboard', (root) => renderDashboard(root))
        .on('projects', (root, params) => renderProjects(root, params))
        .on('backlog', (root) => renderBacklog(root))
        .on('cycles', (root) => renderCycles(root))
        .on('board', (root) => renderBoard(root))
        .on('calendar', (root) => renderCalendar(root))
        .on('decisions', (root) => renderDecisions(root))
        .on('library', (root) => renderLibrary(root))
        .on('logs', (root) => renderLogs(root))
        .on('document', (root, params) => renderDocumentView(root, params))
        .on('project', (root, params) => renderProjectDetail(root, params));

    // ── 5. Wire sidebar project list ───────────────────────────────────────────
    refreshSidebarProjects();
    store.subscribe('projects', refreshSidebarProjects);

    // ── 6. Init router ─────────────────────────────────────────────────────────
    router.init();

    // ── 7. Load User Profile & Notifications ──────────────────────────────────
    if (window.updateUserProfileUI) updateUserProfileUI();
    if (window.NotificationsManager) NotificationsManager.init();

    // ── 8. Init UI Toggles (Theme/Sidebar) ─────────────────────────────────────
    initUIToggles();

    // ── 9. Try sync (non-blocking, safe to fail without credentials) ───────────
    try {
        await syncManager.init();
        await syncManager.pull();
    } catch (e) {
        console.warn('[Sync] Could not connect on boot (no credentials?):', e);
    }
});



// ── 8. Wire search button ──────────────────────────────────────────────────
document.getElementById('btn-search')?.addEventListener('click', openSearch);
document.getElementById('btn-new-global')?.addEventListener('click', openQuickAdd);
document.getElementById('btn-help')?.addEventListener('click', openHelpModal);
document.getElementById('search-input')?.addEventListener('input', e => handleSearch(e.target.value));
document.getElementById('search-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'search-overlay') closeSearch();
});

document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
});

feather.replace();

// ── Refresh sidebar project list (Drag & Drop) ───────────────────────────────
let dragSrcEl = null;

function handleProjectDragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.style.opacity = '0.4';
}
function handleProjectDragOver(e) {
    if (e.preventDefault) { e.preventDefault(); }
    e.dataTransfer.dropEffect = 'move';
    return false;
}
function handleProjectDragEnter(e) { this.classList.add('drag-over'); }
function handleProjectDragLeave(e) { this.classList.remove('drag-over'); }
function handleProjectDrop(e) {
    if (e.stopPropagation) { e.stopPropagation(); }
    if (dragSrcEl !== this) {
        const srcId = dragSrcEl.dataset.id;
        const tgtId = this.dataset.id;
        const projects = store.get.projects().filter(p => p.status !== 'archivado');
        const srcIdx = projects.findIndex(p => p.id === srcId);
        const tgtIdx = projects.findIndex(p => p.id === tgtId);
        if (srcIdx > -1 && tgtIdx > -1) {
            const [moved] = projects.splice(srcIdx, 1);
            projects.splice(tgtIdx, 0, moved);
            const updates = projects.map((p, i) => ({ id: p.id, order: i }));
            store.dispatch('UPDATE_PROJECT_ORDERS', updates);
        }
    }
    return false;
}
function handleProjectDragEnd(e) {
    this.style.opacity = '1';
    document.querySelectorAll('.sidebar-project-item').forEach(item => item.classList.remove('drag-over'));
}

function refreshSidebarProjects() {
    const container = document.getElementById('sidebar-projects');
    if (!container) return;
    const projects = store.get.projects().filter(p => p.status !== 'archivado');
    container.innerHTML = projects.map(p => {
        const isRestricted = p.visibility === 'restricted';
        const isUnlocked = store.isProjectUnlocked(p.id);
        const taskCount = store.get.tasksByProject(p.id).filter(t => t.status !== 'Terminado' && t.status !== 'Archivado').length;
        return `
        <a href="#/project/${p.id}" class="nav-item sidebar-project-item ${isRestricted && !isUnlocked ? 'project-locked-item' : ''}"
          data-view="project-${p.id}" data-id="${p.id}" draggable="true"
          data-restricted="${isRestricted}" data-unlocked="${isUnlocked}">
          <span class="project-dot" style="color:${p.color || 'var(--accent-primary)'}"></span>
          ${esc(p.name)}
          ${isRestricted && !isUnlocked ? `<i data-feather="lock" style="width:11px;height:11px;color:var(--accent-warning);margin-left:2px;flex-shrink:0;"></i>` : ''}
          <span class="nav-count">${taskCount}</span>
        </a>`;
    }).join('');

    feather.replace();

    // Handle click on restricted projects — show unlock modal
    container.querySelectorAll('.sidebar-project-item').forEach(item => {
        const isRestricted = item.dataset.restricted === 'true';
        const isUnlocked = item.dataset.unlocked === 'true';
        if (isRestricted && !isUnlocked) {
            item.addEventListener('click', e => {
                e.preventDefault();
                const projectId = item.dataset.id;
                const project = store.get.projectById(projectId);
                if (project) {
                    openProjectUnlockModal(project, () => {
                        router.navigate(`/project/${projectId}`);
                    });
                }
            });
        }

        item.addEventListener('dragstart', handleProjectDragStart);
        item.addEventListener('dragenter', handleProjectDragEnter);
        item.addEventListener('dragover', handleProjectDragOver);
        item.addEventListener('dragleave', handleProjectDragLeave);
        item.addEventListener('drop', handleProjectDrop);
        item.addEventListener('dragend', handleProjectDragEnd);
    });
}

// ── Refresh current view after mutations ─────────────────────────────────────
function refreshCurrentView() {
    const route = router.current;
    if (!route) return;
    const root = document.getElementById('app-root');
    if (!root) return;

    const { viewName, params } = route;
    const handlers = {
        dashboard: root => renderDashboard(root),
        projects: root => renderProjects(root, params),
        backlog: root => renderBacklog(root),
        cycles: root => renderCycles(root),
        board: root => renderBoard(root),
        calendar: root => renderCalendar(root),
        decisions: root => renderDecisions(root),
        library: root => renderLibrary(root),
        canvas: root => renderCanvas(root),
        document: root => renderDocumentView(root, params),
        project: root => renderProjectDetail(root, params),
    };

    root.innerHTML = '';
    if (handlers[viewName]) handlers[viewName](root);
}

// ── Quick Add (global + button) ───────────────────────────────────────────────
function openQuickAdd() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'quick-overlay';

    overlay.innerHTML = `
    <div class="modal" style="max-width:340px;">
      <div class="modal-header">
        <h2>Crear nuevo…</h2>
        <button class="btn btn-icon" id="qa-close"><i data-feather="x"></i></button>
      </div>
      <div class="modal-body" style="gap:8px;">
        <button class="btn btn-secondary" id="qa-task"    style="justify-content:flex-start;gap:12px;padding:12px 16px;"><i data-feather="check-square"></i> Tarea</button>
        <button class="btn btn-secondary" id="qa-project" style="justify-content:flex-start;gap:12px;padding:12px 16px;"><i data-feather="briefcase"></i> Proyecto</button>
        <button class="btn btn-secondary" id="qa-cycle"   style="justify-content:flex-start;gap:12px;padding:12px 16px;"><i data-feather="refresh-cw"></i> Ciclo</button>
        <button class="btn btn-secondary" id="qa-decision"style="justify-content:flex-start;gap:12px;padding:12px 16px;"><i data-feather="zap"></i> Decisión</button>
      </div>
    </div>`;

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    feather.replace();

    overlay.querySelector('#qa-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#qa-task').addEventListener('click', () => { overlay.remove(); openTaskModal(); });
    overlay.querySelector('#qa-project').addEventListener('click', () => { overlay.remove(); openProjectModal(); });
    overlay.querySelector('#qa-cycle').addEventListener('click', () => { overlay.remove(); openCycleModal(); });
    overlay.querySelector('#qa-decision').addEventListener('click', () => { overlay.remove(); openDecisionModal(); });
}

// ── Search ────────────────────────────────────────────────────────────────────
function openSearch() {
    document.getElementById('search-overlay').classList.add('open');
    document.getElementById('search-input')?.focus();
    handleSearch('');
}

function closeSearch() {
    document.getElementById('search-overlay').classList.remove('open');
    if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
}

function handleSearch(q) {
    const results = document.getElementById('search-results');
    if (!results) return;

    if (!q.trim()) {
        results.innerHTML = `<div class="search-hint">Escribe para buscar tareas y proyectos…</div>`;
        return;
    }

    const ql = q.toLowerCase();

    // Search in Projects
    const matchedProjs = store.get.projects().filter(p =>
        p.name.toLowerCase().includes(ql) ||
        (p.description && p.description.toLowerCase().includes(ql))
    ).slice(0, 4);

    // Search in Tasks (including subtasks)
    const allTasks = store.get.allTasks();
    const matchedTasks = allTasks.filter(t =>
        t.title.toLowerCase().includes(ql) ||
        (t.description && t.description.toLowerCase().includes(ql)) ||
        (t.subtasks && t.subtasks.some(st => st.title.toLowerCase().includes(ql))) ||
        (t.tags && t.tags.some(tag => tag.toLowerCase().includes(ql)))
    ).slice(0, 8);

    if (!matchedTasks.length && !matchedProjs.length) {
        results.innerHTML = `<div class="search-hint">Sin resultados para "${esc(q)}".</div>`;
        return;
    }

    results.innerHTML = [
        ...matchedProjs.map(p => `
      <div class="search-result-item" onclick="router.navigate('/project/${p.id}'); closeSearch();">
        <i data-feather="briefcase" style="width:14px;height:14px;color:${p.color || 'var(--accent-primary)'};flex-shrink:0;"></i>
        <div class="res-info">
          <span class="res-title">${esc(p.name)}</span>
          <span class="res-meta">Proyecto</span>
        </div>
      </div>`),
        ...matchedTasks.map(t => {
            const proj = store.get.projectById(t.projectId);
            return `
      <div class="search-result-item" onclick="router.navigate('/backlog'); closeSearch();">
        <i data-feather="check-square" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>
        <div class="res-info">
          <span class="res-title">${esc(t.title)}</span>
          ${proj ? `<span class="res-meta">en ${esc(proj.name)}</span>` : ''}
        </div>
      </div>`;
        }),
    ].join('');

    feather.replace();
}

/**
 * Backup entire store as JSON
 */
async function exportData() {
    try {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            projects: store.get.projects(),
            tasks: store.get.allTasks(),
            cycles: store.get.cycles(),
            decisions: store.get.decisions()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `workspace-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Datos exportados con éxito');
    } catch (err) {
        console.error('Export failed:', err);
        showToast('Error al exportar datos', 'error');
    }
}

function initUIToggles() {
    const container = document.querySelector('.app-container');
    const sidebarBtn = document.getElementById('btn-sidebar-toggle');
    const themeBtn = document.getElementById('btn-theme-toggle');

    // Sidebar Toggle
    const savedSidebar = localStorage.getItem('sidebar-collapsed');
    if (savedSidebar === 'true') {
        container.classList.add('collapsed-sidebar');
    }

    sidebarBtn?.addEventListener('click', () => {
        const isCollapsed = container.classList.toggle('collapsed-sidebar');
        localStorage.setItem('sidebar-collapsed', isCollapsed);
    });

    // Theme Toggle
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    themeBtn?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('app-theme', newTheme);
    });

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebar = document.querySelector('.sidebar');

    function toggleMobileMenu() {
        sidebar?.classList.toggle('open');
        sidebarOverlay?.classList.toggle('open');
    }

    mobileMenuBtn?.addEventListener('click', toggleMobileMenu);
    sidebarOverlay?.addEventListener('click', toggleMobileMenu);

    // Close mobile menu on navigation
    document.querySelectorAll('.nav-item').forEach(el => {
        el.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar?.classList.remove('open');
                sidebarOverlay?.classList.remove('open');
            }
        });
    });

    // Profile Click
    const profileBtn = document.getElementById('btn-user-profile');
    profileBtn?.addEventListener('click', () => {
        if (window.openProfileModal) openProfileModal();
    });
}

window.refreshCurrentView = refreshCurrentView;
window.refreshSidebarProjects = refreshSidebarProjects;
window.openQuickAdd = openQuickAdd;
window.openSearch = openSearch;
window.closeSearch = closeSearch;
window.handleSearch = handleSearch;
window.initUIToggles = initUIToggles;
window.exportData = exportData;

// ── Scroll to Top Button ────────────────────────────────────────────────────
(function () {
    const scrollBtn = document.createElement('button');
    scrollBtn.id = 'scroll-to-top';
    scrollBtn.className = 'btn';
    scrollBtn.title = 'Volver arriba';
    scrollBtn.innerHTML = '<i data-feather="arrow-up"></i>';
    scrollBtn.style.cssText = `
        position: fixed; bottom: 28px; right: 28px; z-index: 400;
        width: 38px; height: 38px; border-radius: 50%;
        background: var(--accent-primary); color: #fff;
        border: none; cursor: pointer; padding: 0;
        box-shadow: 0 4px 14px var(--accent-primary-glow);
        opacity: 0; transform: translateY(8px) scale(0.85);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: none;
        display: flex; align-items: center; justify-content: center;
    `;
    document.body.appendChild(scrollBtn);
    feather.replace();

    const contentView = document.querySelector('.content-view');
    if (contentView) {
        contentView.addEventListener('scroll', () => {
            const show = contentView.scrollTop > 300;
            scrollBtn.style.opacity = show ? '1' : '0';
            scrollBtn.style.transform = show ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.85)';
            scrollBtn.style.pointerEvents = show ? 'auto' : 'none';
        });
    }

    scrollBtn.addEventListener('click', () => {
        const contentView = document.querySelector('.content-view');
        if (contentView) contentView.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Scroll to top on route change
    window.addEventListener('route:change', () => {
        const contentView = document.querySelector('.content-view');
        if (contentView) contentView.scrollTo({ top: 0, behavior: 'instant' });
    });
})();

// ── Global cycle card close binding (for all views) ──────────────────────────
document.addEventListener('click', async e => {
    const closeBtn = e.target.closest('.cycle-close-btn');
    if (closeBtn && !closeBtn.disabled) {
        const id = closeBtn.dataset.id;
        if (id) {
            await store.dispatch('UPDATE_CYCLE', { id, status: 'cerrado' });
            refreshCurrentView();
        }
    }

    const editBtn = e.target.closest('.cycle-edit-btn');
    if (editBtn) {
        const id = editBtn.dataset.id;
        const cycle = store.get.allCycles().find(c => c.id === id);
        if (cycle) openCycleModal(cycle);
    }

    const deleteBtn = e.target.closest('.cycle-delete-btn');
    if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        const cycle = store.get.allCycles().find(c => c.id === id);
        if (cycle) {
            confirmDialog(`¿Eliminar el ciclo "${cycle.name}"? Las tareas no se eliminarán.`, async () => {
                await store.dispatch('DELETE_CYCLE', { id });
                refreshCurrentView();
            });
        }
    }

    const decDelBtn = e.target.closest('.dec-del-btn');
    if (decDelBtn) {
        const id = decDelBtn.dataset.id;
        const decision = store.get.allDecisions().find(d => d.id === id);
        if (decision) {
            confirmDialog(`¿Eliminar la decisión "${decision.title}"?`, async () => {
                await store.dispatch('DELETE_DECISION', { id });
                refreshCurrentView();
            });
        }
    }

    const decEditBtn = e.target.closest('.dec-edit-btn');
    if (decEditBtn) {
        const id = decEditBtn.dataset.id;
        const decision = store.get.allDecisions().find(d => d.id === id);
        if (decision) openDecisionModal(decision);
    }

    // Task item hover delete button
    const taskDelBtn = e.target.closest('.task-del-btn');
    if (taskDelBtn) {
        e.stopPropagation();
        const taskId = taskDelBtn.dataset.taskId;
        const task = store.get.allTasks().find(t => t.id === taskId);
        if (task) {
            confirmDialog(`¿Eliminar la tarea "${task.title}"?`, async () => {
                await store.dispatch('DELETE_TASK', { id: taskId });
                refreshCurrentView();
            });
        }
    }
});

// Show task delete button on hover (for task-item elements)
document.addEventListener('mouseover', e => {
    const item = e.target.closest('.task-item');
    if (item) {
        const btn = item.querySelector('.task-del-btn');
        if (btn) btn.style.opacity = '1';
    }
});
document.addEventListener('mouseout', e => {
    const item = e.target.closest('.task-item');
    if (item && !item.contains(e.relatedTarget)) {
        const btn = item.querySelector('.task-del-btn');
        if (btn) btn.style.opacity = '0';
    }
});

// ── Ripple Effect ──────────────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
});

// ── Page loading bar ──────────────────────────────────────────────────────────
(function () {
    const bar = document.createElement('div');
    bar.id = 'page-loader';
    bar.style.cssText = `
        position:fixed;top:0;left:0;height:2px;width:100%;
        background:linear-gradient(90deg,var(--accent-primary),var(--accent-teal));
        z-index:9999;transform-origin:left;transform:scaleX(0);
        transition:transform 0.3s ease,opacity 0.3s ease;opacity:1;pointer-events:none;
    `;
    document.body.appendChild(bar);

    window.addEventListener('route:change', () => {
        bar.style.transform = 'scaleX(0.3)';
        bar.style.opacity = '1';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                bar.style.transform = 'scaleX(1)';
                setTimeout(() => { bar.style.opacity = '0'; bar.style.transform = 'scaleX(0)'; }, 350);
            });
        });
    });
})();

// ── PWA Install prompt ─────────────────────────────────────────────────────────
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredInstallPrompt = e;
    // Show a subtle install badge in the sidebar after 3 seconds
    setTimeout(() => {
        const profile = document.querySelector('.user-profile');
        if (profile && !document.getElementById('install-hint')) {
            const hint = document.createElement('div');
            hint.id = 'install-hint';
            hint.innerHTML = `<i data-feather="download"></i> Instalar app`;
            hint.style.cssText = `display:flex;align-items:center;gap:6px;font-size:0.72rem;color:var(--accent-teal);cursor:pointer;padding:2px 0;animation:slideInUp 0.3s ease;`;
            hint.addEventListener('click', async () => {
                if (_deferredInstallPrompt) {
                    _deferredInstallPrompt.prompt();
                    const { outcome } = await _deferredInstallPrompt.userChoice;
                    if (outcome === 'accepted') hint.remove();
                    _deferredInstallPrompt = null;
                }
            });
            profile.insertAdjacentElement('afterend', hint);
            feather.replace();
        }
    }, 3000);
});

