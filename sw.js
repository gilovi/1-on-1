// Service worker: makes the app installable and lets its screens load without a connection.
// Network-first for the app's own files, so a new deploy is picked up on the next load while online.
// Google APIs and sign-in are never cached.

const CACHE = 'one-on-one-v1';
const SHELL = [
  './',
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/dates.js',
  'js/logic.js',
  'js/model.js',
  'js/storage.js',
  'js/store.js',
  'js/ui.js',
  'js/vcf.js',
  'js/views/common.js',
  'js/views/dashboard.js',
  'js/views/goals.js',
  'js/views/import.js',
  'js/views/settings.js',
  'js/views/student.js',
  'js/views/students.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
