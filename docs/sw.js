/* Service worker: guarda a aplicação e o dicionário para uso offline. */
const VERSION = "lx-v1";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const DATA = "data/ddgp.json?v=2022-3x-1";

self.addEventListener("install", ev => {
  ev.waitUntil(caches.open(VERSION).then(c => c.addAll([...SHELL, DATA])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET") return;
  // Dados: cache primeiro (o arquivo é grande e muda raramente; a versão vai na query)
  if (url.pathname.endsWith("/data/ddgp.json")) {
    ev.respondWith(caches.match(ev.request).then(r => r || fetch(ev.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(ev.request, copy));
      return res;
    })));
    return;
  }
  // Aplicação e fontes: usa o cache e atualiza em segundo plano
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    ev.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(ev.request, { ignoreSearch: url.origin === location.origin && !url.search.includes("v=") });
      const net = fetch(ev.request).then(res => { if (res.ok || res.type === "opaque") c.put(ev.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
