const CACHE_NAME = 'liisciki-cache-v1';
const APP_SHELL = [
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Sieć > cache dla wywołań do Firebase; cache > sieć dla plików aplikacji.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('googleapis.com') || url.includes('firestore.googleapis.com') || url.includes('gstatic.com/firebasejs')) {
    return; // nie cache'uj ruchu do Firebase / SDK
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
