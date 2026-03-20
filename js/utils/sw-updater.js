/**
 * Service Worker Update Manager
 * Handles SW version detection, update checking, and forced updates
 */

export class SWUpdater {
    constructor() {
        this.currentVersion = null;
        this.lastCheckTime = 0;
        this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        this.updateCallbacks = [];
    }

    /**
     * Initialize the updater and start periodic checks
     */
    init() {
        if (!('serviceWorker' in navigator)) {
            console.log('[SWUpdater] Service Worker not supported');
            return;
        }

        // Initial registration with enhanced error handling
        this.registerServiceWorker();

        // Listen for SW controller changes
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[SWUpdater] Controller changed - update applied');
            this.notifyUpdate('applied');
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data && event.data.type === 'SW_ACTIVATED') {
                console.log(`[SWUpdater] SW activated: v${event.data.version}`);
                this.currentVersion = event.data.version;
                this.notifyUpdate('activated');
            }
        });

        // Start periodic update checks
        this.startPeriodicCheck();

        // Check for updates on visibility change (user returns to app)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('[SWUpdater] App became visible - checking for updates');
                this.checkForUpdates();
            }
        });

        return Promise.resolve();
    }

    /**
     * Register the Service Worker
     */
    registerServiceWorker() {
        navigator.serviceWorker.register('sw.js', { scope: './' })
            .then(reg => {
                console.log('[SWUpdater] Service Worker registered');

                // Check for updates on registration
                reg.addEventListener('updatefound', () => {
                    const newSW = reg.installing;
                    console.log('[SWUpdater] Update found, new SW installing');

                    newSW.addEventListener('statechange', () => {
                        if (newSW.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                                // Update is ready to activate
                                console.log('[SWUpdater] Update ready to activate');
                                this.notifyUpdate('ready');
                            } else {
                                // First install
                                console.log('[SWUpdater] Service Worker installed for first time');
                                this.currentVersion = this.getStoredVersion();
                            }
                        }
                    });
                });

                // Periodic check for updates
                setInterval(() => {
                    console.log('[SWUpdater] Checking for SW updates...');
                    reg.update().catch(err => console.warn('[SWUpdater] Update check failed:', err));
                }, this.checkInterval);
            })
            .catch(err => console.error('[SWUpdater] Registration failed:', err));
    }

    /**
     * Manually check for updates
     */
    checkForUpdates() {
        const now = Date.now();
        if (now - this.lastCheckTime < 1000) {
            return; // Debounce: ignore if checked less than 1 second ago
        }
        this.lastCheckTime = now;

        navigator.serviceWorker.ready
            .then(reg => {
                console.log('[SWUpdater] Checking registration for updates...');
                return reg.update();
            })
            .catch(err => console.warn('[SWUpdater] Explicit update check failed:', err));
    }

    /**
     * Start periodic update checking
     */
    startPeriodicCheck() {
        setInterval(() => {
            this.checkForUpdates();
        }, this.checkInterval);
    }

    /**
     * Get the current SW version from the version cache
     */
    getStoredVersion() {
        return new Promise(resolve => {
            caches.open('workspace-version')
                .then(cache => cache.match('version.json'))
                .then(response => {
                    if (response) {
                        return response.json();
                    }
                    resolve(null);
                })
                .then(data => {
                    if (data) {
                        resolve(data.version);
                    }
                })
                .catch(() => resolve(null));
        });
    }

    /**
     * Request current SW version directly from the SW
     */
    async getSWVersion() {
        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg.active) {
                return new Promise(resolve => {
                    const channel = new MessageChannel();
                    channel.port1.onmessage = event => {
                        resolve(event.data.version);
                    };
                    reg.active.postMessage(
                        { type: 'GET_SW_VERSION' },
                        [channel.port2]
                    );
                    // Timeout after 2 seconds
                    setTimeout(() => resolve(null), 2000);
                });
            }
        } catch (err) {
            console.warn('[SWUpdater] Failed to get SW version:', err);
        }
        return null;
    }

    /**
     * Force update - skips waiting and reloads immediately
     * Use sparingly, only for critical updates
     */
    async forceUpdate(reason = 'critical_update') {
        console.log(`[SWUpdater] Forcing update: ${reason}`);

        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg.active) {
                // Send skip-waiting message to SW
                reg.active.postMessage({ type: 'SKIP_WAITING' });

                // Wait for controller change and reload
                const controllerchange = new Promise(resolve => {
                    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                    setTimeout(resolve, 3000); // Fallback timeout
                });

                await controllerchange;
                window.location.reload();
            }
        } catch (err) {
            console.error('[SWUpdater] Force update failed:', err);
            // Fallback: just reload
            window.location.reload();
        }
    }

    /**
     * Register a callback for update notifications
     */
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }

    /**
     * Notify all registered callbacks about updates
     */
    notifyUpdate(status) {
        this.updateCallbacks.forEach(cb => {
            try {
                cb({ status, version: this.currentVersion, timestamp: Date.now() });
            } catch (err) {
                console.error('[SWUpdater] Callback error:', err);
            }
        });
    }

    /**
     * Show update notification (mobile-friendly)
     */
    showUpdateNotification(message = 'Nueva versión disponible') {
        if (!window.showToast) {
            console.warn('[SWUpdater] Toast system not available');
            return;
        }

        const container = document.getElementById('toast-container');
        if (container) {
            const el = document.createElement('div');
            el.className = 'toast toast-info';
            el.role = 'status';
            el.setAttribute('aria-live', 'polite');
            el.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px 16px;
                border-radius: 8px;
                background: var(--bg-surface-2);
                border: 1px solid var(--border-highlight);
                font-size: 0.9rem;
            `;
            el.innerHTML = `
                <span>${message}</span>
                <button
                    onclick="window.swUpdater ? window.swUpdater.forceUpdate() : window.location.reload()"
                    style="
                        background: var(--accent-primary);
                        color: #fff;
                        border: none;
                        border-radius: 6px;
                        padding: 6px 12px;
                        cursor: pointer;
                        font-size: 0.85rem;
                        font-weight: 600;
                        flex-shrink: 0;
                    "
                    aria-label="Actualizar ahora">
                    Actualizar
                </button>
            `;

            container.appendChild(el);

            // Auto-remove after 15 seconds
            setTimeout(() => el.remove(), 15000);
        }
    }
}

// Export singleton instance
export const swUpdater = new SWUpdater();
window.swUpdater = swUpdater;
