import {
    initUIToggles,
    initSessionSwitcher,
    initWorkspaceMode,
    refreshSidebarProjects,
    openSearch,
    closeSearch,
    handleSearch,
    openQuickAdd,
    exportData,
    initGlobalEffects,
    updateTopbarSyncWidget,
    initCommandPalette
} from './ui.js';
import { StorageManager } from './utils/storage-manager.js';
import { AccountChangeDetector } from './utils/account-detector.js';
import { SessionManager } from './utils/session-manager.js';
import { companion as ollamaCompanion } from './components/ollama-companion.js';

document.addEventListener('DOMContentLoaded', async () => {
    initGlobalEffects();
    initCommandPalette();
    ollamaCompanion.init();

    // ── OPCIÓN 2: Initialize Storage Manager ──────────────────────────────────
    // Migrate session keys from localStorage to sessionStorage for per-tab isolation
    try {
        StorageManager.migrateSessionKeys();
        StorageManager.validateSecurityBoundaries();
        console.log('[Boot] Storage Manager initialized');
    } catch (e) {
        console.warn('[Boot] Storage migration failed:', e);
    }

    // ── OPCIÓN 3: Initialize Session Manager with IndexedDB ─────────────────
    // Make SessionManager globally available
    window.SessionManager = SessionManager;

    // ── OPCIÓN 1: Initialize Account Change Detector ────────────────────────
    // Monitor for Google account switches
    window.AccountChangeDetector = AccountChangeDetector;
    try {
        AccountChangeDetector.init(async (changeEvent) => {
            if (changeEvent.type === 'account_switched') {
                console.log(`[Boot] Account switch detected: ${changeEvent.oldEmail} → ${changeEvent.newEmail}`);
                if (window.syncManager && window.syncManager.handleAccountSwitch) {
                    await syncManager.handleAccountSwitch(changeEvent.oldEmail, changeEvent.newEmail);
                }
            } else if (changeEvent.type === 'token_expired') {
                console.log('[Boot] Google token expired');
            }
        });
        console.log('[Boot] Account Change Detector initialized');
    } catch (e) {
        console.warn('[Boot] Account detector init failed:', e);
    }

    // ── 0. Pre-init syncManager (needed before auth block to read config) ──────
    // FIX: syncManager.init() se mueve aquí para que getConfig() funcione
    // dentro del bloque de auth sin race condition.
    try {
        await syncManager.init();
    } catch (e) {
        console.warn('[Boot] syncManager pre-init failed:', e);
    }

    // ── Listen for account switch events from SessionManager or AccountDetector
    window.addEventListener('account:switched', (e) => {
        console.log(`[Boot] Account switched event received: ${e.detail.newEmail}`);
        if (window.updateUserProfileUI) updateUserProfileUI();
        if (window.refreshSidebarProjects) refreshSidebarProjects();
    });

    window.addEventListener('session:switched', (e) => {
        console.log(`[Boot] Session switched event received: ${e.detail.email}`);
        if (window.updateUserProfileUI) updateUserProfileUI();
    });

    window.addEventListener('session:logout', () => {
        console.log('[Boot] Logout event received');
        location.reload();
    });

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
    // Separate counters for the recovery code flow to avoid sharing state
    const RECOVERY_LOCKOUT_KEY = 'nexus_recovery_lockout';
    const RECOVERY_ATTEMPT_KEY = 'nexus_recovery_attempts';
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

    // SECURITY FIX: Brute-force protection for the recovery code flow.
    const isRecoveryLockedOut = () => {
        const lockoutUntil = Number(localStorage.getItem(RECOVERY_LOCKOUT_KEY) || 0);
        return Date.now() < lockoutUntil;
    };

    const getRecoveryRemainingLockout = () => {
        const lockoutUntil = Number(localStorage.getItem(RECOVERY_LOCKOUT_KEY) || 0);
        return Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
    };

    const recordFailedRecoveryAttempt = () => {
        const attempts = Number(localStorage.getItem(RECOVERY_ATTEMPT_KEY) || 0) + 1;
        localStorage.setItem(RECOVERY_ATTEMPT_KEY, String(attempts));
        if (attempts >= MAX_ATTEMPTS) {
            localStorage.setItem(RECOVERY_LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
            localStorage.setItem(RECOVERY_ATTEMPT_KEY, '0');
        }
        return attempts;
    };

    const clearRecoveryAttempts = () => {
        localStorage.removeItem(RECOVERY_ATTEMPT_KEY);
        localStorage.removeItem(RECOVERY_LOCKOUT_KEY);
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

    // With the Invisible Team Key (Option 2), there is no manual lock screen.
    // cryptoLayer auto-unlocks on load. We only show the setup panel if there is NO
    // Google Client ID configured at all (absolute first run).
    await new Promise(resolve => {
        if (!authOverlay) return resolve();

        const setupPanel = document.getElementById('auth-setup-panel');
        const googleBtn = document.getElementById('auth-google-link');
        const setupClientIdInput = document.getElementById('auth-setup-client-id');
        const clientIdContainer = document.getElementById('auth-client-id-container');
        const showClientIdBtn = document.getElementById('auth-show-client-id');
        const driveStep = document.getElementById('auth-drive-connect-step');
        const driveBtn = document.getElementById('auth-google-drive-link');
        const userNameEl = document.getElementById('auth-user-name');

        const existingClientId = syncManager.getConfig().clientId;

        // If a Client ID exists, we are already "set up". We bypass the overlay
        // and let sync.js handle the silent token refresh in the background.
        if (existingClientId || !setupPanel) {
            authOverlay.classList.remove('open');
            return resolve();
        }

        // --- First Run Setup (No Client ID yet) ---
        authOverlay.classList.add('open');
        authForm.style.display = 'none'; // Hide manual password form forever
        setupPanel.style.display = 'flex';

        if (showClientIdBtn && clientIdContainer) {
            clientIdContainer.style.display = 'flex';
            showClientIdBtn.style.display = 'none';
        }

        const manualBtn = document.getElementById('auth-manual-setup');
        if (manualBtn) {
            manualBtn.onclick = () => {
                authOverlay.classList.remove('open');
                if (window.showToast) showToast('Modo local activado', 'info');
                resolve();
            };
        }

        const joinBtn = document.getElementById('auth-join-btn');
        const joinPanel = document.getElementById('auth-join-panel');
        const joinBack = document.getElementById('auth-join-back');
        const joinConfirm = document.getElementById('auth-join-confirm');
        const inviteInput = document.getElementById('auth-invite-code');

        if (joinBtn) {
            joinBtn.onclick = () => {
                setupPanel.style.display = 'none';
                joinPanel.style.display = 'flex';
            };
        }
        if (joinBack) {
            joinBack.onclick = () => {
                setupPanel.style.display = 'flex';
                joinPanel.style.display = 'none';
            };
        }
        if (joinConfirm) {
            joinConfirm.onclick = () => {
                const code = inviteInput.value.trim();
                if (!code) return showToast('Pega un código válido.', 'error');
                try {
                    const data = JSON.parse(atob(code));
                    if (!data.c || !data.f) throw new Error('Invalid code');
                    
                    setupClientIdInput.value = data.c;
                    const sharedIdInput = document.getElementById('auth-setup-shared-id') || { value: '' };
                    sharedIdInput.value = data.f;
                    
                    // Pre-fill config so syncManager uses it
                    syncManager.saveConfig({
                        ...syncManager.getConfig(),
                        clientId: data.c,
                        sharedFolderId: data.f,
                        fileName: data.n || 'workspace-team-data.json',
                        workspace_name: data.w || 'Workspace Unido',
                        pending_invite_role: data.r || 'member'
                    });

                    showToast('Código procesado. Ahora conéctate con Google.', 'success');
                    setupPanel.style.display = 'flex';
                    joinPanel.style.display = 'none';
                } catch (e) {
                    showToast('Código de invitación inválido.', 'error');
                }
            };
        }

        if (googleBtn) {
            googleBtn.onclick = async () => {
                const providedClientId = setupClientIdInput?.value.trim();
                if (!providedClientId) {
                    if (window.showToast) showToast('Ingresa tu Google Client ID para continuar.', 'warning');
                    setupClientIdInput?.focus();
                    return;
                }

                googleBtn.disabled = true;
                googleBtn.innerHTML = '<i data-feather="loader" class="spin"></i> Conectando...';
                if (window.feather) feather.replace();

                try {
                    const user = await syncManager.signIn(providedClientId);
                    syncManager.saveConfig({ ...syncManager.getConfig(), clientId: providedClientId });
                    if (window.updateUserProfileUI) window.updateUserProfileUI();

                    if (driveStep && userNameEl) {
                        userNameEl.textContent = user.name || user.email;
                        driveStep.style.display = 'flex';
                        googleBtn.style.display = 'none';

                        driveBtn.onclick = async () => {
                            driveBtn.disabled = true;
                            driveBtn.innerHTML = '<i data-feather="loader" class="spin"></i> Autorizando Drive...';
                            if (window.feather) feather.replace();

                            try {
                                const setupSharedIdInput = document.getElementById('auth-setup-shared-id');
                                const providedSharedId = setupSharedIdInput?.value.trim();
                                if (providedSharedId) {
                                    syncManager.saveConfig({ ...syncManager.getConfig(), sharedFolderId: providedSharedId });
                                }

                                await syncManager.authorize(providedClientId);
                                
                                authOverlay.classList.remove('open');
                                if (window.showToast) showToast('¡Workspace conectado!', 'success');
                                resolve();
                            } catch (err) {
                                console.error('[Auth] Drive auth failed:', err);
                                driveBtn.disabled = false;
                                driveBtn.innerHTML = '<i data-feather="cloud"></i> Conectar Google Drive';
                                if (window.feather) feather.replace();
                            }
                        };
                    } else {
                        // Fallback if UI elements are missing
                        authOverlay.classList.remove('open');
                        resolve();
                    }
                } catch (err) {
                    console.error('[Auth] Google sign-in failed:', err);
                    googleBtn.disabled = false;
                    googleBtn.innerHTML = '<img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" width="18" height="18" alt="Google"> Entrar con Google';
                    if (window.feather) feather.replace();
                }
            };
        } else {
            authOverlay.classList.remove('open');
            resolve();
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

    // BUG 16 FIX: Zombie Key — propagate lock() to all sibling tabs via BroadcastChannel.
    // Without this, tabs B and C keep the master key in memory after tab A logs out,
    // leaving the vault accessible in those tabs until they are manually refreshed.
    const _lockChannel = new BroadcastChannel('nexus-lock');
    _lockChannel.addEventListener('message', (event) => {
        if (event.data?.type === 'lock') {
            // Another tab initiated a lock — clear key from this tab's memory and reload
            // the auth overlay so the user must re-authenticate here too.
            if (cryptoLayer?.lock) cryptoLayer.lock();
            location.reload();
        }
    });

    window.lockWorkspace = () => {
        if (localStorage.getItem('workspace_lock_hash')) {
            // Broadcast to all sibling tabs before reloading this one.
            _lockChannel.postMessage({ type: 'lock' });
            location.reload();
        } else {
            if (window.showToast) showToast('Primero configura una contraseña en Perfil.', 'info');
        }
    };

    // ── 1. Initialize IndexedDB ────────────────────────────────────────────────
    try {
        await initDB();
        
        // ── Initialize Session Manager now that DB is ready ─────────────────
        try {
            if (window.db && window.SessionManager) {
                await SessionManager.init(window.db);
                console.log('[Boot] Session Manager initialized');
            }
        } catch (e) {
            console.warn('[Boot] Session Manager init failed:', e);
        }
    } catch (e) {
        console.warn('[Boot] IndexedDB init failed:', e);
    }

    // ── 2. Load store ───────────────────────────────────────────────────
    try {
        await store.load();
    } catch (e) {
        console.warn('[Boot] Store load failed:', e);
    }

    // ── 3. Register service worker ─────────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
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
        window.location.href = window.location.pathname;
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
        .on('collaboration', (root) => renderCollaboration(root))
        .on('admin', (root) => renderAdmin(root))
        .on('notes-wiki', (root) => renderNotesWiki && renderNotesWiki(root))
        .on('document', (root, params) => renderDocumentView(root, params))
        .on('project', (root, params) => renderProjectDetail(root, params));

    // ── 5. Wire sidebar project list ───────────────────────────────────────────
    refreshSidebarProjects();
    store.subscribe('projects', refreshSidebarProjects);

    // ── 6. Init router ─────────────────────────────────────────────────────────
    router.init();

    // ── 7. Load User Profile & Notifications ──────────────────────────────────
    // FIX: updateUserProfileUI ya fue llamada durante el auth flow de Google.
    // La llamamos de nuevo aquí como garantía para el flujo de unlock por contraseña.
    if (window.updateUserProfileUI) updateUserProfileUI();
    if (window.NotificationsManager) NotificationsManager.init();
    if (window.ChatManager) ChatManager.init();

    // ── 8. Init UI Toggles (Theme/Sidebar) ─────────────────────────────────────
    initUIToggles();
    initSessionSwitcher();  // OPCIÓN 3: Initialize session switcher in topbar
    initWorkspaceMode();

    // ── 8.1. Sync status widget ─────────────────────────────────────────────────
    updateTopbarSyncWidget();
    window.addEventListener('online', updateTopbarSyncWidget);
    window.addEventListener('offline', updateTopbarSyncWidget);
    window.addEventListener('sync:status-changed', updateTopbarSyncWidget);
    // Poll every 15s to keep the widget fresh
    setInterval(updateTopbarSyncWidget, 15_000);

    // ── 9. Try sync pull ───────────────────────────────────────────────────────
    // FIX: syncManager.init() ya fue llamado al inicio (antes del auth block).
    // Aquí solo hacemos el pull inicial si ya hay un accessToken activo.
    try {
        await syncManager.pull();
    } catch (e) {
        console.warn('[Sync] Could not pull on boot:', e);
    }

    // ── 9.1. Identity & First-Run Setup ─────────────────────────────────────
    const allMembers = store.get.members();
    const config = syncManager.getConfig();
    const user = getCurrentWorkspaceUser();

    if (allMembers.length === 0) {
        console.log('[Auth] Empty workspace detected. Launching Admin Setup...');
        if (window.openInitialSetupModal) openInitialSetupModal();
    } else if (user.email) {
        let member = allMembers.find(m => m.email === user.email || (m.emailHash && m.emailHash === user.emailHash));
        
        // If not a member yet, but has a pending invite role
        if (!member && config.pending_invite_role) {
            const role = config.pending_invite_role;
            const proceedWithCreate = async () => {
                const newMember = await store.dispatch('ADD_MEMBER', {
                    name: user.name || 'Nuevo Miembro',
                    email: user.email,
                    emailHash: user.emailHash || null,
                    role: role,
                    avatar: (user.name || 'N').charAt(0).toUpperCase(),
                    joinedAt: new Date().toISOString()
                });
                if (newMember) {
                    setCurrentMemberId(newMember.id);
                    syncManager.saveConfig({ ...config, pending_invite_role: null });
                    showToast(`¡Bienvenido al equipo, ${user.name}!`, 'success');
                    if (window.updateUserProfileUI) updateUserProfileUI();
                }
            };

            if (role === 'admin' && config.admin_key_hash) {
                // Verification required for Admin roles
                const key = prompt('Este código otorga permisos de Administrador. Ingresa la Clave Maestra del Workspace para continuar:');
                if (key) {
                    const cryptoLayer = await import('./utils/crypto.js');
                    const hash = await cryptoLayer.hashPassword(key);
                    if (hash === config.admin_key_hash) {
                        await proceedWithCreate();
                    } else {
                        showToast('Clave Maestra incorrecta. Te unirás como Miembro estándar.', 'warning');
                        syncManager.saveConfig({ ...config, pending_invite_role: 'member' });
                        location.reload();
                    }
                }
            } else {
                await proceedWithCreate();
            }
        } else if (member) {
            setCurrentMemberId(member.id);
            if (window.updateUserProfileUI) updateUserProfileUI();
        }
    }

    // ── 10. Global Action Listeners ────────────────────────────────────────────
    document.getElementById('btn-integrations')?.addEventListener('click', () => router.navigate('/integrations'));
    document.getElementById('btn-search')?.addEventListener('click', openSearch);
    document.getElementById('btn-new-global')?.addEventListener('click', openQuickAdd);
    document.getElementById('btn-help')?.addEventListener('click', openHelpModal);
    document.getElementById('search-input')?.addEventListener('input', e => handleSearch(e.target.value));

    // ── Buttons migrated from inline onclick (CSP prep) ────────────────────────
    document.getElementById('btn-sync-toggle')?.addEventListener('click', () => syncManager.openPanel());
    document.getElementById('btn-sync-now')?.addEventListener('click', () => syncManager.syncNow());
    document.getElementById('btn-export')?.addEventListener('click', () => exportData());
    document.getElementById('btn-lock')?.addEventListener('click', () => {
        if (window.lockWorkspace) lockWorkspace();
    });

    document.getElementById('search-overlay')?.addEventListener('click', e => {
        if (e.target.id === 'search-overlay') closeSearch();
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
        // Notion-like quick task: Alt+T
        if (e.altKey && e.key === 't') { e.preventDefault(); openQuickAdd(); }
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
        window.addEventListener('hashchange', () => {
            if (window.updateBreadcrumbs) window.updateBreadcrumbs();
            // Close details panel on navigation for better fluidity
            if (window.closeDetailsPanel) closeDetailsPanel();
        });
        if (window.updateBreadcrumbs) window.updateBreadcrumbs();
    }

    if (window.feather) feather.replace();

});

// ── 13. Expose Globals for legacy support or inline handlers ──────────────────
window.exportData = exportData;
window.openQuickAdd = openQuickAdd;
window.openSearch = openSearch;
window.closeSearch = closeSearch;
window.handleSearch = handleSearch;
window.lockWorkspace = () => {
    if (localStorage.getItem('workspace_lock_hash')) {
        location.reload();
    } else {
        if (window.showToast) showToast('Primero configura una contraseña en Perfil.', 'info');
    }
};

// ── 14. PWA Installation Logic ──────────────────────────────────────────────
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

document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
    }
});

document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('pwa-install-dismissed', 'true');
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
});
