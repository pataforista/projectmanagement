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
    }

    setSettings(url, model) {
        if (url) {
            this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
            localStorage.setItem('ollama_url', this.baseUrl);
        }
        if (model) {
            this.model = model;
            localStorage.setItem('ollama_model', model);
        }
    }

    getSettings() {
        return {
            baseUrl: this.baseUrl,
            model: this.model
        };
    }

    /**
     * Basic chat/completion request
     */
    async generate(prompt, systemPrompt = '') {
        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/generate`, {
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
            throw err;
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
}

export const ollamaApi = new OllamaAPI();
window.ollamaApi = ollamaApi;
