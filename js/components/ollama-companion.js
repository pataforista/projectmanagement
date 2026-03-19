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
                    <button class="btn btn-icon" id="ollama-close" title="Cerrar (Esc)" type="button">
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
                        <button class="btn btn-primary btn-icon" id="ollama-send" title="Enviar (Enter)" type="button">
                            <i data-feather="send"></i>
                        </button>
                    </div>
                </div>
            </div>
            <button id="ollama-toggle-fab" class="ollama-fab" title="Abrir AI Companion (Ctrl+Space)">
                <i data-feather="zap"></i>
            </button>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        this.el = document.getElementById('ollama-companion');
        if (window.feather) feather.replace();
        this.refreshInterface();
    }

    setupListeners() {
        // Close button 
        const closeBtn = this.el.querySelector('#ollama-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                console.log('[Companion] Close clicked');
                e.preventDefault();
                e.stopPropagation();
                this.toggle(false);
            });
        }

        // Close on outside click for better UX
        document.addEventListener('click', (e) => {
            if (this.isOpen && this.el) {
                const path = e.composedPath();
                if (!path.includes(this.el) && !path.some(el => el && (el.id === 'ollama-toggle-fab' || el.id === 'ollama-status-widget'))) {
                    this.toggle(false);
                }
            }
        });

        // Floating action button (FAB) - toggle companion
        const fabBtn = document.getElementById('ollama-toggle-fab');
        if (fabBtn) {
            fabBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[Companion] FAB button clicked');
                this.toggle();
            });
        }

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
        console.log('[Companion] Toggle called, isOpen:', this.isOpen);

        // Ensure the element exists before manipulating
        if (!this.el) {
            console.error('[Companion] Element not found, cannot toggle');
            return;
        }

        // Update class based on state
        if (this.isOpen) {
            this.el.classList.add('open');
            this.renderQuickActions();
            const input = this.el.querySelector('#ollama-input');
            if (input) input.focus();
            this.scrollToBottom();
            console.log('[Companion] Panel opened');
        } else {
            this.el.classList.remove('open');
            console.log('[Companion] Panel closed');
        }
    }

    refreshInterface() {
        const content = this.el.querySelector('#ollama-chat-content');
        if (this.status === 'disconnected') {
            const settings = ollamaApi.getSettings();
            const isCorsIssue = ollamaApi._shouldWarnAboutCors();

            content.innerHTML = `
                <div class="ollama-offline-screen">
                    <i data-feather="cloud-off" class="offline-icon"></i>
                    <h3 class="offline-title">Ollama no detectado</h3>
                    <p class="offline-hint">
                        ${isCorsIssue
                            ? '⚠️ Error CORS detectado. Tu app es HTTPS pero Ollama es HTTP.'
                            : 'Para usar el asistente, asegúrate de que Ollama esté corriendo en tu PC.'}
                    </p>
                    ${isCorsIssue ? `
                        <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.3); border-radius:8px; padding:12px; font-size:0.75rem; color:var(--text-secondary); margin-bottom:12px; text-align:left;">
                            <strong style="color:var(--accent-danger); font-size: 0.85rem; display:block; margin-bottom: 8px;">Cómo solucionar el error CORS:</strong>
                            <p style="margin-bottom: 8px;">Por seguridad, los navegadores bloquean peticiones locales. Debes indicarle a Ollama que permita conexiones.</p>
                            
                            <strong style="color:var(--text-primary); margin-top: 8px; display:block;">Opción A: Terminal (Temporal)</strong>
                            <div style="margin-bottom: 8px; padding-left: 8px; border-left: 2px solid var(--accent-primary);">
                                <em>Windows (PowerShell):</em><br/>
                                <code style="display:block; margin:4px 0; color:var(--accent-teal); padding: 4px; border-radius: 4px; background: rgba(0,0,0,0.2); user-select: all;">$env:OLLAMA_ORIGINS="*"<br>ollama serve</code>
                                <em>Mac/Linux:</em><br/>
                                <code style="display:block; margin:4px 0; color:var(--accent-teal); padding: 4px; border-radius: 4px; background: rgba(0,0,0,0.2); user-select: all;">OLLAMA_ORIGINS="*" ollama serve</code>
                            </div>

                            <strong style="color:var(--text-primary); margin-top: 8px; display:block;">Opción B: Windows (Permanente)</strong>
                            <ol style="padding-left: 16px; margin-top: 4px; margin-bottom: 8px;">
                                <li>Cierra completamente la app de Ollama (desde la bandeja cerca del reloj de Windows).</li>
                                <li>Abre el menú Inicio y busca <strong>"Variables de entorno"</strong>.</li>
                                <li>Haz clic en <strong>"Editar las variables de entorno del sistema"</strong> &gt; botón <strong>"Variables de entorno..."</strong>.</li>
                                <li>En "Variables del usuario", haz clic en <strong>"Nueva..."</strong>.</li>
                                <li>Nombre: <code style="color:var(--accent-teal); user-select: all;">OLLAMA_ORIGINS</code></li>
                                <li>Valor: <code style="color:var(--accent-teal); user-select: all;">*</code></li>
                                <li>Acepta todo y vuelve a abrir la app de Ollama.</li>
                            </ol>
                            
                            <strong style="color:var(--text-primary); margin-top: 8px; display:block;">Opción C: Configuración de la App</strong>
                            <p style="margin-top: 4px; margin-bottom: 0;">Ve a <strong>Integraciones</strong> (icono de engranaje en el menú izquierdo abajo) y configura un Proxy CORS.</p>
                        </div>
                    ` : ''}
                    <div class="offline-cmd" id="copy-ollama-cmd">
                        ollama run ${this.model}
                    </div>
                    <button class="btn btn-secondary btn-sm" id="btn-retry-ollama">
                        <i data-feather="refresh-cw"></i> Re-intentar conexión
                    </button>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:10px;">
                        URL: <code>${settings.baseUrl}</code><br/>
                        ${settings.corsProxyUrl ? `Proxy: <code>${settings.corsProxyUrl}</code>` : ''}
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
                <div class="ollama-bubble ${msg.role === 'user' ? 'ollama-bubble-user' : 'ollama-bubble-ai'}">
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

        // Loading and Streaming state
        const chatContent = this.el.querySelector('#ollama-chat-content');
        const aiBubbleId = `ai-bubble-${Date.now()}`;
        const aiHtml = `
            <div class="ollama-bubble ollama-bubble-ai" id="${aiBubbleId}">
                <i data-feather="loader" class="spin" style="width:14px;height:14px;"></i> Pensando...
            </div>
        `;
        chatContent.insertAdjacentHTML('beforeend', aiHtml);
        if (window.feather) feather.replace();
        this.scrollToBottom();

        const aiBubble = document.getElementById(aiBubbleId);
        let fullResponse = '';

        try {
            await ollamaApi.generate(content, '', (chunk, accumulated) => {
                fullResponse = accumulated;
                // Replace loader with text on first chunk
                aiBubble.innerHTML = esc(fullResponse).replace(/\n/g, '<br>');
                this.scrollToBottom();
            });
            
            this.history.push({ role: 'assistant', content: fullResponse });
            this.saveHistory();
            // Final render to clean up any formatting issues
            this.renderHistory();
        } catch (e) {
            aiBubble?.remove();
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
