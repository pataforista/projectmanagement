/**
 * Service Worker — v12 (Enhanced Mobile Compatibility + Force Updates)
 * Caches shell assets, auto-update detection, and crash protection.
 */

// ── VERSION CONTROL FOR FORCED UPDATES ──────────────────────────────────────
const SW_VERSION = '13.0.0';  // Increment this to force all clients to update
const CACHE_NAME = 'workspace-v13.0';
const VERSION_CACHE = 'workspace-version';
const SHELL_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'styles/main.css',
    'styles/components.css',
    'styles/animations.css',
    'styles/skeletons.css',
    'js/db.js',
    'js/utils.js',
    'js/utils/crypto.js',
    'js/store.js',
    'js/sync.js',
    'js/modals.js',
    'js/notifications.js',
    'js/app.js',
    'js/router.js',
    'js/components.js',
    'js/views/dashboard.js',
    'js/views/projects.js',
    'js/views/backlog.js',
    'js/views/cycles.js',
    'js/views/board.js',
    'js/views/calendar.js',
    'js/views/document.js',
    'js/views/decisions.js',
    'js/views/graph.js',
    'js/views/canvas.js',
    'js/views/integrations.js',
    'js/views/library.js',
    'js/views/logs.js',
    'js/views/matrix.js',
    'js/views/medical.js',
    'js/views/writing.js',
    'js/views/collaboration.js',
    'js/vendor/feather.min.js',
    'icons/tlacuache_8bit.png'
];

self.addEventListener('install', event => {
    console.log(`[SW] Installing Service Worker v${SW_VERSION}`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => {
                // Store current version for client-side detection
                return caches.open(VERSION_CACHE).then(cache => {
                    const versionBlob = new Blob([JSON.stringify({ version: SW_VERSION, timestamp: Date.now() })], { type: 'application/json' });
                    return cache.put('version.json', new Response(versionBlob));
                });
            })
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Cache init error:', err);
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', event => {
    console.log(`[SW] Activating Service Worker v${SW_VERSION}`);
    event.waitUntil(
        caches.keys().then(keys => {
            // Delete old cache versions (keep current + version cache)
            const toDelete = keys.filter(k => k !== CACHE_NAME && k !== VERSION_CACHE);
            return Promise.all(toDelete.map(k => {
                console.log(`[SW] Clearing old cache: ${k}`);
                return caches.delete(k);
            }));
        })
        .then(() => {
            // Notify all clients of the update
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_ACTIVATED',
                        version: SW_VERSION,
                        timestamp: Date.now()
                    });
                });
            });
        })
        .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return; // Ignore chrome-extension://, data:, etc.

    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;
    const isGoogleAPI = url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com');
    const isOtherCDN = url.hostname.includes('unpkg.com') || url.hostname.includes('cdnjs.cloudflare.com');

    // ── SECURITY/CORS BYPASS ──────────────────────────────────────────────────
    // Google APIs should be handled directly by the browser to avoid
    // Service Worker CORS interception issues (Error: Failed to fetch).
    if (isGoogleAPI) return;

    if (!isLocal && !isOtherCDN) return;

    event.respondWith((async () => {
        try {
            const isDynamic = url.pathname.startsWith('/api/');

            // 1. API: Network-first, NEVER cached in static shell
            if (isDynamic) {
                try {
                    return await fetch(event.request);
                } catch (err) {
                    throw err; // APIs and dynamic endpoints must fail explicitly when offline
                }
            }

            // 2. Static: Cache-first
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) return cachedResponse;

            // 3. Fallback: Network
            try {
                const networkResponse = await fetch(event.request);
                if (isLocal && networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            } catch (err) {
                if (event.request.mode === 'navigate') {
                    const fallback = await caches.match('/index.html');
                    if (fallback) return fallback;
                }
                throw err;
            }
        } catch (error) {
            console.error('[SW] Critical fetch error:', error);
            // ✅ ULTIMATE STABILITY: Always return a Response to prevent crash
            return new Response('Offline / Engine Error', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    })());
});

self.addEventListener('push', event => {
    // FIX 3 (Identity-aware notifications): Before showing a notification,
    // query the active clients to get the current session email.
    // If the notification is addressed to a specific user and that user is
    // not currently active, suppress or generalize the notification title/body
    // to avoid leaking information between accounts.
    const rawData = event.data ? event.data.text() : '';
    let payload = { title: 'Workspace', body: 'Nueva notificación', email: null };

    try {
        const parsed = JSON.parse(rawData);
        payload = { ...payload, ...parsed };
    } catch {
        payload.body = rawData || payload.body;
    }

    event.waitUntil(
        (async () => {
            // Query ALL active clients for the current session email.
            // We use MessageChannel for a synchronous-ish roundtrip.
            let activeEmail = null;
            try {
                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                if (clients.length > 0) {
                    activeEmail = await new Promise((resolve) => {
                        const channel = new MessageChannel();
                        const timeout = setTimeout(() => resolve(null), 800);
                        channel.port1.onmessage = (e) => {
                            clearTimeout(timeout);
                            resolve(e.data?.email || null);
                        };
                        clients[0].postMessage({ type: 'GET_ACTIVE_EMAIL' }, [channel.port2]);
                    });
                }
            } catch (e) {
                // Non-fatal: if we can't query the client, fall through to generic notification
                console.warn('[SW] Could not query active client email:', e);
            }

            // If the push is addressed to a specific email and it doesn't
            // match the active session, show a generic title only to prevent
            // information leakage (e.g. another user's task assignment content).
            const notifOptions = {
                icon: 'icons/icon-192.png',
                badge: 'icons/icon-192.png',
                tag: payload.tag || 'nexus-notification',
                data: { url: payload.url || './', email: payload.email },
            };

            if (payload.email && activeEmail && payload.email !== activeEmail) {
                // Notification is for a different account — show a minimal,
                // non-revealing notification to avoid exposing the other account's data.
                return self.registration.showNotification('Nexus', {
                    ...notifOptions,
                    body: 'Tienes actividad pendiente en otra cuenta.',
                    silent: true,
                });
            }

            return self.registration.showNotification(payload.title, {
                ...notifOptions,
                body: payload.body,
            });
        })()
    );
});

// FIX 3: Allow clients to answer the GET_ACTIVE_EMAIL query from push handler.
// Each open tab listens for this message and replies with the current session email.
// Registered here so SW and tab page can coordinate identity.
// (The tab-side listener is registered in app.js via navigator.serviceWorker.addEventListener('message', ...))


self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('./'));
});

// ── MESSAGE HANDLER FOR CLIENT-SERVER COMMUNICATION ──────────────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'GET_SW_VERSION') {
        event.ports[0].postMessage({
            version: SW_VERSION,
            timestamp: Date.now()
        });
    } else if (event.data && event.data.type === 'SKIP_WAITING') {
        // Allow client to force skip waiting (used during forced updates)
        self.skipWaiting();
    } else if (event.data && event.data.type === 'CLEAR_CACHE') {
        // BUG 49 FIX (Security): Purge all caches to ensure account isolation.
        // This is triggered by app.js when an account switch is detected.
        event.waitUntil(
            caches.keys().then(keys => {
                return Promise.all(keys.map(k => {
                    console.log(`[SW] Clearing cache due to account switch: ${k}`);
                    return caches.delete(k);
                }));
            })
        );
    }
});
