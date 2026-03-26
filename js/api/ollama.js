/**
 * api/ollama.js — Local AI Assistant via Ollama
 *
 * Interacts with a local Ollama instance (default: http://localhost:11434)
 * providing researchers with local, private LLM capabilities.
 */

class OllamaAPI {
    constructor() {
        this.baseUrl = localStorage.getItem('ollama_url') || 'http://localhost:11434';
        this.model = localStorage.getItem('ollama_model') || 'llama3';
        this.corsProxyUrl = localStorage.getItem('ollama_cors_proxy') || '';
        this._isOffline = false;
        this._lastCheck = 0;

        // We will evaluate the proxy dynamically in _getActiveProxy()
    }

    /**
     * Dynamically determines the active CORS proxy to use.
     * @private
     */
    _getActiveProxy() {
        if (this.corsProxyUrl) return this.corsProxyUrl;
        
        // AUTO-CONFIG: If using BackendClient, we can use it as a proxy to bypass CORS
        if (typeof BackendClient !== 'undefined' && BackendClient.isAuthenticated()) {
            const apiBase = BackendClient.getApiBaseUrl(); // e.g. https://.../api
            return `${apiBase}/ai/ollama`;
        }
        return '';
    }

    setSettings(url, model, corsProxy = '') {
        if (url) {
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    throw new Error('Solo se permiten URLs HTTP/HTTPS');
                }
                this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                localStorage.setItem('ollama_url', this.baseUrl);
            } catch (e) {
                console.error('[Ollama] Invalid URL:', e);
                throw new Error('URL inválida para Ollama: ' + e.message);
            }
        }
        if (model) {
            this.model = model;
            localStorage.setItem('ollama_model', model);
        }
        if (corsProxy !== undefined) {
            this.corsProxyUrl = corsProxy;
            if (corsProxy) {
                localStorage.setItem('ollama_cors_proxy', corsProxy);
            } else {
                localStorage.removeItem('ollama_cors_proxy');
            }
        }
    }

    getSettings() {
        return {
            baseUrl: this.baseUrl,
            model: this.model,
            corsProxyUrl: this.corsProxyUrl
        };
    }

    /**
     * Builds the actual URL to fetch from, handling CORS proxy if configured
     * @private
     */
    _buildFetchUrl(endpoint) {
        const fullUrl = `${this.baseUrl}${endpoint}`;
        const activeProxy = this._getActiveProxy();

        // If CORS proxy is configured, route through it
        if (activeProxy) {
            try {
                // If it's our backend proxy, we use a specific pattern
                if (activeProxy.includes('/api/ai/ollama')) {
                    return `${activeProxy}${endpoint}`;
                }
                // Generic proxy fallback
                const proxyUrl = new URL(activeProxy);
                proxyUrl.searchParams.set('url', fullUrl);
                return proxyUrl.toString();
            } catch (e) {
                console.warn('[Ollama] Invalid CORS proxy URL, using direct connection:', e);
                return fullUrl;
            }
        }

        // Auto-detect CORS issues and suggest configuration
        if (this._shouldWarnAboutCors()) {
            console.warn('[Ollama] CORS issue detected (HTTPS → HTTP). Configure CORS on Ollama or use a proxy.');
        }

        return fullUrl;
    }

    /**
     * Detects if we need CORS proxy based on protocol mismatch
     * @private
     */
    _shouldWarnAboutCors() {
        // If frontend is HTTPS and Ollama is HTTP, CORS will be an issue
        try {
            const frontendProtocol = window.location.protocol; // https: or http:
            const ollamaUrl = new URL(this.baseUrl);
            return frontendProtocol === 'https:' && ollamaUrl.protocol === 'http:';
        } catch {
            return false;
        }
    }

    /**
     * Basic chat/completion request
     * Supports both direct return (buffered) and streaming callback
     */
    async generate(prompt, systemPrompt = '', onChunk = null) {
        try {
            const fetchUrl = this._buildFetchUrl('/api/generate');
            const headers = { 'Content-Type': 'application/json' };
            const activeProxy = this._getActiveProxy();
            if (activeProxy && activeProxy.includes('/api/ai/ollama')) {
                headers['x-ollama-url'] = this.baseUrl;
            }

            const response = await fetch(fetchUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    system: systemPrompt,
                    stream: !!onChunk
                })
            });

            if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);

            if (onChunk) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');

                    // Keep the last partial line in the buffer
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                fullResponse += json.response;
                                onChunk(json.response, fullResponse);
                            }
                        } catch (e) {
                            console.warn('[Ollama] Error parsing stream line:', e);
                        }
                    }
                }
                // Process any remaining data in buffer
                if (buffer.trim()) {
                    try {
                        const json = JSON.parse(buffer);
                        if (json.response) {
                            fullResponse += json.response;
                            onChunk(json.response, fullResponse);
                        }
                    } catch (e) { /* ignore final partial */ }
                }
                return fullResponse;
            } else {
                const data = await response.json();
                return data.response;
            }
        } catch (err) {
            console.error('[Ollama] Error:', err);
            this._handleCorsError(err);
            throw err;
        }
    }

    /**
     * Handles and logs helpful CORS error messages
     * Only logs if there's an actual CORS / mixed-content issue, not a simple offline error.
     * @private
     */
    _handleCorsError(error) {
        const errorMsg = error?.message || '';
        const isCorsError = errorMsg.includes('CORS') || errorMsg.includes('origin');
        const shouldWarnCors = this._shouldWarnAboutCors();

        if (isCorsError || shouldWarnCors) {
            console.warn('[Ollama] CORS/Mixed-content issue detected. Solutions:');
            console.warn('1. Set environment variable: OLLAMA_ORIGINS="*" then run: ollama serve');
            console.warn('2. Use a CORS proxy in the Integrations panel.');
        }
    }

    /**
     * Health check - ping the Ollama server
     */
    async healthCheck() {
        const now = Date.now();
        // If it was offline recently, don't spam requests (and console errors)
        if (this._isOffline && (now - this._lastCheck) < 60000) return false;
        
        this._lastCheck = now;
        try {
            const fetchUrl = this._buildFetchUrl('/api/tags');
            const headers = {};
            const activeProxy = this._getActiveProxy();
            if (activeProxy && activeProxy.includes('/api/ai/ollama')) {
                headers['x-ollama-url'] = this.baseUrl;
            }

            // Using a very short timeout for healthcheck to avoid hanging
            const response = await fetchWithTimeout(fetchUrl, { headers, timeout: 2000 });
            if (!response.ok) {
                this._isOffline = true;
                return false;
            }
            this._isOffline = false;
            return true;
        } catch (err) {
            this._isOffline = true;
            return false;
        }
    }

    /**
     * Specialized method to generate research tags from an abstract/title
     */
    async suggestTags(title, abstract = '') {
        const system = 'Eres un asistente de investigación científica. Tu tarea es extraer exactamente 5 etiquetas (tags) clave separadas por comas que describan el contenido del abstract. Solo devuelve las etiquetas, nada más.';
        const prompt = `Título: ${title}\nAbstract: ${abstract}\n\nEtiquetas:`;

        try {
            const result = await this.generate(prompt, system);
            return result.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
        } catch (e) {
            return [];
        }
    }

    /**
     * Summarize a project based on its description and task list
     */
    async summarizeProject(project, tasksList = []) {
        const system = 'Eres un asistente de gestión de proyectos. Tu tarea es generar un resumen conciso (2-3 oraciones) del estado actual del proyecto basado en su descripción y lista de tareas. Sé específico y práctico.';

        const tasksSummary = tasksList && tasksList.length
            ? tasksList.slice(0, 10).map(t => `- ${t.title} (${t.status})`).join('\n')
            : '(sin tareas)';

        const prompt = `Proyecto: ${project.name}
Tipo: ${project.type || 'libre'}
Objetivo: ${project.goal || project.description || '(sin descripción)'}

Tareas (primeras 10):
${tasksSummary}

Resumen:`;

        try {
            return await this.generate(prompt, system);
        } catch (e) {
            console.error('[Ollama] summarizeProject error:', e);
            return '';
        }
    }

    /**
     * Suggest tasks for a project based on its description
     */
    async suggestTasks(project) {
        const system = 'Eres un asistente especializado en descomposición de trabajo. Basándote en la descripción del proyecto, sugiere 5-8 tareas concretas y accionables que deberían ser parte de este proyecto. Devuelve solo los títulos, uno por línea, sin números ni viñetas.';

        const prompt = `Proyecto: ${project.name}
Tipo: ${project.type || 'libre'}
Objetivo/Descripción: ${project.goal || project.description || '(sin descripción)'}

Tareas sugeridas:`;

        try {
            const result = await this.generate(prompt, system);
            return result
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.match(/^\d+[\.\)]/))
                .slice(0, 8);
        } catch (e) {
            console.error('[Ollama] suggestTasks error:', e);
            return [];
        }
    }

    /**
     * Semantic search across items
     */
    async semanticSearch(query, items) {
        if (!items || items.length === 0) return [];

        const system = 'Eres un asistente de búsqueda semántica. El usuario busca algo específico. Evalúa la relevancia de cada elemento (escala 0-100) y devuelve solo números separados por comas, uno por línea, en el mismo orden de los elementos.';

        const itemsList = items.slice(0, 20).map((item, idx) =>
            `${idx + 1}. "${item.name || item.title}" - ${item.description || item.goal || ''}`
        ).join('\n');

        const prompt = `Búsqueda del usuario: "${query}"

Elementos a evaluar:
${itemsList}

Puntuación de relevancia (0-100):`;

        try {
            const result = await this.generate(prompt, system);
            const scores = result
                .split('\n')
                .map(line => parseInt(line.trim()))
                .filter(n => !isNaN(n));

            return items.slice(0, 20)
                .map((item, idx) => ({
                    item,
                    score: scores[idx] || 0
                }))
                .filter(r => r.score > 40)
                .sort((a, b) => b.score - a.score);
        } catch (e) {
            console.error('[Ollama] semanticSearch error:', e);
            return [];
        }
    }

    /**
     * Generate a project report
     */
    async generateProjectReport(project, activities = [], period = 'month') {
        const system = 'Eres un escritor de reportes ejecutivos profesional. Basándote en la actividad del proyecto, genera un informe conciso (3-4 párrafos) que incluya: estado, progreso, logros clave, y bloqueantes. Sé específico, profesional y útil.';

        const periodLabel = {
            'week': 'semana',
            'month': 'mes',
            'quarter': 'trimestre'
        }[period] || 'período';

        const activitiesSummary = activities && activities.length
            ? activities.slice(0, 15).map(a => `- ${a.text || a.description || 'Cambio registrado'}`).join('\n')
            : '(sin cambios registrados)';

        const prompt = `Proyecto: ${project.name}
Período: Último ${periodLabel}
Tipo: ${project.type || 'libre'}
Objetivo: ${project.goal || project.description || '(sin descripción)'}
Estado: ${project.status || 'activo'}

Cambios recientes:
${activitiesSummary}

Generar reporte:`;

        try {
            return await this.generate(prompt, system);
        } catch (e) {
            console.error('[Ollama] generateProjectReport error:', e);
            return '';
        }
    }
}

export const ollamaApi = new OllamaAPI();
window.ollamaApi = ollamaApi;
