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
            this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
            localStorage.setItem('elabftw_url', this.baseUrl);
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
            const response = await fetch(`${this.baseUrl}/api/v2/experiments`, {
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
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `eLabFTW Error: ${response.status}`);
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
