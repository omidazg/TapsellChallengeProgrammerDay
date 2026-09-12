"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { duration } from "@/lib/persian";

type PhaseResponse = { phase: string; endsAt: string | null; serverNow: string };

/**
 * شمارش معکوس زندهٔ فاز جاری.
 * هر ثانیه عدد را به‌روز می‌کند و هر ۳۰ ثانیه `/api/phase` را می‌پرسد
 * تا اگر برگزارکننده (یا زمان‌بند خودکار) فاز یا زمان پایان را عوض کرد، بدون رفرش صفحه اصلاح شود.
 * از `serverNow` برگشتی برای تصحیح اختلاف ساعت کلاینت/سرور استفاده می‌شود،
 * و وقتی شمارش به صفر می‌رسد یک‌بار `router.refresh()` صدا زده می‌شود تا فاز جدید (اگر خودکار عوض شده) نمایش داده شود.
 */
export function PhaseCountdown({ endsAt }: { endsAt: string | null }) {
  const router = useRouter();
  // تا وقتی polling چیزی نگفته، همان مقدار سرور ملاک است
  const [polled, setPolled] = useState<{ endsAt: string | null } | null>(null);
  const target = polled ? polled.endsAt : endsAt;
  // مقدار اولیه null است تا رندر سرور و کلاینت یکی باشد (بدون خطای hydration)
  const [now, setNow] = useState<number | null>(null);
  // اختلاف ساعت سرور/کلاینت (serverNow - Date.now() در لحظهٔ آخرین polling)
  const skewRef = useRef(0);
  const refreshedRef = useRef(false);

  useEffect(() => {
    const update = () => setNow(Date.now() + skewRef.current);
    const first = setTimeout(update, 0);
    const tick = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/phase", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as PhaseResponse;
        if (cancelled) return;
        setPolled({ endsAt: data.endsAt });
        const serverNow = new Date(data.serverNow).getTime();
        if (!Number.isNaN(serverNow)) skewRef.current = serverNow - Date.now();
      } catch {
        // شبکه قطع است؛ در تیک بعدی دوباره تلاش می‌شود
      }
    }
    poll(); // یک‌بار فوری، تا تصحیح ساعت از همان ابتدا انجام شود
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // هر بار هدف عوض شد (فاز جدید/زمان پایان جدید)، اجازهٔ یک رفرش دیگر در پایان شمارش داده می‌شود.
  useEffect(() => {
    refreshedRef.current = false;
  }, [target]);

  useEffect(() => {
    if (now === null || !target) return;
    const remaining = new Date(target).getTime() - now;
    if (remaining <= 0 && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [now, target, router]);

  if (!target) return <span className="text-brand-slate text-sm">بدون زمان‌بندی</span>;
  if (now === null) return <span className="text-brand-slate text-sm">…</span>;

  const remaining = new Date(target).getTime() - now;
  return <span className="fa-num font-black text-2xl text-brand-red">{duration(remaining)}</span>;
}
