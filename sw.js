const CACHE_NAME = "comp-form-v6";
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/sw.js"];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL);
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    const url = new URL(req.url);

    // ✅ 1) ไม่ cache ของข้ามโดเมน (CDN, tiles, esm.sh, ฯลฯ) — กันมือถือพัง/โหลดวน
    if (url.origin !== self.location.origin) {
        return; // ปล่อยให้ browser จัดการเอง (network)
    }

    // ✅ 2) HTML navigation: Network-first + fallback cache
    if (req.mode === "navigate" || req.destination === "document") {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(req, { cache: "no-store" });
                const cache = await caches.open(CACHE_NAME);
                await cache.put("/index.html", fresh.clone());
                return fresh;
            } catch (e) {
                const cached = await caches.match("/index.html");
                return cached || new Response("Offline", { status: 503 });
            }
        })());
        return;
    }

    // ✅ 3) Static assets (same-origin เท่านั้น): Cache-first
    event.respondWith((async () => {
        const cached = await caches.match(req);
        if (cached) return cached;

        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
    })());
});
