const CACHE_NAME = 'comp-form-v4-fix-export';

// cache เฉพาะไฟล์ local ที่คุณคุมได้ (สำคัญ: อย่า cache CDN แบบตายตัว)
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
];

// ติดตั้ง + cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL);
        // ให้ SW ตัวใหม่ทำงานทันที
        await self.skipWaiting();
    })());
});

// ล้าง cache เก่า + claim clients
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // ไม่ยุ่งกับ request ที่ไม่ใช่ GET
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // ===== 1) NAVIGATION / HTML : NETWORK FIRST =====
    // อันนี้คือหัวใจแก้ "ไม่รีเฟรช"
    if (req.mode === 'navigate' || req.destination === 'document') {
        event.respondWith((async () => {
            try {
                // ดึงจาก network ก่อนเสมอ (กันหน้าเก่าค้าง)
                const fresh = await fetch(req, { cache: 'no-store' });

                // อัปเดต cache เฉพาะ index.html (key คงที่)
                const cache = await caches.open(CACHE_NAME);
                // เก็บไว้เป็น fallback ตอน offline
                cache.put('./index.html', fresh.clone());

                return fresh;
            } catch (err) {
                // offline fallback
                const cached = await caches.match('./index.html');
                return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
            }
        })());
        return;
    }

    // ===== 2) STATIC ASSETS : CACHE FIRST + BACKGROUND UPDATE =====
    // cache-first ช่วยเร็ว แต่ยังอัปเดตตามหลัง
    event.respondWith((async () => {
        const cached = await caches.match(req);
        if (cached) {
            // background update
            event.waitUntil((async () => {
                try {
                    const fresh = await fetch(req);
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(req, fresh);
                } catch (e) { }
            })());
            return cached;
        }

        // ไม่เคย cache -> fetch แล้ว cache ไว้
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
    })());
});
