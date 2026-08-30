/* =========================================================================
   Lexi — service worker
   Tek işi: uygulamayı çevrimdışı açılabilir kılmak.

   Strateji: **önce ağ, olmazsa önbellek.**
   Tersi (önce önbellek) daha hızlı açar ama uygulamayı güncellediğimde
   kimsenin telefonuna yeni sürüm inmez — arkadaşlar aylarca eski sürümde kalır.
   Bu yüzden ağ denenip başarısız olunca önbelleğe düşülüyor.

   Supabase istekleri **hiç dokunulmadan** geçer: veri önbelleğe alınmaz,
   yoksa senkron bayat veri okur.

   Sürüm: uygulamayı değiştirdiğimde CACHE adını artır; eski önbellek silinir.
   ========================================================================= */

const CACHE = 'lexi-v1';

const SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './ikon/lexi-192.png',
    './ikon/lexi-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE)
            // Tek bir dosya inmezse kurulumun tamamı çökmesin.
            .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    // Kendi kaynağımız dışındaki her şey (Supabase dâhil) doğrudan ağa gider.
    if (new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
                }
                return response;
            })
            .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
    );
});
