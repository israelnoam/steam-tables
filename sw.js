// Service worker: caches every file so the app opens and calculates offline.
// Network first (always fresh when online), cache as fallback.
const CACHE = 'steam-tables-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/app.js', 'js/format.js', 'js/sketch.js', 'js/reference.js', 'js/tips.js', 'js/tour.js',
  'js/engine/units.js', 'js/engine/data.js', 'js/engine/lookup.js', 'js/engine/phase.js', 'js/engine/solve.js',
  'data/corrections.json',
  'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css',
  ...['AMS-Regular', 'Caligraphic-Bold', 'Caligraphic-Regular', 'Fraktur-Bold', 'Fraktur-Regular', 'Main-Bold', 'Main-BoldItalic', 'Main-Italic', 'Main-Regular', 'Math-BoldItalic', 'Math-Italic', 'SansSerif-Bold', 'SansSerif-Italic', 'SansSerif-Regular', 'Script-Regular', 'Size1-Regular', 'Size2-Regular', 'Size3-Regular', 'Size4-Regular', 'Typewriter-Regular'].map((f) => `vendor/katex/fonts/KaTeX_${f}.woff2`),
  ...['A1.1', 'A1.2', 'A1.3', 'A1.4', 'A1.5', 'A2.1', 'A2.3', 'A3.1', 'A3.3', 'A10', 'A11', 'A12'].map((id) => `data/${id}.json`),
  'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
