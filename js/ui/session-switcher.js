/**
 * session-switcher.js — Session Switcher UI Component
 * OPCIÓN 3: UI for switching between multiple Google accounts/sessions
 */

import { SessionManager } from '../utils/session-manager.js';
import { StorageManager } from '../utils/storage-manager.js';

/**
 * Render the session switcher modal
 */
export async function renderSessionSwitcher(targetElement) {
    const container = document.createElement('div');
    container.className = 'session-switcher-modal-overlay';
    container.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
    `;

    const panel = document.createElement('div');
    panel.className = 'session-switcher-panel';
    panel.style.cssText = `
        background: var(--bg-surface);
        border-radius: 12px;
        padding: 24px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    `;

    // Fetch sessions
    const sessions = await SessionManager.listSessions();
    const currentEmail = StorageManager.get('workspace_user_email', 'session');

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        margin-bottom: 20px;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 16px;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Cambiar Sesión';
    title.style.cssText = `margin: 0 0 4px 0; color: var(--text-primary);`;
    header.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.textContent = `${sessions.length} sesión${sessions.length !== 1 ? 'es' : ''} activa${sessions.length !== 1 ? 's' : ''}`;
    subtitle.style.cssText = `margin: 0; color: var(--text-secondary); font-size: 0.85rem;`;
    header.appendChild(subtitle);

    panel.appendChild(header);

    // Sessions list
    const listContainer = document.createElement('div');
    listContainer.id = 'sessions-list';
    listContainer.style.cssText = `
        max-height: 300px;
        overflow-y: auto;
        margin-bottom: 16px;
    `;

    for (const session of sessions) {
        const isActive = session.email === currentEmail;

        const item = document.createElement('div');
        item.className = `session-item ${isActive ? 'active' : ''}`;
        item.style.cssText = `
            padding: 12px;
            margin-bottom: 8px;
            background: ${isActive ? 'var(--accent-primary)' : 'var(--bg-base)'};
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
            transition: all 0.2s;
        `;

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'session-avatar';
        avatar.textContent = session.metadata.avatar || session.email.charAt(0).toUpperCase();
        avatar.style.cssText = `
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: ${isActive ? 'var(--bg-surface)' : 'var(--accent-primary)'};
            color: ${isActive ? 'var(--accent-primary)' : 'var(--bg-surface)'};
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 0.9rem;
            flex-shrink: 0;
        `;

        // Info
        const info = document.createElement('div');
        info.style.cssText = `flex: 1; min-width: 0;`;

        const emailEl = document.createElement('div');
        emailEl.textContent = session.email;
        emailEl.style.cssText = `
            font-weight: 500;
            color: ${isActive ? 'var(--bg-surface)' : 'var(--text-primary)'};
            font-size: 0.9rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        const nameEl = document.createElement('div');
        nameEl.textContent = session.metadata.name;
        nameEl.style.cssText = `
            font-size: 0.8rem;
            color: ${isActive ? 'var(--bg-surface)' : 'var(--text-secondary)'};
            opacity: 0.9;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;

        info.appendChild(emailEl);
        info.appendChild(nameEl);

        // Buttons
        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        `;

        if (!isActive) {
            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn btn-primary btn-sm';
            selectBtn.textContent = 'Usar';
            selectBtn.style.cssText = `
                padding: 6px 12px;
                font-size: 0.8rem;
                white-space: nowrap;
            `;
            selectBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const success = await SessionManager.switchSession(session.id);
                    if (success) {
                        showToast(`Sesión cambiada a ${session.email}`, 'success');
                        setTimeout(() => location.reload(), 500);
                    }
                } catch (err) {
                    showToast(`Error: ${err.message}`, 'error');
                }
            });
            buttons.appendChild(selectBtn);
        } else {
            const activeLabel = document.createElement('span');
            activeLabel.textContent = '✓ Activa';
            activeLabel.style.cssText = `
                padding: 6px 12px;
                font-size: 0.8rem;
                color: var(--bg-surface);
                font-weight: 600;
            `;
            buttons.appendChild(activeLabel);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn btn-ghost btn-sm';
        removeBtn.textContent = '×';
        removeBtn.title = 'Cerrar esta sesión';
        removeBtn.style.cssText = `
            padding: 6px 8px;
            color: var(--text-secondary);
            font-size: 1.2rem;
            line-height: 1;
        `;
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`¿Cerrar sesión de ${session.email}?`)) {
                try {
                    const success = await SessionManager.endSession(session.id);
                    if (success) {
                        showToast(`Sesión cerrada: ${session.email}`, 'info');
                        // Re-render
                        await renderSessionSwitcher(targetElement);
                    }
                } catch (err) {
                    showToast(`Error: ${err.message}`, 'error');
                }
            }
        });
        buttons.appendChild(removeBtn);

        item.appendChild(avatar);
        item.appendChild(info);
        item.appendChild(buttons);

        // Click to switch
        if (!isActive) {
            item.addEventListener('click', async () => {
                try {
                    const success = await SessionManager.switchSession(session.id);
                    if (success) {
                        showToast(`Sesión cambiada a ${session.email}`, 'success');
                        setTimeout(() => location.reload(), 500);
                    }
                } catch (err) {
                    showToast(`Error: ${err.message}`, 'error');
                }
            });
            item.style.cursor = 'pointer';
            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--bg-highlight)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = 'var(--bg-base)';
            });
        }

        listContainer.appendChild(item);
    }

    panel.appendChild(listContainer);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = `
        display: flex;
        gap: 8px;
    `;

    const addAccountBtn = document.createElement('button');
    addAccountBtn.className = 'btn btn-primary';
    addAccountBtn.style.cssText = `flex: 1; justify-content: center;`;
    addAccountBtn.innerHTML = `<i data-feather="plus" style="width:14px;height:14px;margin-right:4px;"></i> Agregar Cuenta`;
    addAccountBtn.addEventListener('click', async () => {
        try {
            if (window.syncManager && window.syncManager.signIn) {
                const user = await syncManager.signIn();
                const idToken = StorageManager.get('google_id_token', 'session');
                const sessionId = await SessionManager.createSession(
                    user.email,
                    idToken,
                    {
                        name: user.name || user.email,
                        avatar: (user.name || user.email).charAt(0).toUpperCase(),
                    }
                );

                if (sessionId) {
                    await SessionManager.switchSession(sessionId);
                    showToast(`Sesión agregada: ${user.email}`, 'success');
                    setTimeout(() => location.reload(), 500);
                }
            }
        } catch (err) {
            console.error('[SessionSwitcher] Error adding account:', err);
            showToast(`Error al agregar cuenta: ${err.message}`, 'error');
        }
    });

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn btn-secondary';
    logoutBtn.style.cssText = `flex: 1; justify-content: center;`;
    logoutBtn.innerHTML = `<i data-feather="log-out" style="width:14px;height:14px;margin-right:4px;"></i> Salir`;
    logoutBtn.addEventListener('click', async () => {
        if (confirm('¿Cerrar todas las sesiones?')) {
            try {
                if (window.SessionManager) {
                    await SessionManager.logoutFast();
                }
            } catch (err) {
                showToast(`Error: ${err.message}`, 'error');
            }
        }
    });

    actions.appendChild(addAccountBtn);
    actions.appendChild(logoutBtn);
    panel.appendChild(actions);

    container.appendChild(panel);

    // Close on overlay click
    container.addEventListener('click', (e) => {
        if (e.target === container) {
            container.remove();
        }
    });

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
        position: absolute;
        top: 12px;
        right: 12px;
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 1.5rem;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => container.remove());
    panel.style.position = 'relative';
    panel.appendChild(closeBtn);

    // Replace or append
    if (targetElement && targetElement.parentNode) {
        targetElement.parentNode.replaceChild(container, targetElement);
    } else if (targetElement) {
        targetElement.appendChild(container);
    } else {
        document.body.appendChild(container);
    }

    // Replace feather icons
    if (window.feather) {
        feather.replace();
    }

    return container;
}

/**
 * Show session switcher as modal
 */
export function showSessionSwitcher() {
    // Pass null so renderSessionSwitcher appends directly to document.body
    renderSessionSwitcher(null);
}

export default {
    renderSessionSwitcher,
    showSessionSwitcher,
};
