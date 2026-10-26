/*
 * Purrfect Home service worker — deliberately minimal.
 *
 * Private financial data must never land in a device cache another person
 * could read (shared tablets, logged-out sessions). So this worker caches
 * exactly one static, data-free page (/offline.html) and uses it only when a
 * page navigation fails because the network is down. API calls, RSC payloads,
 * app pages and receipts are never intercepted or stored.
 */
const CACHE = "ff-offline-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || Response.error();
    }),
  );
});
