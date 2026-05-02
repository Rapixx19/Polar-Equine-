// Service Worker stub — full passive-stream caching lands in Slice 18.
// Slice 1 only registers install/activate so the browser will install the PWA.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
