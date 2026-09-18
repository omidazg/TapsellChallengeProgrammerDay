"use client";

import { useEffect } from "react";

/**
 * ثبت service worker فقط در بستر امن (HTTPS یا localhost). سایت تولید فعلاً روی
 * HTTP ساده و یک IP اجرا می‌شود که isSecureContext=false است، پس این کامپوننت
 * آن‌جا بی‌صدا کاری نمی‌کند و خطا هم نمی‌دهد.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // ثبت ناموفق (مثلاً هنوز sw.js منتشر نشده) نباید تجربهٔ کاربر را مختل کند
    });
  }, []);

  return null;
}
