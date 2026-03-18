/**
 * api/elabftw.js — eLabFTW Integration for Research Management
 * 
 * Supports creating experiments and linking manuscript sections to 
 * ELN (Electronic Lab Notebook) entries.
 */

class ELabFTWAPI {
    constructor() {
        this.baseUrl = localStorage.getItem('elabftw_url') || '';
        this.apiKey = localStorage.getItem('elabftw_api_key') || '';
    }

    setCredentials(url, key) {
        if (url) {
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    throw new Error('Solo se permiten URLs HTTP/HTTPS');
                }
                this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                localStorage.setItem('elabftw_url', this.baseUrl);
            } catch (e) {
                console.error('[eLabFTW] Invalid URL:', e);
                throw new Error('URL inválida para eLabFTW: ' + e.message);
            }
        }
        if (key) {
            this.apiKey = key;
            localStorage.setItem('elabftw_api_key', key);
        }
    }

    getCredentials() {
        return {
            baseUrl: this.baseUrl,
            apiKey: this.apiKey
        };
    }

    /**
     * Creates a new experiment draft in eLabFTW
     */
    async createExperiment(title, body = '') {
        if (!this.baseUrl || !this.apiKey) {
            throw new Error('Configuración de eLabFTW incompleta (URL o API Key faltante).');
        }

        try {
            const response = await fetchWithTimeout(`${this.baseUrl}/api/v2/experiments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.apiKey
                },
                body: JSON.stringify({
                    title: title,
                    body: body,
                    tag: 'workspace-export'
                })
            });

            if (!response.ok) {
                let errorMsg = response.statusText || `HTTP ${response.status}`;
                try {
                    const errData = await response.json();
                    errorMsg = errData.message || errData.error || errorMsg;
                } catch (e) {
                    // JSON parse failed, use statusText
                }
                throw new Error(`eLabFTW Error: ${response.status} — ${errorMsg}`);
            }

            const data = await response.json();
            return data; // Returns { id: ..., title: ..., ...}
        } catch (err) {
            console.error('[eLabFTW] Error:', err);
            throw err;
        }
    }
}

export const elabftwApi = new ELabFTWAPI();
window.elabftwApi = elabftwApi;
