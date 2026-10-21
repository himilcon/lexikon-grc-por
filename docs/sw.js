/* Service worker: guarda a aplicação, o dicionário e os textos para uso offline.
   Três caches separados, para que atualizar a aplicação não obrigue a baixar de novo o dicionário (8 MB). */
const VERSION = "lx-v5";                    // aplicação: mude a cada alteração de HTML/CSS/JS
const DATA_CACHE = "lx-data-2022-3x-1";     // dicionário: mude junto com DATA
const TEXT_CACHE = "lx-textos";             // textos: cada arquivo vai com ?v=<versão> no endereço
const SHELL = ["./", "index.html", "styles.css", "app.js", "keyboard.js", "reader.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const DATA = "data/ddgp.json?v=2022-3x-1";
const KEEP = [VERSION, DATA_CACHE, TEXT_CACHE];

self.addEventListener("install", ev => {
  ev.waitUntil(Promise.all([
    caches.open(VERSION).then(c => c.addAll(SHELL)),
    caches.open(DATA_CACHE).then(async c => { if (!(await c.match(DATA))) await c.add(DATA); }),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function cacheFirst(req, name) {
  return caches.open(name).then(async c => {
    const hit = await c.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  });
}

self.addEventListener("fetch", ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET") return;
  // Dicionário: cache primeiro (a versão vai na query)
  if (url.pathname.endsWith("/data/ddgp.json")) { ev.respondWith(cacheFirst(ev.request, DATA_CACHE)); return; }
  // Lista de textos: rede primeiro, para que textos novos apareçam logo; cache se estiver offline
  if (url.pathname.endsWith("/textos/index.json")) {
    ev.respondWith(caches.open(TEXT_CACHE).then(c => fetch(ev.request)
      .then(res => { if (res.ok) c.put(url.pathname, res.clone()); return res; })
      .catch(() => c.match(url.pathname))));
    return;
  }
  // Textos: cache primeiro (versionados); ao guardar uma versão nova, descarta as anteriores do mesmo texto
  if (url.pathname.includes("/textos/")) {
    ev.respondWith(caches.open(TEXT_CACHE).then(async c => {
      const hit = await c.match(ev.request);
      if (hit) return hit;
      const res = await fetch(ev.request);
      if (res.ok) {
        for (const k of await c.keys()) if (new URL(k.url).pathname === url.pathname) await c.delete(k);
        await c.put(ev.request, res.clone());
      }
      return res;
    }));
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
