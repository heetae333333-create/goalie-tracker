const CACHE_NAME = "goalie-tracker-v2.4.0";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=24",
  "./app.js?v=24",
  "./manifest.json?v=24",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation = event.request.mode === "navigate";
  const isCodeAsset = isSameOrigin &&
    (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".html"));

  if (isNavigation || isCodeAsset) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type === "opaque") {
              return response;
            }

            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, copy));

            return response;
          })
          .catch(() => caches.match("./index.html"));
      })
  );
});
