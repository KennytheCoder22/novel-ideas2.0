const CACHE_NAME = "novelideas-static-v2";
const INSTALL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/novelideas-192.png",
  "/icons/novelideas-512.png",
  "/icons/novelideas-maskable-192.png",
  "/icons/novelideas-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(INSTALL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("novelideas-static-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.mode === "navigate") return;

  const cacheableDestinations = new Set(["font", "image", "script", "style"]);
  const isExpoStaticAsset = url.pathname.startsWith("/_expo/static/")
    || (url.pathname.startsWith("/assets/") && cacheableDestinations.has(request.destination));
  if (!isExpoStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response.ok) return response;
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
