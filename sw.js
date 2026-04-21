/* ============================================================
   StudyOS — sw.js  |  Service Worker
   Strategy: Cache-First for static assets, Network-First for API,
   Offline fallback for navigation.
   ============================================================ */

'use strict';

const CACHE_NAME    = 'studyos-v2';
const OFFLINE_URL   = '/offline.html';

// All static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/offline.html',
  // Google Fonts (cached at runtime via network-first)
];

// ---- INSTALL: pre-cache shell ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ---- ACTIVATE: clean up old caches ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ---- FETCH: routing strategy ----
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and analytics requests
  if (
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager')
  ) {
    return;
  }

  // API / tasks endpoint → Network-first, fallback to empty array
  if (url.pathname.startsWith('/tasks')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Google Fonts → Cache-first (runtime)
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation (HTML pages) → Network-first, offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(OFFLINE_URL) || caches.match('/index.html'))
    );
    return;
  }

  // Static assets (CSS, JS, images) → Cache-first
  event.respondWith(cacheFirst(request));
});

// ---- Strategies ----

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ---- Background Sync: queue failed API mutations ----
self.addEventListener('sync', event => {
  if (event.tag === 'studyos-sync') {
    event.waitUntil(syncPendingRequests());
  }
});

async function syncPendingRequests() {
  // Placeholder: in a real app you'd read from IndexedDB queue
  // and replay failed POST/PUT/DELETE requests here
  console.log('[SW] Background sync triggered');
}

// ---- Push Notifications ----
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title   = data.title || 'StudyOS';
  const options = {
    body:    data.body || 'You have a study reminder!',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-96.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});