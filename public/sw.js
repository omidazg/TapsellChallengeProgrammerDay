/*
 * Service Worker ساده برای PWA و اعلان‌های فوری.
 * جاوااسکریپت خام (بدون باندلر) — مستقیم توسط مرورگر اجرا می‌شود.
 * ثبت (register) این فایل توسط کامپوننت ServiceWorkerRegister انجام می‌شود
 * (فقط در secure context؛ روی HTTP ساده مرورگرها اصلاً اجازهٔ ثبت نمی‌دهند).
 */

const CACHE_VERSION = "arena-sw-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // هر URL جدا cache.add می‌شود تا شکست یکی (مثلاً آیکون هنوز ساخته نشده) کل install را نشکند.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // فقط درخواست‌های ناوبری (بارگذاری صفحه) را مدیریت می‌کنیم؛ API، _next و بقیه دست‌نخورده می‌مانند.
  if (request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match(OFFLINE_URL);
        if (cached) return cached;
        return new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "اعلان جدید";
  const body = data.body || "";
  const tag = data.tag || "arena-notification";
  const href = data.href || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      dir: "rtl",
      lang: "fa",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(href, self.location.origin).href;

      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* برخی مرورگرها navigate را پشتیبانی نمی‌کنند؛ focus کافی است */
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
