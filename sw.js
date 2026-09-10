/* Service Worker: macht Royal Stable Manager installierbar und offlinefaehig.
   App-Shell wird beim ersten Laden gecacht (cache-first), im Hintergrund
   aktualisiert. Nur gleiche Herkunft; Google-Fonts laufen normal durch und
   fallen offline auf die System-Schrift zurueck.

   Bei einer neuen Version CACHE hochzaehlen -> alter Cache wird verworfen. */
'use strict';
const CACHE = 'rsm-v3';
const ASSETS = [
  './',
  './index.html',
  './css/game.css',
  './js/genetics.js',
  './js/names.js',
  './js/model.js',
  './js/economy.js',
  './js/friend.js',
  './js/state.js',
  './js/ui.js',
  './js/main.js',
  './js/pwa.js',
  './manifest.webmanifest',
  './favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // Fonts etc.: Browser-Default

  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return hit || net;
    })
  );
});
