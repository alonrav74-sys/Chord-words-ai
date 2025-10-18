// service-worker.js (cache only; no functional changes)
const CACHE='cfai-v960';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.json','./service-worker.js'])))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})())});
self.addEventListener('fetch',e=>{e.respondWith((async()=>{const r=await caches.match(e.request);return r||fetch(e.request);})())});
