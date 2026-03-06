/**
 * Service Worker — v11 (Stability + Crash Protection)
 * Caches shell assets and provides an always-responding fetch handler.
 */

const CACHE_NAME = 'workspace-v13';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles/main.css',
    '/styles/components.css',
    '/styles/animations.css',
    '/styles/skeletons.css',
    '/js/db.js',
    '/js/utils.js',
    '/js/utils/crypto.js',
    '/js/store.js',
    '/js/sync.js',
    '/js/modals.js',
    '/js/notifications.js',
    '/js/app.js',
    '/js/router.js',
    '/js/components.js',
    '/js/views/dashboard.js',
    '/js/views/projects.js',
    '/js/views/backlog.js',
    '/js/views/cycles.js',
    '/js/views/board.js',
    '/js/views/calendar.js',
    '/js/views/document.js',
    '/js/views/decisions.js',
    '/js/views/graph.js',
    '/js/views/canvas.js',
    '/js/views/integrations.js',
    '/js/views/library.js',
    '/js/views/logs.js',
    '/js/views/matrix.js',
    '/js/views/medical.js',
    '/js/views/writing.js',
    '/js/vendor/feather.min.js',
    '/icons/icon-192.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Cache init error:', err);
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;
    const isCDN = url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com') || url.hostname.includes('unpkg.com');

    if (!isLocal && !isCDN) return;

    event.respondWith((async () => {
        try {
            const isAPI = url.pathname.startsWith('/api/') || url.hostname.includes('googleapis.com');

            // 1. API: Network-first
            if (isAPI) {
                try {
                    const response = await fetch(event.request);
                    if (response && response.status === 200) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put(event.request, response.clone());
                    }
                    return response;
                } catch (err) {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    throw err;
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
    const data = event.data ? event.data.text() : 'Nueva notificación';
    event.waitUntil(
        self.registration.showNotification('Workspace', {
            body: data,
            icon: '/icons/icon-192.png'
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
