/**
 * backend-client.js - API Client for Node.js Backend
 * Handles HTTP requests, JWT injection, and automatic Token Refresh loops.
 */

import { StorageManager } from '../utils/storage-manager.js';

// Cambia esto a la URL de tu Cloudflare Worker después de desplegar
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8787' 
    : 'https://workspace-backend.cesaraugustocelada.workers.dev'; 

let currentAccessToken = null; // JWT stored in memory for security
let refreshTokenPromise = null; // Prevents parallel refresh token calls

export const BackendClient = {
    /**
     * Replaces the local access token and persists the refresh token.
     */
    setTokens(accessToken, refreshToken) {
        currentAccessToken = accessToken;
        if (refreshToken) {
            localStorage.setItem('nexus_refresh_token', refreshToken);
        } else {
            localStorage.removeItem('nexus_refresh_token');
        }
    },

    /**
     * Clears authentication material from memory and storage.
     */
    clearTokens() {
        currentAccessToken = null;
        localStorage.removeItem('nexus_refresh_token');
    },

    /**
     * Returns true if there might be a sessions (we have an access or refresh token)
     */
    isAuthenticated() {
        return !!currentAccessToken || !!localStorage.getItem('nexus_refresh_token');
    },

    /**
     * Perform a login using the Google ID Token
     */
    async loginWithGoogle(idToken) {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: idToken })
            });
            
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Autenticación en el servidor fallida');
            }

            const data = await res.json();
            this.setTokens(data.accessToken, data.refreshToken);
            return data;
        } catch (error) {
            console.error('[BackendClient] Login error:', error);
            this.clearTokens();
            throw error;
        }
    },

    /**
     * Attempt to refresh the JWT using the localStorage refresh token
     */
    async refreshToken() {
        const token = localStorage.getItem('nexus_refresh_token');
        if (!token) throw new Error('No hay refresh token disponible');

        try {
            const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: token })
            });

            if (!res.ok) throw new Error('Refresh token inválido o expirado');

            const data = await res.json();
            this.setTokens(data.accessToken, data.refreshToken);
            return data.accessToken;
        } catch (error) {
            console.warn('[BackendClient] Falla al refrescar token, cerrando sesión local.');
            this.clearTokens();
            throw error;
        }
    },

    /**
     * Performs an authenticated fetch against the backend.
     * Automatically injects the JWT and handles 401s by retrying once after refresh.
     */
    async fetch(endpoint, options = {}) {
        // 1. Ensure we have an access token (or try to get one if we only have a refresh token)
        if (!currentAccessToken && localStorage.getItem('nexus_refresh_token')) {
             if (!refreshTokenPromise) {
                 refreshTokenPromise = this.refreshToken().finally(() => { refreshTokenPromise = null; });
             }
             await refreshTokenPromise;
        }

        const headers = new Headers(options.headers || {});
        if (currentAccessToken) {
            headers.set('Authorization', `Bearer ${currentAccessToken}`);
        }
        
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
             headers.set('Content-Type', 'application/json');
        }

        const config = {
            ...options,
            headers
        };

        let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // 2. Handle 401 Unauthorized (Token expired)
        if (response.status === 401 && localStorage.getItem('nexus_refresh_token')) {
            console.log('[BackendClient] Token expirado, intentando refrescar...');
            try {
                if (!refreshTokenPromise) {
                    refreshTokenPromise = this.refreshToken().finally(() => { refreshTokenPromise = null; });
                }
                const newToken = await refreshTokenPromise;
                
                // Retry requested fetch
                headers.set('Authorization', `Bearer ${newToken}`);
                response = await fetch(`${API_BASE_URL}${endpoint}`, { ...config, headers });
            } catch (refreshErr) {
                // If refresh fails, the user is logged out. Let the 401 bubble up.
                console.error('[BackendClient] Refresh fallido durante un fetch.');
            }
        }

        return response;
    },

    /**
     * Logout from the backend
     */
    async logout() {
        const token = localStorage.getItem('nexus_refresh_token');
        this.clearTokens(); // Always clear locally

        if (token) {
            try {
                await fetch(`${API_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: token })
                });
            } catch (err) {
                console.error('[BackendClient] Falla al notificar logout al servidor', err);
            }
        }
    }
};

export default BackendClient;
