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

/**
 * Returns a stable device UUID, generating one on first use.
 * Stored in localStorage so it persists across sessions on the same device.
 */
function getDeviceId() {
    let id = localStorage.getItem('nexus_device_id');
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem('nexus_device_id', id);
    }
    return id;
}

/**
 * Returns a per-account storage key for the refresh token.
 * Uses the current session email to scope tokens, preventing cross-account
 * contamination when multiple accounts are used in different tabs.
 * Falls back to the legacy key if no email is available.
 */
function getRefreshTokenKey() {
    const email = StorageManager.get('workspace_user_email', 'session');
    return email ? `nexus_refresh_token_${email}` : 'nexus_refresh_token';
}

export const BackendClient = {
    /**
     * Replaces the local access token and persists the refresh token.
     */
    setTokens(accessToken, refreshToken) {
        currentAccessToken = accessToken;
        if (refreshToken) {
            const key = getRefreshTokenKey();
            localStorage.setItem(key, refreshToken);
            // Also set legacy key for backward compat during migration
            localStorage.setItem('nexus_refresh_token', refreshToken);
        } else {
            this.clearTokens();
        }
    },

    /**
     * Clears authentication material from memory and storage.
     */
    clearTokens() {
        currentAccessToken = null;
        const key = getRefreshTokenKey();
        localStorage.removeItem(key);
        localStorage.removeItem('nexus_refresh_token');
    },

    /**
     * Returns true if there might be a session (we have an access or refresh token)
     */
    isAuthenticated() {
        return !!currentAccessToken || !!this._getStoredRefreshToken();
    },

    /**
     * Reads the refresh token from storage, preferring per-account key.
     */
    _getStoredRefreshToken() {
        const key = getRefreshTokenKey();
        return localStorage.getItem(key) || localStorage.getItem('nexus_refresh_token');
    },

    /**
     * Perform a login using the Google ID Token
     */
    async loginWithGoogle(idToken) {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken: idToken })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.message || 'Autenticación en el servidor fallida');
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
     * Attempt to refresh the JWT using the stored refresh token
     */
    async refreshToken() {
        const token = this._getStoredRefreshToken();
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
        if (!currentAccessToken && this._getStoredRefreshToken()) {
             if (!refreshTokenPromise) {
                 refreshTokenPromise = this.refreshToken().finally(() => { refreshTokenPromise = null; });
             }
             await refreshTokenPromise;
        }

        const headers = new Headers(options.headers || {});
        if (currentAccessToken) {
            headers.set('Authorization', `Bearer ${currentAccessToken}`);
        }
        headers.set('x-device-id', getDeviceId());

        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
             headers.set('Content-Type', 'application/json');
        }

        const config = {
            ...options,
            headers
        };

        let response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // 2. Handle 401 Unauthorized (Token expired)
        if (response.status === 401 && this._getStoredRefreshToken()) {
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
     * Logout from the backend.
     * Revokes the session on the server BEFORE clearing local tokens,
     * so the Authorization header is still valid when the request is sent.
     */
    async logout() {
        const token = this._getStoredRefreshToken();

        if (token) {
            try {
                // Use this.fetch() so the Bearer token is injected automatically
                await this.fetch('/auth/logout', {
                    method: 'POST',
                    body: JSON.stringify({ refreshToken: token })
                });
            } catch (err) {
                console.error('[BackendClient] Falla al notificar logout al servidor', err);
            }
        }

        this.clearTokens(); // Clear locally after notifying the server
    }
};

export default BackendClient;
