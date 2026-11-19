// 賞味期限レスキュー AI - Service Worker
// アプリ本体を更新したら CACHE_VERSION を上げてください（古いキャッシュが削除されます）
const CACHE_VERSION = 'v1';
const CACHE_NAME = `kigen-rescue-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('kigen-rescue-') && k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ページ側の「更新する」ボタンから呼ばれる
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GETかつ同一オリジンのみ扱う（Gemini APIなど外部通信には一切触れない）
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // HTML（画面遷移）はネットワーク優先 → オフライン時はキャッシュ
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // アイコン等の静的ファイルはキャッシュ優先（裏で更新）
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
