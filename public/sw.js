const CACHE_NAME = 'meus-ingressos-v10';

// Arquivos estáveis do app. Arquivos que não existirem são ignorados
// individualmente (um 404 não derruba mais a instalação inteira).
const ASSETS = [
  './',
  './index.html',
  './ingresso.html',
  './admin.html',
  './login.html',
  './home.css',
  './style.css',
  './admin.css',
  './login.css',
  './main.css',
  './ingresso.css',
  './main.js',
  './ingresso.js',
  './admin.js',
  './login.js',
  './auth.js',
  './admin-devices.js',
  './defaults.js',
  './manifest.json',
  './assets/icon-16.png',
  './assets/icon-32.png',
  './assets/icon-72.png',
  './assets/icon-144.png',
  './assets/icon-152.png',
  './assets/icon-192.png',
  './assets/icon-384.png',
  './assets/icon-512.png',
  './assets/NO.png',
  './assets/quentro.png',
  './assets/stb.png',
  './assets/ticketmaster.png',
  './assets/qr1.png',
  './assets/qr2.png',
  './assets/qr3.png',
  './assets/qr4.png',
  './assets/qr5.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

function offlineFallback() {
  return new Response('<h1>Você está offline</h1>', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Autenticação nunca passa pelo cache (evita sessão "congelada").
  if (isApi(url)) return;

  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro, cache como reserva.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => { });
          return response;
        })
        .catch(() => caches.match(request)
          .then((cached) => cached || caches.match('./index.html'))
          .then((cached) => cached || offlineFallback()))
    );
    return;
  }

  // Estáticos: cache primeiro, atualizando em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => { });
          }
          return response;
        })
        .catch(() => cached || offlineFallback());
    })
  );
});
