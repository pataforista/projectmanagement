/**
 * sw.js — Service Worker v5
 * Cache-first strategy for shell assets + offline fallback.
 * Updated to include all new view modules and assets.
 */

// ⚠️  RECORDATORIO: incrementa el número de versión cada vez que agregues,
//    elimines o modifiques un archivo en SHELL_ASSETS (o en index.html / sw.js),
//    para que los usuarios existentes descarguen el service worker actualizado.
//    Ejemplo: workspace-v7 → workspace-v8
const CACHE_NAME = 'workspace-v7';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles/main.css',
    '/styles/components.css',
    '/styles/animations.css',
    '/js/db.js',
    '/js/utils.js',
    '/js/store.js',
    '/js/sync.js',
    '/js/modals.js',
    '/js/notifications.js',
    '/js/app.js',
    '/js/api/zotero.js',
    // Views
    '/js/views/dashboard.js',
    '/js/views/projects.js',
    '/js/views/backlog.js',
    '/js/views/cycles.js',
    '/js/views/board.js',
    '/js/views/calendar.js',
    '/js/views/document.js',
    '/js/views/decisions.js',
    '/js/views/library.js',
    '/js/views/canvas.js',
    '/js/views/logs.js',
    '/js/views/writing.js',
    '/js/views/medical.js',
    '/js/views/integrations.js',
    '/js/views/matrix.js',
    // Vendor
    '/js/vendor/feather.min.js',
    // Icons
    '/icons/icon-72.png',
    '/icons/icon-96.png',
    '/icons/icon-128.png',
    '/icons/icon-144.png',
    '/icons/icon-152.png',
    '/icons/icon-192.png',
    '/icons/icon-384.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
    // External CDN (cached for offline)
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
];

// ── Install: cache shell ──────────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS.filter(a => !a.startsWith('https://'))))
            .then(() => self.skipWaiting())
            .catch(err => {
                console.warn('[SW] Some assets failed to cache (non-fatal):', err);
                return self.skipWaiting();
            })
    );
});

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: cache-first, fallback to network ───────────────────────────────────
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;
    const isCDN = url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com');

    if (!isLocal && !isCDN) return;

    // Network-first for API calls, cache-first for static assets
    const isAPI = url.pathname.startsWith('/api/') || url.hostname.includes('googleapis.com/') && url.pathname.includes('calendar');

    if (isAPI) {
        // Network-first with cache fallback
        event.respondWith(
            fetch(event.request)
                .then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return res;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for everything else
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request)
                .then(res => {
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return res;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});

// ── Background sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
    if (event.tag === 'sync-workspace') {
        event.waitUntil(flushSyncQueue());
    }
});

async function flushSyncQueue() {
    console.log('[SW] Background sync triggered.');
}

// ── Push notifications (stub) ─────────────────────────────────────────────────
self.addEventListener('push', event => {
    if (!event.data) return;
    const data = event.data.json();
    event.waitUntil(
        self.registration.showNotification(data.title || 'Workspace', {
            body: data.body || '',
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-96.png',
            data: { url: data.url || '/' }
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || '/')
    );
});
