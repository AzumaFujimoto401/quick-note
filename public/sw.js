const CACHE_NAME = 'quicknote-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/icon.svg'];

// インストール時にアプリシェルをキャッシュ
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// キャッシュ優先（API呼び出しはネットワーク優先）
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/.netlify/functions/')) {
    return; // API は SW を介さない
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
