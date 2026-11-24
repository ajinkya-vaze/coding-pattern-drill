// Offline support: precache the app shell and the question bank, then serve
// stale-while-revalidate so new bank batches arrive on the next visit.
// Bump VERSION when the file list changes.

const VERSION = 'pd-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/app.js',
  'src/engine/bank.js',
  'src/engine/grading.js',
  'src/engine/progressCode.js',
  'src/engine/questions.js',
  'src/engine/scheduler.js',
  'src/engine/storage.js',
  'src/engine/util.js',
  'src/ui/dom.js',
  'src/ui/lesson.js',
  'src/ui/quiz.js',
  'src/ui/screens.js',
  'data/patterns.json',
  'data/index.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Problem files are listed in data/index.json.
    const index = await (await fetch('data/index.json', { cache: 'no-cache' })).json();
    await cache.addAll(index.problemFiles.map((f) => `data/problems/${f}`));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || new Response('Offline and not cached yet.', { status: 503 });
  })());
});
