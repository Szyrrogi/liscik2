const CACHE_NAME = 'liisciki-cache-v2';
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

// Sieć jako pierwsza opcja dla plików aplikacji (zawsze najnowsza wersja,
// gdy jest internet); cache tylko jako zapasowa kopia offline.
// Ruch do Firebase nigdy nie jest przechwytywany.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('googleapis.com') || url.includes('firestore.googleapis.com') || url.includes('gstatic.com/firebasejs')) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});