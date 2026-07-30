// Minimal service worker: caches the app shell so the UI opens instantly
// and works offline for its own assets. (Print/status calls always hit
// the network — they can't be served from cache.)
const CACHE = "printbridge-v1";
const SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/icon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return; // never cache POST /print
  if (["/print", "/status", "/health"].includes(url.pathname)) return; // always live
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request)),
  );
});
