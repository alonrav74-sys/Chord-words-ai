
const CACHE = "cfai-946-rtl";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  // Models (optional; will be cached if present)
  "./models/whisper-tiny.bin",
  "./models/whisper-tiny.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE.map(u => new Request(u, {cache:'reload'}))).catch(()=>{}))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then((hit) => {
      return hit || fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => {
          // only cache GET same-origin
          try {
            const url = new URL(req.url);
            if (req.method === "GET" && (url.origin === location.origin)) c.put(req, copy);
          } catch {}
        });
        return resp;
      }).catch(() => hit);
    })
  );
});
