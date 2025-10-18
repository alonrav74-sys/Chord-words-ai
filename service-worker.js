// service-worker.js
const CACHE='cfai-v946-stable';
const CORE=[
  './',
  './index.html',
  './manifest.json',
  './service-worker.js',
  // שמות ה-Whisper לתמיכה אופציונלית בקאש
  './models/whisper-tiny.js',
  './models/whisper-tiny.wasm',
  './models/whisper-tiny.worker.js',
  './models/ggml-tiny.bin'
];

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})));
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e=>{
  e.respondWith((async()=>{
    const cached = await caches.match(e.request);
    try{
      const fresh = await fetch(e.request);
      return fresh;
    }catch(_){
      return cached || Promise.reject(_);
    }
  })());
});