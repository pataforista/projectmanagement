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
                    <h3>Chat de Equipo</h3>
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
                padding: 8px 12px;
                border-radius: 12px;
                font-size: 0.85rem;
                position: relative;
            }
            .chat-msg.sent {
                align-self: flex-end;
                background: var(--accent-primary);
                color: white;
                border-bottom-right-radius: 2px;
            }
            .chat-msg.received {
                align-self: flex-start;
                background: var(--bg-secondary);
                color: var(--text-primary);
                border-bottom-left-radius: 2px;
            }
            .chat-msg-meta {
                display: block;
                font-size: 0.65rem;
                opacity: 0.7;
                margin-bottom: 2px;
            }
            .chat-input-area {
                padding: 12px;
                border-top: 1px solid var(--border-color);
                display: flex;
                gap: 8px;
            }
            .chat-input-area input {
                flex: 1;
                background: var(--bg-input);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 6px 12px;
                color: var(--text-primary);
                font-size: 0.85rem;
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

    async function sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;

        const actor = getCurrentWorkspaceActor();

        await store.dispatch('ADD_MESSAGE', {
            sender: actor.label,
            senderId: actor.id,
            author: actor.label,
            text: text,
            projectId: window.router?.current?.params?.projectId || null
        });

        input.value = '';
    }

    function renderMessages(messages) {
        const list = document.getElementById('chat-messages');
        if (!list) return;

        const currentUser = getCurrentWorkspaceActor();
        const lastCount = list.children.length;

        // Color helper: Hash string to HSL color
        const stringToColor = (str) => {
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
                const isMe = (m.senderId && m.senderId === currentUser.id) || m.sender === currentUser.label || m.sender === currentUser.name;
                const userColor = stringToColor(m.sender);
                return `
                    <div class="chat-msg ${isMe ? 'sent' : 'received'}" style="${!isMe ? `--sender-color:${userColor}` : '--sender-color:rgba(255,255,255,0.8)'}">
                        <span class="chat-msg-sender" style="color:var(--sender-color); font-weight:700; display:block; font-size:0.7rem; margin-bottom:4px;">
                            ${isMe ? 'Tú' : esc(m.sender)}
                        </span>
                        <div class="chat-msg-text">${esc(m.text)}</div>
                        <div class="chat-msg-meta" style="font-size:0.6rem; margin-top:4px; opacity:0.6; text-align:right;">
                            ${new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                `;
            }).join('');

        scrollToBottom();

        // Badge logic if closed
        if (!_isOpen && messages.length > lastCount && lastCount > 0) {
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
