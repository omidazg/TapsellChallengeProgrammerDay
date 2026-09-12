"use client";

import { useEffect, useState } from "react";
import { duration } from "@/lib/persian";

type PhaseResponse = { phase: string; endsAt: string | null };

/**
 * شمارش معکوس زندهٔ فاز جاری.
 * هر ثانیه عدد را به‌روز می‌کند و هر ۳۰ ثانیه `/api/phase` را می‌پرسد
 * تا اگر برگزارکننده فاز یا زمان پایان را عوض کرد، بدون رفرش صفحه اصلاح شود.
 */
export function PhaseCountdown({ endsAt }: { endsAt: string | null }) {
  // تا وقتی polling چیزی نگفته، همان مقدار سرور ملاک است
  const [polled, setPolled] = useState<{ endsAt: string | null } | null>(null);
  const target = polled ? polled.endsAt : endsAt;
  // مقدار اولیه null است تا رندر سرور و کلاینت یکی باشد (بدون خطای hydration)
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
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
        if (!cancelled) setPolled({ endsAt: data.endsAt });
      } catch {
        // شبکه قطع است؛ در تیک بعدی دوباره تلاش می‌شود
      }
    }
    const t = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!target) return <span className="text-brand-slate text-sm">بدون زمان‌بندی</span>;
  if (now === null) return <span className="text-brand-slate text-sm">…</span>;

  const remaining = new Date(target).getTime() - now;
  return <span className="fa-num font-black text-2xl text-brand-red">{duration(remaining)}</span>;
}
