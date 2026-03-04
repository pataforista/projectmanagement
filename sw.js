/**
 * sw.js — Service Worker
 * Cache-first strategy for shell assets + offline fallback + sync queue flush stub.
 */

const CACHE_NAME = 'workspace-v4';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles/main.css',
    '/styles/components.css',
    '/styles/animations.css',
    '/js/db.js',
    '/js/utils.js',
    '/js/components.js',
    '/js/store.js',
    '/js/router.js',
    '/js/views/dashboard.js',
    '/js/views/projects.js',
    '/js/views/backlog.js',
    '/js/views/cycles.js',
    '/js/views/board.js',
    '/js/views/calendar.js',
    '/js/views/document.js',
    '/js/views/decisions.js',
    '/js/views/library.js',
    '/js/views/logs.js',
    '/js/modals.js',
    '/js/notifications.js',
    '/js/sync.js',
    '/js/app.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
    'https://unpkg.com/feather-icons/dist/feather.min.js',
];

// ── Install: cache shell ──────────────────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting())
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

// ── Fetch: cache-first, fallback to network, fallback to index.html ───────────
self.addEventListener('fetch', event => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests that aren't in our known CDNs
    const url = new URL(event.request.url);
    const isLocal = url.origin === self.location.origin;
    const isCDN = url.hostname.includes('googleapis.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('unpkg.com');

    if (!isLocal && !isCDN) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request)
                .then(res => {
                    // Cache successful responses
                    if (res && res.status === 200) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return res;
                })
                .catch(() => {
                    // Offline fallback: serve index.html for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});

// ── Background sync stub ──────────────────────────────────────────────────────
self.addEventListener('sync', event => {
    if (event.tag === 'sync-workspace') {
        event.waitUntil(flushSyncQueue());
    }
});

async function flushSyncQueue() {
    // Stub: in a real multi-user deployment this would push to a server API.
    // For now IndexedDB is the source of truth and no remote sync is needed.
    console.log('[SW] Background sync triggered — queue flush stub.');
}
