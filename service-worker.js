const CACHE_NAME = "chordfinder-9-4-8-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon512.png",
  "./models/whisper-tiny.js",
  "./models/whisper-tiny.wasm",
  "./models/whisper-tiny.worker.js"
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c)=>c.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((ks)=>Promise.all(ks.map(k=>k!==CACHE_NAME?caches.delete(k):null))));
});
self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then(c=>c || fetch(event.request)));
});