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

        // If CORS proxy is configured, route through it
        if (this.corsProxyUrl) {
            try {
                // URL encode the target URL for the proxy
                const proxyUrl = new URL(this.corsProxyUrl);
                proxyUrl.searchParams.set('url', fullUrl);
                return proxyUrl.toString();
            } catch (e) {
                console.warn('[Ollama] Invalid CORS proxy URL, using direct connection:', e);
                return fullUrl;
            }
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
     */
    async generate(prompt, systemPrompt = '') {
        try {
            const fetchUrl = this._buildFetchUrl('/api/generate');
            const response = await fetchWithTimeout(fetchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    system: systemPrompt,
                    stream: false
                })
            });

            if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
            const data = await response.json();
            return data.response;
        } catch (err) {
            console.error('[Ollama] Error:', err);
            this._handleCorsError(err);
            throw err;
        }
    }

    /**
     * Handles and logs helpful CORS error messages
     * @private
     */
    _handleCorsError(error) {
        const errorMsg = error?.message || '';
        const isCorsError = errorMsg.includes('CORS') || errorMsg.includes('Failed to fetch') || errorMsg.includes('origin');
        const shouldWarnCors = this._shouldWarnAboutCors();

        if (isCorsError || shouldWarnCors) {
            console.error('[Ollama] CORS/Mixed-content issue detected. Solutions:');
            console.error('1. Configure Ollama CORS on your local machine (RECOMMENDED):');
            console.error('   - Set environment variable: OLLAMA_ORIGINS="https://pataforista.github.io"');
            console.error('   - Or use wildcard: OLLAMA_ORIGINS="*" (less secure)');
            console.error('2. Use a CORS proxy service by configuring it in the Integrations panel');
            console.error('3. Run this locally over HTTP instead of HTTPS');
        }
    }

    /**
     * Health check - ping the Ollama server
     */
    async healthCheck() {
        try {
            const fetchUrl = this._buildFetchUrl('/api/tags');
            const response = await fetchWithTimeout(fetchUrl);
            return response.ok;
        } catch (err) {
            console.warn('[Ollama] Health check failed:', err);
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
