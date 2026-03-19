/**
 * ollama-companion.js — Centralized AI Assistant Experience
 * Manages the global AI sidebar, chat history, and context-aware actions.
 */

import { ollamaApi } from '../api/ollama.js';
import { esc, showToast } from '../utils.js';

class OllamaCompanion {
    constructor() {
        this.isOpen = false;
        this.history = JSON.parse(localStorage.getItem('ollama_chat_history') || '[]');
        this.status = 'disconnected'; // connected, disconnected, loading
        this.el = null;
        this.model = localStorage.getItem('ollama_model') || 'llama3';
    }

    init() {
        this.renderBase();
        this.setupListeners();
        this.checkConnection();
        // Periodically check connection
        setInterval(() => this.checkConnection(), 30000);
    }

    renderBase() {
        const html = `
            <div id="ollama-companion" class="glass-panel">
                <div class="ollama-header">
                    <div class="ollama-brand">
                        <i data-feather="zap"></i>
                        <h2>AI Companion</h2>
                    </div>
                    <button class="btn btn-icon" id="ollama-close" title="Cerrar (Esc)">
                        <i data-feather="x"></i>
                    </button>
                </div>
                <div class="ollama-content" id="ollama-chat-content">
                    <!-- Dynamic content: Chat or Offline Screen -->
                </div>
                <div class="ollama-footer">
                    <div class="ollama-actions" id="ollama-quick-actions">
                        <!-- Context actions here -->
                    </div>
                    <div class="ollama-input-container">
                        <textarea id="ollama-input" placeholder="Pregunta algo o usa una acción..." rows="1"></textarea>
                        <button class="btn btn-primary btn-icon" id="ollama-send" title="Enviar (Enter)">
                            <i data-feather="send"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        this.el = document.getElementById('ollama-companion');
        if (window.feather) feather.replace();
        this.refreshInterface();
    }

    setupListeners() {
        this.el.querySelector('#ollama-close').addEventListener('click', () => this.toggle(false));
        
        const input = this.el.querySelector('#ollama-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.el.querySelector('#ollama-send').addEventListener('click', () => this.sendMessage());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isOpen) {
                this.toggle(false);
            }
        });

        // Global context update listener
        window.addEventListener('hashchange', () => {
            if (this.isOpen) this.renderQuickActions();
        });
    }

    async checkConnection() {
        const oldStatus = this.status;
        try {
            // Ping Ollama tags endpoint as a health check
            const isHealthy = await ollamaApi.healthCheck();
            this.status = isHealthy ? 'connected' : 'disconnected';
        } catch (e) {
            this.status = 'disconnected';
        }

        if (oldStatus !== this.status) {
            this.updateStatusUI();
            this.refreshInterface();
        }
    }

    updateStatusUI() {
        const led = document.getElementById('ollama-led');
        const label = document.getElementById('ollama-status-label');
        if (!led) return;

        led.className = `ollama-led ${this.status === 'connected' ? 'online' : 'error'}`;
        if (label) label.textContent = this.status === 'connected' ? 'IA Lista' : 'IA Offline';
    }

    toggle(force) {
        this.isOpen = force !== undefined ? force : !this.isOpen;
        this.el.classList.toggle('open', this.isOpen);
        if (this.isOpen) {
            this.renderQuickActions();
            this.el.querySelector('#ollama-input').focus();
            this.scrollToBottom();
        }
    }

    refreshInterface() {
        const content = this.el.querySelector('#ollama-chat-content');
        if (this.status === 'disconnected') {
            content.innerHTML = `
                <div class="ollama-offline-screen">
                    <i data-feather="cloud-off" class="offline-icon"></i>
                    <h3 class="offline-title">Ollama no detectado</h3>
                    <p class="offline-hint">Para usar el asistente, asegúrate de que Ollama esté corriendo en tu PC.</p>
                    <div class="offline-cmd" id="copy-ollama-cmd">
                        ollama run ${this.model}
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-retry-ollama">
                        <i data-feather="refresh-cw"></i> Re-intentar conexión
                    </button>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;">
                        URL: <code>${ollamaApi.baseUrl}</code>
                    </div>
                </div>
            `;
            content.querySelector('#btn-retry-ollama').addEventListener('click', () => {
                this.status = 'loading';
                this.updateStatusUI();
                this.checkConnection();
            });
            content.querySelector('#copy-ollama-cmd').addEventListener('click', () => {
                navigator.clipboard.writeText(`ollama run ${this.model}`);
                showToast('Comando copiado al portapapeles');
            });
            if (window.feather) feather.replace();
        } else {
            this.renderHistory();
        }
    }

    renderHistory() {
        const content = this.el.querySelector('#ollama-chat-content');
        if (this.history.length === 0) {
            content.innerHTML = `
                <div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--text-muted); padding:40px; text-align:center;">
                    <i data-feather="message-square" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>
                    <p>¡Hola! Soy tu asistente de IA local.<br>Puedo ayudarte a resumir documentos, mejorar tu escritura o responder dudas sobre tus proyectos.</p>
                </div>
            `;
        } else {
            content.innerHTML = this.history.map(msg => `
                <div class="chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-ai'}">
                    ${esc(msg.content).replace(/\n/g, '<br>')}
                </div>
            `).join('');
        }
        if (window.feather) feather.replace();
        this.scrollToBottom();
    }

    renderQuickActions() {
        const actionsContainer = this.el.querySelector('#ollama-quick-actions');
        const view = window.router?.current?.viewName || 'dashboard';
        
        const globalActions = [
            { id: 'summarize-day', label: 'Resumen del día', icon: 'sun', prompt: 'Resume mis tareas pendientes de hoy y mis prioridades actuales de forma motivadora.' },
            { id: 'prioritize', label: 'Priorizar backlog', icon: 'list', prompt: 'Analiza mis tareas actuales y sugiéreme cuáles son las 3 más importantes para atacar ahora mismo.' }
        ];

        const viewActions = {
            'dashboard': [
                { id: 'status-check', label: 'Salud del workspace', icon: 'heart', prompt: 'Analiza el estado de mis proyectos activos y dime si hay alguno que necesite atención inmediata.' }
            ],
            'writing': [
                { id: 'fix-grammar', label: 'Corregir gramática', icon: 'edit-3', prompt: 'Revisa la gramática y estilo del texto seleccionado o del manuscrito actual.' },
                { id: 'improve-tone', label: 'Tono académico', icon: 'feather', prompt: 'Reescribe el párrafo seleccionado con un tono más científico y riguroso.' },
                { id: 'abstract', label: 'Generar Abstract', icon: 'file-text', prompt: 'Genera un borrador de abstract basado en el contenido de este manuscrito.' }
            ],
            'library': [
                { id: 'summarize-paper', label: 'Resumir paper', icon: 'zap', prompt: 'Realiza un resumen ejecutivo de este recurso, destacando metodología y resultados clave.' },
                { id: 'suggest-tags', label: 'Sugerir etiquetas', icon: 'tag', prompt: 'Analiza este recurso y sugiere 5 etiquetas relevantes para mi biblioteca.' }
            ],
            'project': [
                { id: 'project-report', label: 'Reporte de estado', icon: 'activity', prompt: 'Genera un reporte de progreso para este proyecto basado en las tareas completadas y pendientes.' },
                { id: 'suggest-tasks', label: 'Desglosar tareas', icon: 'trending-up', prompt: 'Basado en el objetivo del proyecto, sugiere los siguientes pasos lógicos en forma de tareas concretas.' }
            ]
        };

        const currentActions = [...globalActions, ...(viewActions[view] || [])];
        
        actionsContainer.innerHTML = currentActions.map(action => `
            <div class="action-pill" data-prompt="${esc(action.prompt)}">
                <i data-feather="${action.icon}"></i> ${action.label}
            </div>
        `).join('');

        actionsContainer.querySelectorAll('.action-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                this.sendMessage(pill.dataset.prompt);
            });
        });

        if (window.feather) feather.replace();
    }

    async sendMessage(text) {
        const input = this.el.querySelector('#ollama-input');
        const content = text || input.value.trim();
        if (!content || this.status === 'disconnected') return;

        // Reset input
        if (!text) input.value = '';

        // Add to history
        this.history.push({ role: 'user', content });
        this.renderHistory();

        // Loading state
        const loadingHtml = `
            <div class="chat-bubble bubble-ai" id="ollama-loading">
                <i data-feather="loader" class="spin" style="width:14px;height:14px;"></i> Pensando...
            </div>
        `;
        this.el.querySelector('#ollama-chat-content').insertAdjacentHTML('beforeend', loadingHtml);
        if (window.feather) feather.replace();
        this.scrollToBottom();

        try {
            const response = await ollamaApi.generate(content);
            this.el.querySelector('#ollama-loading')?.remove();
            
            this.history.push({ role: 'assistant', content: response });
            this.saveHistory();
            this.renderHistory();
        } catch (e) {
            this.el.querySelector('#ollama-loading')?.remove();
            showToast('Error IA: ' + e.message, 'error');
            this.history.push({ role: 'assistant', content: 'Lo siento, hubo un error procesando tu solicitud: ' + e.message });
            this.renderHistory();
        }
    }

    saveHistory() {
        // Keep only last 20 messages for performance
        if (this.history.length > 20) this.history = this.history.slice(-20);
        localStorage.setItem('ollama_chat_history', JSON.stringify(this.history));
    }

    scrollToBottom() {
        const content = this.el.querySelector('#ollama-chat-content');
        content.scrollTop = content.scrollHeight;
    }
}

export const companion = new OllamaCompanion();
window.ollamaCompanion = companion;
