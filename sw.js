/* sw.js - service worker para funcionamento offline (PWA) */

const CACHE = "xablaucard-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/cards.js",
  "./js/audio.js",
  "./js/ai.js",
  "./js/profiles.js",
  "./js/net.js",
  "./js/auth.js",
  "./js/biometric.js",
  "./js/online-engine.js",
  "./js/online.js",
  "./js/game.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
];

// Permite que a página peça ativação imediata do novo SW
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/*
 * Estratégia network-first para conteúdo do próprio site:
 * sempre tenta a versão mais nova quando online e usa o cache como
 * reserva (offline). Assim novas publicações aparecem sem ficar presas
 * em cache antigo.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
