"use client";

import { useState } from "react";
import { fa } from "@/lib/persian";
import { usePolling } from "@/hooks/usePolling";
import { ConnectionBanner } from "@/components/ConnectionBanner";

type FeedEvent = { id: string; emoji: string; text: string; at: string };

/**
 * زمان نسبی فارسی («چند لحظه پیش»، «۵ دقیقه پیش»...).
 * تابع relTime در src/lib/persian.ts نیست؛ چون این فایل در مالکیت همین ایجنت نیست
 * از تغییرش صرف‌نظر شد و یک کمکی محلی کوچک همین‌جا نوشته شده (از fa برای ارقام فارسی استفاده می‌کند).
 */
function relativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 15) return "همین الان";
  if (diffSec < 60) return `${fa(diffSec)} ثانیه پیش`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${fa(diffMin)} دقیقه پیش`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${fa(diffHour)} ساعت پیش`;
  const diffDay = Math.round(diffHour / 24);
  return `${fa(diffDay)} روز پیش`;
}

export function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // شمار خطاهای پیاپی؛ از ۲ به بالا نوار «اتصال قطع شد» نشان داده می‌شود.
  const [failures, setFailures] = useState(0);

  usePolling(async () => {
    try {
      const res = await fetch("/api/feed", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { events: FeedEvent[] };
      setEvents(data.events);
      setNow(Date.now());
      setFailures(0);
    } catch {
      setFailures((n) => n + 1);
    }
  }, 10_000);

  return (
    <div className="card p-0 overflow-hidden anim-rise">
      <ConnectionBanner failing={failures >= 2} />
      <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-mist bg-brand-ice text-xs font-bold text-brand-navy">
        <span className="inline-block size-1.5 rounded-full bg-brand-red pulse-ring" aria-hidden />
        رویدادهای زنده میدان
      </div>
      {events === null ? (
        <div className="px-4 py-6 text-sm text-brand-slate">در حال بارگذاری…</div>
      ) : events.length === 0 ? (
        <div className="px-4 py-6 text-sm text-brand-slate">هنوز رویدادی ثبت نشده…</div>
      ) : (
        <ul className="divide-y divide-brand-mist max-h-80 overflow-y-auto" aria-label="رویدادهای زنده میدان">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span className="text-lg shrink-0" aria-hidden>{e.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="text-brand-navy font-medium break-words">{e.text}</p>
                <p className="mt-0.5 text-[11px] text-brand-slate fa-num">{relativeTime(e.at, now)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
