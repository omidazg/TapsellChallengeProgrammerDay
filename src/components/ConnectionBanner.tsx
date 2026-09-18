"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const RECOVERED_MS = 3000;

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * نوار کوچک وضعیت اتصال.
 * وقتی مرورگر آفلاین است یا فراخواننده خطای پیاپی گزارش می‌کند (`failing`) پیام قطع اتصال،
 * و پس از بازگشت، برای چند ثانیه «اتصال برقرار شد» نشان می‌دهد.
 * ناحیهٔ role="status" همیشه در DOM است تا صفحه‌خوان‌ها تغییرش را اعلام کنند.
 */
export function ConnectionBanner({ failing = false }: { failing?: boolean }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const down = !online || failing;

  // الگوی «مقدار رندر قبلی»: گذار از قطع به وصل در حین رندر تشخیص داده می‌شود (بدون setState در افکت).
  const [prevDown, setPrevDown] = useState(down);
  const [recovered, setRecovered] = useState(false);
  if (prevDown !== down) {
    setPrevDown(down);
    setRecovered(!down);
  }

  useEffect(() => {
    if (!recovered) return;
    const t = setTimeout(() => setRecovered(false), RECOVERED_MS);
    return () => clearTimeout(t);
  }, [recovered]);

  const message = down ? "اتصال قطع شد؛ در حال تلاش دوباره…" : recovered ? "اتصال برقرار شد" : "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-3 inset-x-0 z-[70] flex justify-center px-4"
    >
      {message && (
        <div
          className={`anim-pop rounded-full px-4 py-1.5 text-xs font-bold shadow-lift ${
            down ? "bg-brand-red text-white" : "bg-brand-navy text-white"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
