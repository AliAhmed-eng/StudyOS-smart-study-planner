/* ============================================================
   StudyOS — sw.js  |  Service Worker  (GitHub Pages Edition)

   Uses RELATIVE paths so the app works on any host/subdirectory:
     - GitHub Pages:  https://username.github.io/repo-name/
     - Custom domain: https://yourdomain.com/
     - localhost:     http://localhost:5500/

   Caching strategy:
     Static assets  → Cache-First  (instant loads)
     Google Fonts   → Cache-First  (cached at runtime)
     Navigation     → Network-first, offline.html fallback
   ============================================================ */

'use strict';

const CACHE_VERSION  = 'studyos-v3';
const OFFLINE_PAGE   = 'offline.html';

// Assets to pre-cache on install (relative paths work on any host)
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './offline.html',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())  // activate immediately
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and browser extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // Ignore analytics / tracking
  if (
    url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager') ||
    url.hostname.includes('doubleclick')
  ) return;

  // Google Fonts → cache at runtime, serve from cache next time
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML navigation → network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Also update cache with fresh copy
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(request, clone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match(OFFLINE_PAGE);
        })
    );
    return;
  }

  // Everything else (CSS, JS, images) → cache-first
  event.respondWith(cacheFirst(request));
});

// ── CACHE STRATEGIES ─────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      // Don't cache opaque cross-origin responses blindly
      if (response.type !== 'opaque') {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    // Return offline page as last resort for navigations
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', event => {
  const data    = event.data ? event.data.json() : {};
  const title   = data.title || 'StudyOS';
  const options = {
    body:    data.body    || 'You have a study reminder!',
    icon:    './icons/icon-192.png',
    badge:   './icons/icon-96.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
