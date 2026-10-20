/* Service worker: guarda la app en el dispositivo para que funcione sin internet.
   Al publicar una versión nueva, cambie VERSION para que los celulares la descarguen. */
const VERSION = 'junta-app-v2.0';
const FUENTES = 'junta-app-fuentes';
const URL_FUENTES = 'https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600&display=swap';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(ARCHIVOS);
    try { // Fuentes de Google para uso sin internet (si no hay conexión, se intentará después)
      const f = await caches.open(FUENTES);
      const r = await fetch(URL_FUENTES);
      if (r.ok) {
        const css = await r.clone().text();
        await f.put(URL_FUENTES, r);
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u, {mode:'cors'}).then(res => res.ok && f.put(u, res)).catch(() => {})));
      }
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter(n => n.startsWith('junta-app-') && n !== VERSION && n !== FUENTES).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fuentes: primero la copia guardada
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const f = await caches.open(FUENTES);
      const hit = await f.match(req);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') f.put(req, r.clone()); return r; }
      catch (_) { return new Response('', {status: 504}); }
    })());
    return;
  }
  if (url.origin !== location.origin) return;

  // App: responde al instante con la copia guardada y la actualiza en segundo plano
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const clave = req.mode === 'navigate' ? './index.html' : req;
    const hit = await c.match(clave, {ignoreSearch: true});
    const red = fetch(req).then(r => { if (r.ok) c.put(clave, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(red); return hit; }
    const r = await red;
    return r || new Response('Sin conexión', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  })());
});
