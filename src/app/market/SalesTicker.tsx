"use client";

import { useState } from "react";
import { fa, coins } from "@/lib/persian";
import { usePolling } from "@/hooks/usePolling";
import { ConnectionBanner } from "@/components/ConnectionBanner";

type TickerEntry = { buyer: string; team: string; product: string; amount: number; at: string };
type TickerResponse = { recent: TickerEntry[]; volume: number; count: number };

export function SalesTicker({ buyWallet }: { buyWallet: number }) {
  const [data, setData] = useState<TickerResponse | null>(null);
  // شمار خطاهای پیاپی؛ از ۲ به بالا نوار «اتصال قطع شد» نشان داده می‌شود.
  const [failures, setFailures] = useState(0);
  // توقف دستی نوار متحرک (WCAG 2.2.2: محتوای متحرک بیش از ۵ ثانیه باید قابل توقف باشد)
  const [paused, setPaused] = useState(false);

  // وقتی تب پنهان است polling متوقف می‌شود و با برگشتن فوراً تازه می‌شود.
  usePolling(async () => {
    try {
      const res = await fetch("/api/market/ticker", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as TickerResponse);
      setFailures(0);
    } catch {
      // خطای موقت شبکه؛ در tick بعدی دوباره تلاش می‌شود
      setFailures((n) => n + 1);
    }
  }, 3000);

  const items = data?.recent ?? [];
  const loop = items.length > 0 ? [...items, ...items] : [];

  return (
    // group: هاور یا فوکوس کیبورد هر جای کارت (از جمله دکمهٔ توقف) حرکت نوار را نگه می‌دارد
    <div className="group card p-0 overflow-hidden anim-rise max-w-full">
      <ConnectionBanner failing={failures >= 2} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-brand-mist bg-brand-ice text-xs">
        <div className="flex items-center gap-3 font-bold text-brand-navy">
          <span className="inline-block size-1.5 rounded-full bg-brand-red pulse-ring" />
          فروش زنده
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-brand-slate">
          <span>حجم بازار: {coins(data?.volume ?? 0)}</span>
          <span>کیف سکهٔ تو: {coins(buyWallet)}</span>
          {loop.length > 0 && (
            // با «کاهش حرکت» نوار ایستاست و دکمه لازم نیست
            <button
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused((p) => !p)}
              className="motion-reduce:hidden inline-flex items-center gap-1 min-h-11 -my-2 rounded-pill px-3 font-bold text-brand-navy hover:bg-brand-mist"
            >
              <span aria-hidden>{paused ? "▶" : "⏸"}</span>
              توقف حرکت
            </button>
          )}
        </div>
      </div>
      {loop.length === 0 ? (
        <div className="flex items-center h-11 px-4 text-xs text-brand-slate">هنوز خریدی ثبت نشده است.</div>
      ) : (
        <>
          {/* نوار متحرک؛ با prefers-reduced-motion کلاً پنهان می‌شود (نه یخ‌زده، که آیتم‌های بیرون از کادر دیده نمی‌شدند) */}
          <div className="relative h-11 overflow-hidden max-w-full motion-reduce:hidden">
            {/* فهرست دوبار تکرار شده و ticker-loop دقیقاً ۵۰٪ جابه‌جا می‌کند؛ فاصله با padding هر آیتم است (نه gap)
                تا دو نیمه دقیقاً هم‌عرض باشند و حلقه بی‌درز بچرخد. نیمهٔ تکراری از صفحه‌خوان پنهان است. */}
            <div
              className={`flex w-max shrink-0 items-center h-full whitespace-nowrap animate-[ticker-loop_22s_linear_infinite] group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] ${
                paused ? "[animation-play-state:paused]" : ""
              }`}
            >
              {loop.map((it, i) => (
                <span key={i} aria-hidden={i >= items.length || undefined} className="px-4 text-sm font-medium text-brand-navy">
                  {it.buyer} از تیم {it.team} خرید ✦ {fa(it.amount)} سکه
                </span>
              ))}
            </div>
          </div>
          {/* کاهش حرکت: فهرست ایستا و پیچیده‌شونده از همهٔ خریدهای اخیر */}
          <ul className="hidden motion-reduce:flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
            {items.map((it, i) => (
              <li key={i} className="text-sm font-medium text-brand-navy">
                {it.buyer} از تیم {it.team} خرید ✦ {fa(it.amount)} سکه
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
