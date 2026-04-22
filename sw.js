/* ============================================================
   StudyOS — sw.js  |  Service Worker  v5 (Fixed)

   FIXES vs v4:
   - Bumped CACHE_VERSION → forces old icon / asset cache to be
     fully purged on next visit (fixes stale-icon bug on desktop)
   - Icons folder added to PRECACHE so they are cached from the
     start, not lazily on first use (which caused missing-icon issue)
   - Added NEVER_CACHE list so manifest.json is always fetched
     fresh by the browser (fixes reinstall-prompt on desktop)
   - Navigation response now also updates the cache correctly
   - Added 'message' RELOAD broadcast so controllerchange fires
     reliably after SKIP_WAITING on all Chromium versions
   ============================================================ */

'use strict';

const CACHE_VERSION = 'studyos-v5';  // ← bumped from v4
const OFFLINE_PAGE  = './offline.html';

// Assets to pre-cache on install
const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',   // ← ADDED: ensures icons are always cached
  './icons/icon-512.png',   // ← ADDED
];

// These URLs must NEVER be served from cache so the browser always
// sees the freshest manifest (critical for reinstall-prompt on desktop)
const NEVER_CACHE = [
  'manifest.json',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
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
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
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

  // manifest.json → always network-first, no caching
  // This is the KEY FIX for desktop reinstall-prompt not appearing:
  // Chrome desktop checks the manifest on every page load to decide
  // whether to fire beforeinstallprompt. If it gets a stale cached
  // copy (especially after uninstall clears app state but not SW cache)
  // it may not re-fire the prompt. Serving manifest fresh guarantees
  // Chrome always evaluates installability criteria correctly.
  if (NEVER_CACHE.some(p => url.pathname.endsWith(p))) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request)) // fallback to cache if offline
    );
    return;
  }

  // Google Fonts → cache at runtime
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML navigation → network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
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
      if (response.type !== 'opaque') {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch {
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ── MESSAGE: SKIP_WAITING ─────────────────────────────────────
// app.js sends { type: 'SKIP_WAITING' } when user clicks "Update Now"
// After skipWaiting the new SW activates; we broadcast RELOAD so all
// open tabs refresh (controllerchange alone can be missed in some
// Chromium builds when multiple tabs are open).
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting().then(() => {
      // Broadcast to all clients so they all reload
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        .then(clients => {
          clients.forEach(client => client.postMessage({ type: 'RELOAD' }));
        });
    });
  }
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────────
self.addEventListener('push', event => {
  const data    = event.data ? event.data.json() : {};
  const title   = data.title || 'StudyOS';
  const options = {
    body:    data.body    || 'You have a study reminder!',
    icon:    './icons/icon-192.png',
    badge:   './icons/icon-192.png',
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