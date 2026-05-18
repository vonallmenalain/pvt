const CACHE_NAME = "pfahlvolley-v5";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/app-auth.js",
  "/app-teams.js",
  "/firebase-config.js",
  "/manifest.json",
  "/volleyball_app_icons/icon-192x192.png",
  "/volleyball_app_icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Let Firebase Auth/Firestore API calls pass through without caching
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("identitytoolkit") ||
    url.pathname.startsWith("/__/")
  ) {
    return;
  }

  // Network-first for Firebase CDN scripts (always fresh)
  if (url.hostname === "www.gstatic.com") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Network-first for all app shell resources so new deployments are picked up immediately.
  // Falls back to cache only when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
