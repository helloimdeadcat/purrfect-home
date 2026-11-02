/*
 * Purrfect Home service worker — deliberately minimal.
 *
 * Private financial data must never land in a device cache another person
 * could read (shared tablets, logged-out sessions). So this worker caches
 * exactly one static, data-free page (/offline.html) and uses it only when a
 * page navigation fails because the network is down. API calls, RSC payloads,
 * app pages and receipts are never intercepted or stored.
 */
const CACHE = "ff-offline-v5";
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

/*
 * Web Push. The payload is JSON from services/push-service.ts:
 * { title, body, url, tag }. Only same-origin paths are opened on tap.
 */
const DEFAULT_PUSH_URL = "/app/notifications";

function safePushUrl(url) {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return DEFAULT_PUSH_URL;
  }
  return url;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Purrfect Home";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icon-192.png",
    // Monochrome white-on-transparent — colour icons render as a blank square on Android.
    badge: "/badge-96.png",
    data: { url: safePushUrl(data.url) },
  };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    safePushUrl(event.notification.data && event.notification.data.url),
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const exact = windows.find((client) => client.url === target);
      if (exact) return exact.focus();
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((client) => (client && "navigate" in client ? client.navigate(target) : client));
      }
      return self.clients.openWindow(target);
    }),
  );
});
