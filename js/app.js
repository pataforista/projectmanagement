/**
 * app.js — Bootstrap: init DB → load store → register SW → init router + search
 * All view modules must be loaded before this file.
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ── 0. App Lock (Auth) — Nexus Fortress ───────────────────────────────────
    const authOverlay = document.getElementById('auth-overlay');
    const authForm = document.getElementById('auth-form');
    const authPassword = document.getElementById('auth-password');
    const authSubtitle = document.getElementById('auth-subtitle');

    // Import crypto layer (available as ES module or global import)
    const cryptoLayer = await import('./utils/crypto.js').catch(() => null);

    // ── Secure hash via Web Crypto SHA-256 ──
    const hashStr = async (str) => {
        if (cryptoLayer) return cryptoLayer.hashPassword(str);
        // Fallback for environments without module support (should not happen)
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    // ── Legacy Hash (djb2) for Migration ──
    const legacyHash = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return String(hash);
    };

    // ── Brute-Force Protection ──
    const LOCKOUT_KEY = 'nexus_lockout';
    const ATTEMPT_KEY = 'nexus_attempts';
    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MS = 30_000; // 30 seconds

    const isLockedOut = () => {
        const lockoutUntil = Number(localStorage.getItem(LOCKOUT_KEY) || 0);
        return Date.now() < lockoutUntil;
    };

    const getRemainingLockout = () => {
        const lockoutUntil = Number(localStorage.getItem(LOCKOUT_KEY) || 0);
        return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
    };

    const recordFailedAttempt = () => {
        const attempts = Number(localStorage.getItem(ATTEMPT_KEY) || 0) + 1;
        localStorage.setItem(ATTEMPT_KEY, String(attempts));
        if (attempts >= MAX_ATTEMPTS) {
            localStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
            localStorage.setItem(ATTEMPT_KEY, '0');
        }
        return attempts;
    };

    const clearAttempts = () => {
        localStorage.removeItem(ATTEMPT_KEY);
        localStorage.removeItem(LOCKOUT_KEY);
    };

    const generateRecoveryCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        // ✅ SECURITY FIX: Use cryptographically secure random values (OS entropy)
        // Math.random() is a predictable PRNG — never use it for security tokens.
        const randomBytes = crypto.getRandomValues(new Uint8Array(16));
        let code = '';
        for (let i = 0; i < 16; i++) {
            if (i > 0 && i % 4 === 0) code += '-';
            code += chars[randomBytes[i] % chars.length];
        }
        return code;
    };

    const normalizeCode = str => str.toUpperCase().replace(/[^A-Z0-9]/g, '');

    let savedHash = localStorage.getItem('workspace_lock_hash');



    await new Promise(resolve => {
        if (!authOverlay) return resolve();

        const authForgotContainer = document.getElementById('auth-forgot-container');
        const authForgotLink = document.getElementById('auth-forgot-link');
        const authRecoveryPanel = document.getElementById('auth-recovery-panel');
        const authRecoveryCode = document.getElementById('auth-recovery-code');
        const authRecoveryBack = document.getElementById('auth-recovery-back');
        const authRecoverySubmit = document.getElementById('auth-recovery-submit');
        const authNewpwdPanel = document.getElementById('auth-newpwd-panel');
        const authNewpwdInput = document.getElementById('auth-newpwd-input');
        const authNewpwdSubmit = document.getElementById('auth-newpwd-submit');
        const authCodeDisplay = document.getElementById('auth-code-display');
        const authCodeValue = document.getElementById('auth-code-value');
        const authCodeCopy = document.getElementById('auth-code-copy');
        const authCodeDone = document.getElementById('auth-code-done');

        const showCodeDisplay = (code, onDone) => {
            authCodeValue.textContent = code;
            authCodeDisplay.style.display = 'flex';
            authCodeCopy.onclick = () => {
                navigator.clipboard.writeText(code).catch(() => { });
                authCodeCopy.textContent = '¡Copiado!';
                setTimeout(() => authCodeCopy.textContent = 'Copiar codigo', 2000);
            };
            authCodeDone.onclick = onDone;
        };

        if (!savedHash) {
            authOverlay.classList.add('open');
            authSubtitle.textContent = "Crea una contraseña maestra para bloquear tu Workspace.";
            authForm.onsubmit = async (e) => {
                e.preventDefault();
                const pwd = authPassword.value.trim();
                if (pwd.length < 4) {
                    authPassword.style.border = '1px solid var(--accent-warning)';
                    setTimeout(() => authPassword.style.border = '', 1000);
                    return;
                }
                // Hash password with SHA-256 + salted PBKDF2-derived salt
                const hash = await hashStr(pwd);
                const recoveryCode = generateRecoveryCode();
                const recoveryHash = await hashStr(normalizeCode(recoveryCode));
                localStorage.setItem('workspace_lock_hash', hash);
                localStorage.setItem('workspace_recovery_hash', recoveryHash);
                // Derive encryption key and activate the crypto layer
                if (cryptoLayer) await cryptoLayer.unlock(pwd);
                authForm.style.display = 'none';
                authSubtitle.textContent = "Guarda tu codigo de recuperacion.";
                showCodeDisplay(recoveryCode, () => {
                    authOverlay.classList.remove('open');
                    resolve();
                });
            };
        } else {
            authOverlay.classList.add('open');
            authSubtitle.textContent = "Ingresa tu contraseña para acceder.";

            if (localStorage.getItem('workspace_recovery_hash') && authForgotContainer) {
                authForgotContainer.style.display = 'block';
            }

            authForm.onsubmit = async (e) => {
                e.preventDefault();

                if (isLockedOut()) {
                    const secs = getRemainingLockout();
                    authSubtitle.textContent = `⚠️ Demasiados intentos. Espera ${secs}s.`;
                    authPassword.value = '';
                    return;
                }

                const pwd = authPassword.value.trim();
                const inputHash = await hashStr(pwd);
                let isMatch = (inputHash === savedHash);

                // ── Legacy Migration Check ──
                if (!isMatch && savedHash.length < 60) {
                    const legHash = legacyHash(pwd);
                    if (legHash === savedHash) {
                        console.log('[Fortress] Legacy hash matched. Upgrading to Nexus Fortress (SHA-256)...');
                        const newHash = await hashStr(pwd);
                        const recoveryCode = generateRecoveryCode();
                        const recoveryHash = await hashStr(normalizeCode(recoveryCode));
                        localStorage.setItem('workspace_lock_hash', newHash);
                        localStorage.setItem('workspace_recovery_hash', recoveryHash);
                        isMatch = true;
                        // Show recovery code because we just generated it
                        authForm.style.display = 'none';
                        authSubtitle.textContent = "Seguridad actualizada. Guarda tu nuevo codigo.";
                        showCodeDisplay(recoveryCode, () => {
                            authOverlay.classList.remove('open');
                            resolve();
                        });
                        if (cryptoLayer) await cryptoLayer.unlock(pwd);
                        return; // Exit here as showCodeDisplay will resolve
                    }
                }

                if (isMatch) {
                    clearAttempts();
                    if (cryptoLayer) await cryptoLayer.unlock(pwd);
                    authOverlay.classList.remove('open');
                    resolve();
                } else {
                    const attempts = recordFailedAttempt();
                    authPassword.style.border = '1px solid var(--accent-danger)';
                    authPassword.value = '';
                    if (isLockedOut()) {
                        authSubtitle.textContent = `⚠️ Bloqueado por 30s tras ${MAX_ATTEMPTS} intentos fallidos.`;
                    } else {
                        authSubtitle.textContent = "Contraseña incorrecta.";
                    }
                    setTimeout(() => authPassword.style.border = '', 1000);
                }
            };

            if (authForgotLink) {
                authForgotLink.onclick = () => {
                    authForm.style.display = 'none';
                    if (authForgotContainer) authForgotContainer.style.display = 'none';
                    authSubtitle.textContent = "Ingresa tu codigo de recuperacion.";
                    authRecoveryPanel.style.display = 'flex';
                    authRecoveryCode.focus();
                };
            }

            if (authRecoveryBack) {
                authRecoveryBack.onclick = () => {
                    authRecoveryPanel.style.display = 'none';
                    authNewpwdPanel.style.display = 'none';
                    authRecoveryCode.value = '';
                    authRecoveryCode.style.border = '';
                    authForm.style.display = 'flex';
                    if (authForgotContainer) authForgotContainer.style.display = 'block';
                    authSubtitle.textContent = "Ingresa tu contraseña para acceder.";
                };
            }

            if (authRecoverySubmit) {
                authRecoverySubmit.onclick = async () => {
                    const savedRecoveryHash = localStorage.getItem('workspace_recovery_hash');
                    const entered = normalizeCode(authRecoveryCode.value.trim());
                    const inputHash = await hashStr(entered);
                    if (savedRecoveryHash && inputHash === savedRecoveryHash) {
                        authRecoveryPanel.style.display = 'none';
                        authSubtitle.textContent = "Crea una nueva contraseña.";
                        authNewpwdPanel.style.display = 'flex';
                        authNewpwdInput.focus();
                    } else {
                        authRecoveryCode.style.border = '1px solid var(--accent-danger)';
                        authRecoveryCode.value = '';
                        setTimeout(() => authRecoveryCode.style.border = '', 1000);
                    }
                };
            }

            if (authNewpwdSubmit) {
                authNewpwdSubmit.onclick = async () => {
                    const newPwd = authNewpwdInput.value.trim();
                    if (newPwd.length < 4) {
                        authNewpwdInput.style.border = '1px solid var(--accent-warning)';
                        setTimeout(() => authNewpwdInput.style.border = '', 1000);
                        return;
                    }
                    const newRecoveryCode = generateRecoveryCode();
                    const newLockHash = await hashStr(newPwd);
                    const newRecHash = await hashStr(normalizeCode(newRecoveryCode));
                    localStorage.setItem('workspace_lock_hash', newLockHash);
                    localStorage.setItem('workspace_recovery_hash', newRecHash);
                    authNewpwdPanel.style.display = 'none';
                    authSubtitle.textContent = "¡Contraseña restablecida! Guarda tu nuevo codigo.";
                    showCodeDisplay(newRecoveryCode, () => {
                        authOverlay.classList.remove('open');
                        resolve();
                    });
                    if (cryptoLayer) await cryptoLayer.unlock(newPwd);
                };
            }
        }
    });

    // ── 0.1. Auto-Lock & Global Lock ───────────────────────────────────────────
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && localStorage.getItem('autolock_enabled') === 'true') {
            if (localStorage.getItem('workspace_lock_hash')) {
                location.reload();
            }
        }
    });

    window.lockWorkspace = () => {
        if (localStorage.getItem('workspace_lock_hash')) {
            location.reload();
        } else {
            if (window.showToast) showToast('Primero configura una contraseña en Perfil.', 'info');
        }
    };

    // ── 1. Initialize IndexedDB ────────────────────────────────────────────────
    try {
        await initDB();
    } catch (e) {
        console.warn('[Boot] IndexedDB init failed:', e);
    }

    // ── 2. Load & seed store ───────────────────────────────────────────────────
    try {
        await store.load();
        await store.seedIfEmpty();
    } catch (e) {
        console.warn('[Boot] Store load failed:', e);
    }

    // ── 3. Register service worker ─────────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.onupdatefound = () => {
                const newSW = reg.installing;
                newSW.onstatechange = () => {
                    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                        if (window.showToast) showToast('Actualización lista. Reiniciando...', 'info');
                    }
                };
            };
        }).catch(() => { });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            // ✅ FIX: Never reload immediately — the user might have unsaved work.
            // Show a non-blocking toast and let them decide when to refresh.
            const reload = () => window.location.reload();
            if (window.showToast) {
                // Create an actionable toast with an "Update" button
                const container = document.getElementById('toast-container');
                if (container) {
                    const el = document.createElement('div');
                    el.className = 'toast toast-info';
                    el.style.cssText = 'display:flex;align-items:center;gap:10px;';
                    el.innerHTML = `<span>Nueva versión disponible.</span>
                        <button onclick="window.location.reload()" style="background:var(--accent-primary);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.8rem;font-weight:600;">Actualizar</button>`;
                    container.appendChild(el);
                } else {
                    showToast('Nueva versión disponible. Recarga para actualizar.', 'info');
                }
            } else {
                // Fallback: confirm dialog if toast system isn't ready yet
                if (confirm('Nueva versión disponible. ¿Actualizar ahora?')) reload();
            }
        });
    }

    // Global reset utility for stuck caches
    window.resetAppCache = async () => {
        if (!confirm('¿Seguro que quieres restablecer la App? Se borrará el caché y la configuración local.')) return;
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let reg of regs) await reg.unregister();
        }
        const cacheNames = await caches.keys();
        for (let name of cacheNames) await caches.delete(name);
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/';
    };

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
        .on('matrix', (root) => renderMatrix(root))
        .on('writing', (root) => renderWriting(root))
        .on('graph', (root) => renderGraph(root))
        .on('medical', (root) => renderMedical(root))
        .on('integrations', (root) => renderIntegrations(root))
        .on('canvas', (root) => renderCanvas && renderCanvas(root))
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
    if (window.ChatManager) ChatManager.init();

    // ── 8. Init UI Toggles (Theme/Sidebar) ─────────────────────────────────────
    initUIToggles();

    // ── 9. Try sync ────────────────────────────────────────────────────────────
    try {
        await syncManager.init();
        await syncManager.pull();
    } catch (e) {
        console.warn('[Sync] Could not connect on boot:', e);
    }

    // ── 10. Global Action Listeners ────────────────────────────────────────────
    document.getElementById('btn-integrations')?.addEventListener('click', () => router.navigate('/integrations'));
    document.getElementById('btn-search')?.addEventListener('click', openSearch);
    document.getElementById('btn-new-global')?.addEventListener('click', openQuickAdd);
    document.getElementById('btn-help')?.addEventListener('click', openHelpModal);
    document.getElementById('search-input')?.addEventListener('input', e => handleSearch(e.target.value));

    // ── Buttons migrated from inline onclick (CSP prep) ────────────────────────
    document.getElementById('btn-sync-toggle')?.addEventListener('click', () => syncManager.openPanel());
    document.getElementById('btn-export')?.addEventListener('click', () => exportData());
    document.getElementById('btn-lock')?.addEventListener('click', () => {
        if (window.lockWorkspace) lockWorkspace();
    });

    document.getElementById('search-overlay')?.addEventListener('click', e => {
        if (e.target.id === 'search-overlay') closeSearch();
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
    });

    // ── 11. Remove page shimmer once app is ready ──────────────────────────────
    const shimmer = document.getElementById('page-shimmer');
    if (shimmer) {
        setTimeout(() => {
            shimmer.classList.add('hidden');
            setTimeout(() => shimmer.remove(), 400);
        }, 300);
    }

    // ── 12. Set tooltips & breadcrumbs ─────────────────────────────────────────
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
        const text = el.textContent.trim();
        if (text) el.setAttribute('data-tooltip', text);
    });

    const breadcrumbEl = document.getElementById('breadcrumb-current');
    if (breadcrumbEl) {
        const viewLabels = {
            dashboard: 'Dashboard', projects: 'Proyectos', backlog: 'Backlog',
            cycles: 'Ciclos', board: 'Tablero', calendar: 'Calendario',
            decisions: 'Decisiones', library: 'Biblioteca', matrix: 'Matriz',
            writing: 'Escritura', medical: 'Médico', integrations: 'Integraciones',
            logs: 'Actividad', canvas: 'Canvas', document: 'Documento',
        };
        const updateBreadcrumb = () => {
            const view = location.hash.replace('#/', '').split('/')[0] || 'dashboard';
            breadcrumbEl.textContent = viewLabels[view] || view;
        };
        window.addEventListener('hashchange', updateBreadcrumb);
        updateBreadcrumb();
    }

    if (window.feather) feather.replace();

});

// ── Global Helper Functions ──────────────────────────────────────────────────

function initUIToggles() {
    const container = document.querySelector('.app-container');
    const sidebarBtn = document.getElementById('btn-sidebar-toggle');
    const themeBtn = document.getElementById('btn-theme-toggle');

    // Sidebar Toggle
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        container?.classList.add('collapsed-sidebar');
    }

    sidebarBtn?.addEventListener('click', () => {
        const isCollapsed = container?.classList.toggle('collapsed-sidebar');
        localStorage.setItem('sidebar-collapsed', !!isCollapsed);
    });

    // Theme Toggle
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
        if (window.openProfileModal) openProfileModal();
    });
}

function refreshSidebarProjects() {
    // ✅ FIX: The HTML element is id="sidebar-projects" — no "-list" suffix.
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

    // Re-bind listeners
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
function handleProjectDragOver(e) { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; }
function handleProjectDragEnter() { this.classList.add('drag-over'); }
function handleProjectDragLeave() { this.classList.remove('drag-over'); }
function handleProjectDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragSrcEl !== this) {
        const srcId = dragSrcEl.dataset.id;
        const tgtId = this.dataset.id;

        // Logical nesting: if Ctrl is held, nest it. Otherwise reorder.
        if (e.ctrlKey) {
            store.dispatch('UPDATE_PROJECT', { id: srcId, parentId: tgtId });
            showToast('Proyecto anidado.', 'info');
        } else {
            // Reordering logic
            const all = store.get.projects().filter(p => p.status !== 'archivado');
            const srcIdx = all.findIndex(p => p.id === srcId);
            const tgtIdx = all.findIndex(p => p.id === tgtId);
            if (srcIdx > -1 && tgtIdx > -1) {
                const [moved] = all.splice(srcIdx, 1);
                all.splice(tgtIdx, 0, moved);
                // Also reset parentId if reordering at top level? Or keep it?
                // For now, let's just reorder and clear parentId to bring to same level
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

// Search Logic
function openSearch() {
    document.getElementById('search-overlay')?.classList.add('open');
    document.getElementById('search-input')?.focus();
    handleSearch('');
}
function closeSearch() {
    document.getElementById('search-overlay')?.classList.remove('open');
    if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
}
function handleSearch(q) {
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

// Global Quick Add
function openQuickAdd() {
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

// Export Helper
async function exportData() {
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
        if (window.showToast) showToast('Datos exportados con éxito');
    } catch (err) {
        if (window.showToast) showToast('Error al exportar datos', 'error');
    }
}

// UI Effects
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.5;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px;`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
});

// PWA Logic Extensions
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = document.getElementById('pwa-install-banner');
    if (banner && !localStorage.getItem('pwa-install-dismissed')) {
        banner.style.display = 'flex';
        if (window.feather) feather.replace();
    }
});

const btnInstall = document.getElementById('pwa-install-btn');
const btnDismiss = document.getElementById('pwa-install-dismiss');

if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'none';
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
        }
    });
}
if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.display = 'none';
        localStorage.setItem('pwa-install-dismissed', 'true');
    });
}

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
});

// Expose globals
window.refreshCurrentView = () => { /* Logic to refresh active view if needed */ };
window.exportData = exportData;
window.openQuickAdd = openQuickAdd;
window.openSearch = openSearch;
window.closeSearch = closeSearch;
