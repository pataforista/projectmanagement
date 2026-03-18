/**
 * js/components/chat.js
 * Floating Minichat for team collaboration
 * Features: @mentions autocomplete, delete messages, clear chat, mention highlights
 */
import { store } from '../store.js';
import { esc, fmtDate, getCurrentWorkspaceActor } from '../utils.js';

export const ChatManager = (() => {
    let _container = null;
    let _isOpen = false;
    let _mentionDropdown = null;
    let _mentionStart = -1;

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
                    <div style="display:flex; gap:4px; align-items:center;">
                        <button class="btn btn-icon btn-sm" id="chat-clear" title="Borrar chat" style="padding:5px; border-color:transparent;">
                            <i data-feather="trash-2" style="width:13px;height:13px;color:var(--text-muted);"></i>
                        </button>
                        <button class="btn btn-icon btn-sm" id="chat-close" style="padding:5px; border-color:transparent;">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                </div>
                <div class="chat-messages" id="chat-messages"></div>
                <div class="chat-mention-dropdown hidden" id="chat-mention-dropdown"></div>
                <div class="chat-input-area">
                    <div style="position:relative; flex:1;">
                        <input type="text" id="chat-input" placeholder="Escribe un mensaje... (@nombre para mencionar)" autocomplete="off">
                    </div>
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
                width: 340px;
                height: 480px;
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
                position: relative;
            }
            .chat-row:hover .chat-delete-btn { opacity: 1; }
            .chat-row.sent { flex-direction: row-reverse; }
            .chat-msg-meta {
                display: block;
                font-size: 0.65rem;
                opacity: 0.6;
                margin-top: 4px;
            }
            .chat-input-area {
                padding: 12px 16px;
                border-top: 1px solid var(--border-color);
                display: flex;
                gap: 10px;
                background: var(--bg-surface);
                align-items: center;
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
                width: 100%;
            }
            .chat-input-area input:focus {
                border-color: var(--accent-primary);
                background: var(--bg-surface-hover);
                outline: none;
            }
            /* Delete button on chat messages */
            .chat-delete-btn {
                opacity: 0;
                transition: opacity 0.15s;
                background: var(--accent-danger-bg);
                border: none;
                border-radius: 6px;
                padding: 3px 5px;
                cursor: pointer;
                color: var(--accent-danger);
                font-size: 0.7rem;
                display: flex;
                align-items: center;
                align-self: center;
                flex-shrink: 0;
            }
            .chat-delete-btn:hover { background: var(--accent-danger); color: white; }
            .chat-delete-btn svg { width: 11px; height: 11px; }
            /* Mention highlight */
            .chat-mention {
                background: rgba(94,106,210,0.22);
                color: var(--accent-primary);
                border-radius: 4px;
                padding: 1px 4px;
                font-weight: 600;
            }
            .chat-mention.me {
                background: rgba(94,106,210,0.35);
                color: #fff;
            }
            /* Mention dropdown */
            .chat-mention-dropdown {
                background: var(--bg-surface-2);
                border: 1px solid var(--border-highlight);
                border-radius: 10px;
                box-shadow: var(--shadow-md);
                overflow: hidden;
                max-height: 180px;
                overflow-y: auto;
                margin: 0 12px 0;
            }
            .chat-mention-item {
                padding: 9px 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 0.85rem;
                color: var(--text-primary);
                transition: background 0.1s;
            }
            .chat-mention-item:hover, .chat-mention-item.active {
                background: var(--state-hover);
                color: var(--accent-primary);
            }
            .chat-mention-avatar {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                font-weight: 700;
                color: white;
                flex-shrink: 0;
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
        document.getElementById('chat-clear').addEventListener('click', confirmClearChat);

        const input = document.getElementById('chat-input');
        input.addEventListener('keydown', handleInputKeydown);
        input.addEventListener('input', handleMentionInput);
        input.addEventListener('blur', () => {
            // Delay to allow click on dropdown item
            setTimeout(hideMentionDropdown, 150);
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
    const MIN_MESSAGE_INTERVAL_MS = 500;

    // ── @Mention helpers ───────────────────────────────────────────────────────

    function getMentionQuery(input) {
        const val = input.value;
        const pos = input.selectionStart;
        const before = val.slice(0, pos);
        const match = before.match(/@(\w*)$/);
        if (match) {
            return { query: match[1].toLowerCase(), start: pos - match[0].length };
        }
        return null;
    }

    function handleMentionInput(e) {
        const input = e.target;
        const result = getMentionQuery(input);
        if (result) {
            _mentionStart = result.start;
            const members = store.get.members().filter(m => !m._deleted);
            const filtered = members.filter(m =>
                m.name?.toLowerCase().includes(result.query) ||
                m.email?.toLowerCase().includes(result.query)
            ).slice(0, 6);
            if (filtered.length > 0) {
                showMentionDropdown(filtered);
            } else {
                hideMentionDropdown();
            }
        } else {
            _mentionStart = -1;
            hideMentionDropdown();
        }
    }

    function handleInputKeydown(e) {
        const dropdown = document.getElementById('chat-mention-dropdown');
        const items = dropdown?.querySelectorAll('.chat-mention-item');
        const activeItem = dropdown?.querySelector('.chat-mention-item.active');

        if (!dropdown?.classList.contains('hidden') && items?.length) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = activeItem ? activeItem.nextElementSibling : items[0];
                if (next) { activeItem?.classList.remove('active'); next.classList.add('active'); }
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = activeItem ? activeItem.previousElementSibling : items[items.length - 1];
                if (prev) { activeItem?.classList.remove('active'); prev.classList.add('active'); }
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                if (activeItem) {
                    e.preventDefault();
                    activeItem.click();
                    return;
                }
            }
            if (e.key === 'Escape') {
                hideMentionDropdown();
                return;
            }
        }

        if (e.key === 'Enter' && !e.shiftKey) sendMessage();
    }

    const stringToColor = (str) => {
        if (!str) return 'var(--accent-primary)';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash) % 360;
        return `hsl(${h}, 70%, 60%)`;
    };

    function showMentionDropdown(members) {
        const dropdown = document.getElementById('chat-mention-dropdown');
        if (!dropdown) return;
        dropdown.innerHTML = members.map((m, i) => {
            const name = m.name || m.email || 'Usuario';
            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const color = stringToColor(name);
            return `<div class="chat-mention-item${i === 0 ? ' active' : ''}" data-name="${esc(name)}" data-id="${esc(m.id)}">
                <div class="chat-mention-avatar" style="background:${color}">${initials}</div>
                <span>${esc(name)}</span>
            </div>`;
        }).join('');
        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.chat-mention-item').forEach(item => {
            item.addEventListener('click', () => {
                insertMention(item.dataset.name);
            });
        });
    }

    function hideMentionDropdown() {
        const dropdown = document.getElementById('chat-mention-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
        _mentionStart = -1;
    }

    function insertMention(name) {
        const input = document.getElementById('chat-input');
        const val = input.value;
        const pos = input.selectionStart;
        const nameSlug = name.replace(/\s+/g, '_');
        // Replace from @-start to current cursor with @name
        const before = val.slice(0, _mentionStart);
        const after = val.slice(pos);
        const newVal = before + '@' + nameSlug + ' ' + after;
        input.value = newVal;
        const newPos = before.length + nameSlug.length + 2;
        input.setSelectionRange(newPos, newPos);
        hideMentionDropdown();
        input.focus();
    }

    // ── Send message ───────────────────────────────────────────────────────────

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        if (text.length > MAX_MESSAGE_LENGTH) {
            if (window.showToast) showToast(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`, 'warning');
            return;
        }

        const now = Date.now();
        if (now - _lastMessageTime < MIN_MESSAGE_INTERVAL_MS) {
            if (window.showToast) showToast('Estás enviando mensajes muy rápido.', 'warning');
            return;
        }
        _lastMessageTime = now;

        const actor = getCurrentWorkspaceActor();
        const randBytes = crypto.getRandomValues(new Uint8Array(4));
        const randHex = Array.from(randBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const msg = {
            id: 'msg-' + now + '-' + randHex,
            timestamp: now,
            createdAt: now,
            sender: actor.name || actor.label,
            senderId: actor.id,
            text: text,
            visibility: 'shared'
        };

        await store.dispatch('ADD_MESSAGE', msg);

        if (window.syncManager && window.syncManager.uploadChatMessage) {
            window.syncManager.uploadChatMessage(msg).catch(e => console.error('Chat push error:', e));
        }

        input.value = '';
        hideMentionDropdown();
        updateSyncStatus();
    }

    // ── Delete & clear ────────────────────────────────────────────────────────

    async function deleteMessage(msgId) {
        await store.dispatch('DELETE_MESSAGE', { id: msgId });
        // Optionally delete from Drive too
        if (window.syncManager?.deleteChatMessage) {
            window.syncManager.deleteChatMessage(msgId).catch(() => {});
        }
    }

    function confirmClearChat() {
        const count = store.get.messages().length;
        if (count === 0) {
            if (window.showToast) showToast('El chat ya está vacío.', 'info');
            return;
        }
        if (!confirm(`¿Borrar los ${count} mensajes del chat? Esta acción no se puede deshacer.`)) return;
        store.dispatch('CLEAR_MESSAGES', {}).then(() => {
            if (window.showToast) showToast('Chat borrado.', 'success');
        });
    }

    // ── Sync status ────────────────────────────────────────────────────────────

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

    // ── Render messages ────────────────────────────────────────────────────────

    function highlightMentions(text, currentUserName) {
        // Highlight @mentions in text
        return esc(text).replace(/@([\w_]+)/g, (match, name) => {
            const displayName = name.replace(/_/g, ' ');
            const isMe = currentUserName && (
                displayName.toLowerCase() === currentUserName.toLowerCase() ||
                name.toLowerCase() === currentUserName.replace(/\s+/g, '_').toLowerCase()
            );
            return `<span class="chat-mention${isMe ? ' me' : ''}">@${displayName}</span>`;
        });
    }

    function renderMessages(messages) {
        const list = document.getElementById('chat-messages');
        if (!list) return;

        const currentUser = getCurrentWorkspaceActor();
        const currentName = currentUser.name || currentUser.label || '';
        const lastCount = list.children.length;

        list.innerHTML = messages
            .filter(m => !m._deleted)
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(m => {
                const senderName = m.sender || 'Usuario Desconocido';
                const isMe = (m.senderId && m.senderId === currentUser.id) ||
                    senderName === currentUser.label || senderName === currentUser.name;
                const userColor = stringToColor(senderName);
                const initials = senderName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                const highlightedText = highlightMentions(m.text || '', currentName);

                return `
                    <div class="chat-row ${isMe ? 'sent' : 'received'}">
                        ${!isMe ? `<div class="avatar" style="width:26px; height:26px; font-size:10px; background:${userColor}; flex-shrink:0;">${initials}</div>` : ''}
                        <div class="chat-msg ${isMe ? 'sent' : 'received'}">
                            ${!isMe ? `<span style="color:${userColor}; font-weight:700; display:block; font-size:0.7rem; margin-bottom:4px;">${esc(senderName)}</span>` : ''}
                            <div class="chat-msg-text">${highlightedText}</div>
                            <div class="chat-msg-meta" style="text-align:${isMe ? 'right' : 'left'};">
                                ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        ${isMe ? `<button class="chat-delete-btn" data-id="${esc(m.id)}" title="Eliminar mensaje">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>
                        </button>` : ''}
                    </div>
                `;
            }).join('');

        // Wire delete buttons
        list.querySelectorAll('.chat-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                if (id) deleteMessage(id);
            });
        });

        scrollToBottom();

        if (!_isOpen && messages.length > lastCount) {
            const badge = document.getElementById('chat-badge');
            const diff = messages.length - lastCount;
            const currentBadgeVal = parseInt(badge.textContent, 10) || 0;
            badge.textContent = currentBadgeVal + diff;
            badge.classList.remove('hidden');

            const bubble = document.getElementById('chat-bubble');
            bubble.style.animation = 'none';
            bubble.offsetHeight;
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
