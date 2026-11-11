/* Deadline Tracker service worker. Small on purpose.
   - Account data is never stored here: every /api request goes straight to the server, untouched.
   - Pages always come from the network, so nobody gets stuck on an old version. With no connection, a small
     "You're offline" page is shown instead of the browser's error.
   - The app's code files (assets/app.<hash>.js, assets/gsap.<hash>.js) never change once named, so they are
     kept for fast starts. Older ones are removed when a new one arrives. */
const CACHE = "dt-app-v1";
const OFFLINE = "/offline.html";
const BUILT = /^\/assets\/(app|gsap)\.[0-9a-f]{10}\.js$/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;   // the browser handles it as usual
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then(r => r || Response.error())));
    return;
  }
  if (BUILT.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        const kind = url.pathname.match(BUILT)[1];
        for (const k of await c.keys()) { const p = new URL(k.url).pathname; if (BUILT.test(p) && p.match(BUILT)[1] === kind && p !== url.pathname) c.delete(k); }
        c.put(req, res.clone());
      }
      return res;
    }));
  }
});
