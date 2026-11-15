// Critter Daily's offline helper (a service worker, registered by install.js):
// it's what lets the site install as an app, and it opens the last version of
// a page when there's no connection. Online, everything comes from the network
// as usual, so a new day's puzzle is never held back; each page and file the
// site serves is kept as a copy for offline. Only this site's own GET
// requests: never the scores API, ads or analytics.
const CACHE = "critter-daily-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
        }
        return response;
      } catch (error) {
        // Offline: the copy from last time (a page opened as /?source=app is the same page).
        const kept = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
        if (kept) return kept;
        throw error;
      }
    })(),
  );
});
