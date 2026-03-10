import {
    initUIToggles,
    refreshSidebarProjects,
    openSearch,
    closeSearch,
    handleSearch,
    openQuickAdd,
    exportData,
    initGlobalEffects
} from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    initGlobalEffects();

    // ── 0. Pre-init syncManager (needed before auth block to read config) ──────
    // FIX: syncManager.init() se mueve aquí para que getConfig() funcione
    // dentro del bloque de auth sin race condition.
    try {
        await syncManager.init();
    } catch (e) {
        console.warn('[Boot] syncManager pre-init failed:', e);
    }

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
            const setupPanel = document.getElementById('auth-setup-panel');
            const googleBtn = document.getElementById('auth-google-link');
            const manualLink = document.getElementById('auth-manual-setup');

            if (setupPanel && googleBtn && manualLink) {
                setupPanel.style.display = 'flex';
                authForm.style.display = 'none';
                authSubtitle.textContent = "Inicia sesión con Google para vincular este workspace desde el inicio.";

                const clientIdContainer = document.getElementById('auth-client-id-container');
                const showClientIdBtn = document.getElementById('auth-show-client-id');
                const setupClientIdInput = document.getElementById('auth-setup-client-id');
                const setupSharedIdInput = document.getElementById('auth-setup-shared-id');

                const localWarningPanel = document.getElementById('auth-local-warning');
                const localWarningBackBtn = document.getElementById('auth-local-warning-back');
                const localWarningProceedBtn = document.getElementById('auth-local-warning-proceed');

                // FIX: Si no hay clientId guardado, mostrar el campo directamente
                // sin obligar al usuario a hacer click en el enlace auxiliar.
                const existingClientId = syncManager.getConfig().clientId;
                if (!existingClientId) {
                    clientIdContainer.style.display = 'flex';
                    if (showClientIdBtn) showClientIdBtn.style.display = 'none';
                } else if (showClientIdBtn) {
                    showClientIdBtn.onclick = () => {
                        clientIdContainer.style.display = 'flex';
                        showClientIdBtn.style.display = 'none';
                        setupClientIdInput.focus();
                    };
                    // Pre-rellenar el campo si ya hay un clientId guardado
                    setupClientIdInput.value = existingClientId;
                }

                googleBtn.onclick = async () => {
                    const providedClientId = setupClientIdInput?.value.trim();

                    const currentClientId = providedClientId || existingClientId;

                    if (!currentClientId) {
                        if (window.showToast) showToast('Ingresa tu Google Client ID para continuar.', 'warning');
                        clientIdContainer.style.display = 'flex';
                        if (showClientIdBtn) showClientIdBtn.style.display = 'none';
                        setupClientIdInput.focus();
                        return;
                    }

                    googleBtn.disabled = true;
                    googleBtn.innerHTML = '<i data-feather="loader" class="spin"></i> Conectando...';
                    if (window.feather) feather.replace();

                    try {
                        // CAPA A: Autenticación (Identity via OIDC / One-Tap)
                        const user = await syncManager.signIn(currentClientId);

                        // Guardar el Client ID si se proporcionó uno nuevo
                        if (providedClientId && providedClientId !== existingClientId) {
                            syncManager.saveConfig({ ...syncManager.getConfig(), clientId: providedClientId });
                        }

                        // FIX: Actualizar el perfil de usuario en la sidebar INMEDIATAMENTE
                        // después del signIn para evitar la race condition visual.
                        if (window.updateUserProfileUI) window.updateUserProfileUI();

                        // Mostrar Paso 2: Conectar Drive
                        const driveStep = document.getElementById('auth-drive-connect-step');
                        const driveBtn = document.getElementById('auth-google-drive-link');
                        const userNameEl = document.getElementById('auth-user-name');

                        if (driveStep && userNameEl) {
                            userNameEl.textContent = user.name || user.email;
                            driveStep.style.display = 'flex';
                            googleBtn.style.display = 'none';

                            driveBtn.onclick = async () => {
                                driveBtn.disabled = true;
                                driveBtn.innerHTML = '<i data-feather="loader" class="spin"></i> Autorizando Drive...';
                                if (window.feather) feather.replace();

                                try {
                                    // CAPTURAR: Shared Folder ID opcional para nuevos grupos
                                    const providedSharedId = setupSharedIdInput?.value.trim();
                                    if (providedSharedId) {
                                        syncManager.saveConfig({ ...syncManager.getConfig(), sharedFolderId: providedSharedId });
                                    }

                                    // CAPA B: Autorización OAuth para Drive (no repite signIn)
                                    await syncManager.authorize(currentClientId);
                                    // Buscar workspace remoto con el accessToken recién obtenido
                                    const remoteData = await syncManager.checkRemote();
                                    handleRemoteWorkspace(remoteData);
                                } catch (err) {
                                    console.error('[Auth] Drive authorization failed:', err);
                                    if (window.showToast) showToast('Error al conectar con Drive. Intenta de nuevo.', 'error');
                                    driveBtn.disabled = false;
                                    driveBtn.innerHTML = '<i data-feather="cloud"></i> Conectar Google Drive';
                                    if (window.feather) feather.replace();
                                }
                            };
                        }

                        authSubtitle.textContent = `¡Hola, ${user.name || user.email}! Ahora autoriza Drive para activar la sincronización.`;

                        // FIX: Actualizar texto y comportamiento del link manual
                        // SOLO DESPUÉS de que el usuario esté autenticado, para coherencia.
                        manualLink.textContent = 'Continuar solo en local (sin sincronización)';
                        manualLink.onclick = () => {
                            // En lugar de ir directo, mostramos la advertencia local
                            setupPanel.style.display = 'none';
                            localWarningPanel.style.display = 'flex';
                        };

                    } catch (err) {
                        console.error('[Auth] Google sign-in failed:', err);
                        googleBtn.disabled = false;
                        googleBtn.innerHTML = '<img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" width="18" height="18" alt="Google"> Entrar con Google';
                        if (window.feather) feather.replace();
                        if (window.showToast) showToast('Error al autenticar con Google. Verifica tu Client ID.', 'error');
                    }
                };

                function handleRemoteWorkspace(remoteData) {
                    if (remoteData && remoteData.updatedAt) {
                        if (window.showToast) showToast('Workspace detectado en Google Drive', 'success');
                        // SECURITY FIX: workspace_lock_hash and workspace_recovery_hash are
                        // personal per-device credentials and must NEVER be imported from the
                        // shared Drive file. Each user must set their own master password.
                        // Importing a remote hash would allow any team member with Drive access
                        // to take over another user's workspace by replacing the hash.
                    }
                    // Proceed to local password setup regardless of remote state
                    setupPanel.style.display = 'none';
                    authForm.style.display = 'flex';
                    authSubtitle.textContent = "Conexión exitosa. Crea tu contraseña maestra personal para proteger tus datos.";
                    setupPasswordCreation();
                }

                // Configurar Botones del Warning de Modo Local
                if (localWarningBackBtn && localWarningProceedBtn) {
                    localWarningBackBtn.onclick = () => {
                        localWarningPanel.style.display = 'none';
                        setupPanel.style.display = 'flex';
                    };
                    localWarningProceedBtn.onclick = () => {
                        localWarningPanel.style.display = 'none';
                        authForm.style.display = 'flex';
                        authSubtitle.textContent = 'Crea una contraseña maestra para proteger tus datos locales.';
                        setupPasswordCreation();
                    };
                }

                // FIX: El link manual en el estado inicial (antes del signIn)
                // permite continuar en modo local sin bloquear al usuario, pero previa advertencia.
                manualLink.textContent = 'Configuración manual (Solo local)';
                manualLink.onclick = () => {
                    setupPanel.style.display = 'none';
                    localWarningPanel.style.display = 'flex';
                };
            } else {
                // Fallback si por alguna razón no están los elementos nuevos
                authSubtitle.textContent = "Crea una contraseña maestra para bloquear tu Workspace.";
                setupPasswordCreation();
            }

            function setupPasswordCreation() {
                authForm.onsubmit = async (e) => {
                    e.preventDefault();
                    const pwd = authPassword.value.trim();
                    if (pwd.length < 8) {
                        authPassword.style.border = '1px solid var(--accent-warning)';
                        authSubtitle.textContent = 'La contraseña maestra debe tener al menos 8 caracteres.';
                        setTimeout(() => authPassword.style.border = '', 1500);
                        return;
                    }
                    const hash = await hashStr(pwd);
                    const recoveryCode = generateRecoveryCode();
                    const recoveryHash = await hashStr(normalizeCode(recoveryCode));
                    localStorage.setItem('workspace_lock_hash', hash);
                    localStorage.setItem('workspace_recovery_hash', recoveryHash);
                    if (cryptoLayer) await cryptoLayer.unlock(pwd);
                    authForm.style.display = 'none';
                    authSubtitle.textContent = "Guarda tu codigo de recuperacion.";
                    showCodeDisplay(recoveryCode, () => {
                        authOverlay.classList.remove('open');
                        // Forzar una sincronización inicial si estamos conectados
                        if (syncManager.getAccessToken()) {
                            syncManager.push().then(() => {
                                if (window.showToast) showToast('Workspace sincronizado con Drive por primera vez', 'success');
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    });
                };
            }
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
                    authSubtitle.textContent = "Ingresa tu código de recuperación.";
                    authRecoveryPanel.style.display = 'flex';
                    authRecoveryCode.focus();

                    // Show Google recovery button only if there is a linked Google account.
                    // This avoids confusion for local-only workspaces.
                    const googleRecoveryContainer = document.getElementById('auth-google-recovery-container');
                    if (googleRecoveryContainer) {
                        const linkedEmail = localStorage.getItem('workspace_user_email');
                        if (linkedEmail) {
                            googleRecoveryContainer.style.display = 'flex';
                            const hint = document.getElementById('auth-google-recovery-hint');
                            if (hint) hint.textContent = `Verifica con la cuenta: ${linkedEmail}`;
                        }
                    }
                };
            }

            if (authRecoveryBack) {
                authRecoveryBack.onclick = () => {
                    authRecoveryPanel.style.display = 'none';
                    authNewpwdPanel.style.display = 'none';
                    authRecoveryCode.value = '';
                    authRecoveryCode.style.border = '';

                    // Reset Google recovery panel to its initial state
                    const googleRecoveryContainer = document.getElementById('auth-google-recovery-container');
                    const googleRecoveryBtn = document.getElementById('auth-google-recovery-btn');
                    const googleRecoveryLoading = document.getElementById('auth-google-recovery-loading');
                    if (googleRecoveryContainer) googleRecoveryContainer.style.display = 'none';
                    if (googleRecoveryBtn) googleRecoveryBtn.style.display = 'flex';
                    if (googleRecoveryLoading) googleRecoveryLoading.style.display = 'none';

                    authForm.style.display = 'flex';
                    if (authForgotContainer) authForgotContainer.style.display = 'block';
                    authSubtitle.textContent = "Ingresa tu contraseña para acceder.";
                };
            }

            if (authRecoverySubmit) {
                authRecoverySubmit.onclick = async () => {
                    // SECURITY FIX: Apply brute-force protection to recovery code attempts.
                    if (isRecoveryLockedOut()) {
                        const secs = getRecoveryRemainingLockout();
                        authSubtitle.textContent = `⚠️ Demasiados intentos. Espera ${secs}s.`;
                        authRecoveryCode.value = '';
                        return;
                    }

                    const savedRecoveryHash = localStorage.getItem('workspace_recovery_hash');
                    const entered = normalizeCode(authRecoveryCode.value.trim());
                    const inputHash = await hashStr(entered);
                    if (savedRecoveryHash && inputHash === savedRecoveryHash) {
                        clearRecoveryAttempts();
                        authRecoveryPanel.style.display = 'none';
                        authSubtitle.textContent = "Crea una nueva contraseña.";
                        authNewpwdPanel.style.display = 'flex';
                        authNewpwdInput.focus();
                    } else {
                        const attempts = recordFailedRecoveryAttempt();
                        authRecoveryCode.style.border = '1px solid var(--accent-danger)';
                        authRecoveryCode.value = '';
                        if (isRecoveryLockedOut()) {
                            authSubtitle.textContent = `⚠️ Bloqueado por 30s tras ${MAX_ATTEMPTS} intentos fallidos.`;
                        } else {
                            authSubtitle.textContent = `Código incorrecto. Intentos restantes: ${MAX_ATTEMPTS - attempts}.`;
                        }
                        setTimeout(() => authRecoveryCode.style.border = '', 1000);
                    }
                };
            }

            // ── Google-based Recovery ────────────────────────────────────────
            const authGoogleRecoveryBtn = document.getElementById('auth-google-recovery-btn');
            const authGoogleRecoveryLoading = document.getElementById('auth-google-recovery-loading');

            if (authGoogleRecoveryBtn) {
                authGoogleRecoveryBtn.onclick = async () => {
                    // Apply the same brute-force protection to Google recovery.
                    // Without this, an attacker could spam Google logins as a bypass.
                    if (isRecoveryLockedOut()) {
                        const secs = getRecoveryRemainingLockout();
                        authSubtitle.textContent = `⚠️ Demasiados intentos. Espera ${secs}s.`;
                        return;
                    }

                    const clientId = syncManager.getConfig?.()?.clientId;
                    if (!clientId) {
                        authSubtitle.textContent = 'No se encontró un Google Client ID configurado.';
                        return;
                    }

                    const linkedEmail = localStorage.getItem('workspace_user_email');
                    if (!linkedEmail) {
                        authSubtitle.textContent = 'No hay una cuenta de Google vinculada a este workspace.';
                        return;
                    }

                    // Show loading state
                    authGoogleRecoveryBtn.style.display = 'none';
                    if (authGoogleRecoveryLoading) authGoogleRecoveryLoading.style.display = 'flex';
                    authSubtitle.textContent = 'Esperando autenticación de Google…';

                    try {
                        const user = await syncManager.signIn(clientId);

                        // Normalize both emails to lowercase before comparing
                        // to prevent case-sensitivity bypass.
                        const googleEmail = (user?.email || '').toLowerCase().trim();
                        const workspaceEmail = linkedEmail.toLowerCase().trim();

                        if (googleEmail !== workspaceEmail) {
                            // Wrong Google account — count as a failed recovery attempt.
                            const attempts = recordFailedRecoveryAttempt();
                            authGoogleRecoveryBtn.style.display = 'flex';
                            if (authGoogleRecoveryLoading) authGoogleRecoveryLoading.style.display = 'none';
                            if (isRecoveryLockedOut()) {
                                authSubtitle.textContent = `⚠️ Bloqueado por 30s tras ${MAX_ATTEMPTS} intentos fallidos.`;
                            } else {
                                authSubtitle.textContent = `⚠️ La cuenta de Google (${googleEmail}) no coincide con el workspace. Intentos restantes: ${MAX_ATTEMPTS - attempts}.`;
                            }
                            return;
                        }

                        // ✅ Identity verified — skip directly to new password panel.
                        clearRecoveryAttempts();
                        authRecoveryPanel.style.display = 'none';
                        authSubtitle.textContent = '✅ Identidad verificada con Google. Crea una nueva contraseña.';
                        authNewpwdPanel.style.display = 'flex';
                        authNewpwdInput.focus();

                    } catch (err) {
                        console.warn('[Auth] Google recovery sign-in failed:', err);
                        authGoogleRecoveryBtn.style.display = 'flex';
                        if (authGoogleRecoveryLoading) authGoogleRecoveryLoading.style.display = 'none';
                        authSubtitle.textContent = 'No se pudo autenticar con Google. Intenta de nuevo o usa el código de recuperación.';
                    }
                };
            }

            if (authNewpwdSubmit) {
                authNewpwdSubmit.onclick = async () => {
                    const newPwd = authNewpwdInput.value.trim();
                    if (newPwd.length < 8) {
                        authNewpwdInput.style.border = '1px solid var(--accent-warning)';
                        authSubtitle.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
                        setTimeout(() => authNewpwdInput.style.border = '', 1500);
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

    // ── 2. Load store ───────────────────────────────────────────────────
    try {
        await store.load();
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
        .on('collaboration', (root) => renderCollaboration(root))
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

    // ── 9. Try sync pull ───────────────────────────────────────────────────────
    // FIX: syncManager.init() ya fue llamado al inicio (antes del auth block).
    // Aquí solo hacemos el pull inicial si ya hay un accessToken activo.
    try {
        await syncManager.pull();
    } catch (e) {
        console.warn('[Sync] Could not pull on boot:', e);
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
