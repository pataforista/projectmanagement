/**
 * js/components/chat.js
 * Floating Minichat for team collaboration
 */
import { store } from '../store.js';
import { esc, fmtDate, getCurrentWorkspaceActor } from '../utils.js';

export const ChatManager = (() => {
    let _container = null;
    let _isOpen = false;

    function init() {
        if (_container) return;

        // Create container
        _container = document.createElement('div');
        _container.className = 'minichat-container';
        _container.innerHTML = `
            <div class="chat-bubble" id="chat-bubble" title="Chat de Equipo">
                <i data-feather="message-square"></i>
                <span class="chat-badge hidden" id="chat-badge">0</span>
            </div>
            <div class="chat-panel hidden" id="chat-panel">
                <div class="chat-header">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <h3>Chat de Equipo</h3>
                        <small id="chat-sync-status" style="font-size:0.68rem; color:var(--text-muted);">Sincronizando estado...</small>
                    </div>
                    <button class="btn btn-icon btn-sm" id="chat-close"><i data-feather="x"></i></button>
                </div>
                <div class="chat-messages" id="chat-messages"></div>
                <div class="chat-input-area">
                    <input type="text" id="chat-input" placeholder="Escribe un mensaje..." autocomplete="off">
                    <button class="btn btn-primary btn-sm" id="chat-send"><i data-feather="send"></i></button>
                </div>
            </div>
        `;
        document.body.appendChild(_container);

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            .minichat-container {
                position: fixed;
                bottom: max(20px, env(safe-area-inset-bottom));
                right: max(20px, env(safe-area-inset-right));
                z-index: 9999;
                font-family: var(--font-family);
            }
            .chat-bubble {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: var(--accent-primary);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.2s;
                position: relative;
            }
            .chat-bubble:hover { transform: scale(1.1); }
            .chat-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: var(--accent-danger);
                color: white;
                font-size: 0.7rem;
                padding: 2px 6px;
                border-radius: 10px;
                border: 2px solid var(--bg-surface);
            }
            .chat-panel {
                width: 320px;
                height: 450px;
                background: var(--bg-surface);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                position: absolute;
                bottom: 70px;
                right: 0;
                overflow: hidden;
            }
            .chat-header {
                padding: 12px 16px;
                background: var(--bg-secondary);
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .chat-header h3 { margin: 0; font-size: 0.9rem; }
            .chat-messages {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .chat-msg {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 18px;
                font-size: 0.88rem;
                position: relative;
                line-height: 1.5;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .chat-msg.sent {
                align-self: flex-end;
                background: var(--accent-primary);
                color: white;
                border-bottom-right-radius: 4px;
            }
            .chat-msg.received {
                align-self: flex-start;
                background: var(--bg-surface-2);
                color: var(--text-primary);
                border-bottom-left-radius: 4px;
                border: 1px solid var(--border-color);
            }
            .chat-row {
                display: flex;
                gap: 8px;
                align-items: flex-end;
                margin-bottom: 4px;
            }
            .chat-row.sent { flex-direction: row-reverse; }
            .chat-msg-meta {
                display: block;
                font-size: 0.65rem;
                opacity: 0.6;
                margin-top: 4px;
            }
            .chat-input-area {
                padding: 16px;
                border-top: 1px solid var(--border-color);
                display: flex;
                gap: 10px;
                background: var(--bg-surface);
            }
            .chat-input-area input {
                flex: 1;
                background: var(--bg-input);
                border: 1px solid var(--border-color);
                border-radius: 20px;
                padding: 10px 16px;
                color: var(--text-primary);
                font-size: 0.9rem;
                transition: all 0.2s;
            }
            .chat-input-area input:focus {
                border-color: var(--accent-primary);
                background: var(--bg-surface-hover);
            }
            .hidden { display: none !important; }
            @media (max-width: 640px) {
                .minichat-container {
                    right: 12px;
                    bottom: max(12px, env(safe-area-inset-bottom));
                }
                .chat-panel {
                    width: min(92vw, 360px);
                    height: min(62vh, 460px);
                    right: 0;
                    bottom: 62px;
                }
            }
            @keyframes chat-pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.2); box-shadow: 0 0 20px var(--accent-primary); }
                100% { transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        // Listeners
        document.getElementById('chat-bubble').addEventListener('click', toggleChat);
        document.getElementById('chat-close').addEventListener('click', toggleChat);
        document.getElementById('chat-send').addEventListener('click', sendMessage);
        document.getElementById('chat-input').addEventListener('keypress', e => {
            if (e.key === 'Enter') sendMessage();
        });

        // Store subscription
        store.subscribe('messages', renderMessages);


        window.addEventListener('chat:outbox-updated', updateSyncStatus);
        window.addEventListener('online', updateSyncStatus);
        window.addEventListener('offline', updateSyncStatus);

        updateSyncStatus();

        if (window.feather) feather.replace();
    }

    function toggleChat() {
        _isOpen = !_isOpen;
        document.getElementById('chat-panel').classList.toggle('hidden', !_isOpen);
        if (_isOpen) {
            scrollToBottom();
            document.getElementById('chat-badge').classList.add('hidden');
            document.getElementById('chat-badge').textContent = '0';
            setTimeout(() => document.getElementById('chat-input').focus(), 100);
        }
    }

    const MAX_MESSAGE_LENGTH = 2000;
    let _lastMessageTime = 0;
    const MIN_MESSAGE_INTERVAL_MS = 500; // rate limit: max 2 messages/sec

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        // SECURITY FIX: Enforce message size limit to prevent memory exhaustion attacks.
        if (text.length > MAX_MESSAGE_LENGTH) {
            if (window.showToast) showToast(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`, 'warning');
            return;
        }

        // SECURITY FIX: Basic rate limiting to prevent chat spam.
        const now = Date.now();
        if (now - _lastMessageTime < MIN_MESSAGE_INTERVAL_MS) {
            if (window.showToast) showToast('Estás enviando mensajes muy rápido.', 'warning');
            return;
        }
        _lastMessageTime = now;

        const actor = getCurrentWorkspaceActor();
        // SECURITY FIX: Use cryptographically secure random suffix instead of Math.random().
        const randBytes = crypto.getRandomValues(new Uint8Array(4));
        const randHex = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const msg = {
            id: 'msg-' + now + '-' + randHex,
            timestamp: now,
            createdAt: now,
            sender: actor.name || actor.label,
            senderId: actor.id,
            text: text,
            visibility: 'local' // Evita que se suba en el JSON monolítico
        };

        // Guardar instantáneamente offline
        await store.dispatch('ADD_MESSAGE', msg);

        // Subir micro-archivo de chat en segundo plano
        if (window.syncManager && window.syncManager.uploadChatMessage) {
            window.syncManager.uploadChatMessage(msg).catch(e => console.error('Chat push error:', e));
        }

        input.value = '';
        updateSyncStatus();
    }


    function updateSyncStatus() {
        const statusEl = document.getElementById('chat-sync-status');
        if (!statusEl) return;

        const status = window.syncManager?.getChatSyncStatus
            ? window.syncManager.getChatSyncStatus()
            : { linked: false, online: navigator.onLine, pending: 0 };

        if (!status.linked) {
            statusEl.textContent = 'Cuenta no vinculada · Chat solo local';
            return;
        }

        if (!status.online) {
            statusEl.textContent = `Sin conexión · ${status.pending || 0} pendientes`;
            return;
        }

        if ((status.pending || 0) > 0) {
            statusEl.textContent = `En cola: ${status.pending} mensajes`;
            return;
        }

        statusEl.textContent = 'Cuenta vinculada · Chat sincronizado';
    }

    function renderMessages(messages) {
        const list = document.getElementById('chat-messages');
        if (!list) return;

        const currentUser = getCurrentWorkspaceActor();
        const lastCount = list.children.length;

        // Color helper: Hash string to HSL color
        const stringToColor = (str) => {
            if (!str) return 'var(--accent-primary)'; // Fallback for missing sender
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            const h = Math.abs(hash) % 360;
            return `hsl(${h}, 70%, 75%)`;
        };

        list.innerHTML = messages
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(m => {
                const senderName = m.sender || 'Usuario Desconocido';
                const isMe = (m.senderId && m.senderId === currentUser.id) || senderName === currentUser.label || senderName === currentUser.name;
                const userColor = stringToColor(senderName);
                const initials = senderName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                
                return `
                    <div class="chat-row ${isMe ? 'sent' : 'received'}">
                        ${!isMe ? `<div class="avatar" style="width:24px; height:24px; font-size:10px; background:${userColor}; flex-shrink:0;">${initials}</div>` : ''}
                        <div class="chat-msg ${isMe ? 'sent' : 'received'}">
                            ${!isMe ? `<span style="color:${userColor}; font-weight:700; display:block; font-size:0.7rem; margin-bottom:4px;">${esc(senderName)}</span>` : ''}
                            <div class="chat-msg-text">${esc(m.text)}</div>
                            <div class="chat-msg-meta" style="text-align:${isMe ? 'right' : 'left'};">
                                ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        scrollToBottom();

        // Badge logic if closed
        // BUG FIX: removed `&& lastCount > 0` — that condition prevented the badge
        // from ever showing when the first message arrived (lastCount was 0).
        if (!_isOpen && messages.length > lastCount) {
            const badge = document.getElementById('chat-badge');
            const diff = messages.length - lastCount;
            const currentBadgeVal = parseInt(badge.textContent) || 0;
            badge.textContent = currentBadgeVal + diff;
            badge.classList.remove('hidden');

            // Pulse bubble on new message
            const bubble = document.getElementById('chat-bubble');
            bubble.style.animation = 'none';
            bubble.offsetHeight; // trigger reflow
            bubble.style.animation = 'chat-pulse 0.5s ease-out';
        }
    }

    function scrollToBottom() {
        const list = document.getElementById('chat-messages');
        if (list) list.scrollTop = list.scrollHeight;
    }

    return { init };
})();

window.ChatManager = ChatManager;
