"use client";

import { useEffect, useState } from "react";
import { fa, coins } from "@/lib/persian";

type TickerEntry = { buyer: string; team: string; product: string; amount: number; at: string };
type TickerResponse = { recent: TickerEntry[]; volume: number; count: number };

export function SalesTicker({ buyWallet }: { buyWallet: number }) {
  const [data, setData] = useState<TickerResponse | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/market/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as TickerResponse;
        if (alive) setData(json);
      } catch {
        // خطای موقت شبکه؛ در tick بعدی دوباره تلاش می‌شود
      }
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const items = data?.recent ?? [];
  const loop = items.length > 0 ? [...items, ...items] : [];

  return (
    <div className="card p-0 overflow-hidden anim-rise max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-brand-mist bg-brand-ice text-xs">
        <div className="flex items-center gap-3 font-bold text-brand-navy">
          <span className="inline-block size-1.5 rounded-full bg-brand-red pulse-ring" />
          فروش زنده
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-brand-slate">
          <span>حجم بازار: {coins(data?.volume ?? 0)}</span>
          <span>کیف خرید تو: {coins(buyWallet)}</span>
        </div>
      </div>
      <div className="relative h-11 overflow-hidden max-w-full">
        {loop.length === 0 ? (
          <div className="flex items-center h-full px-4 text-xs text-brand-slate">هنوز خریدی ثبت نشده…</div>
        ) : (
          <div className="flex items-center gap-8 h-full px-4 whitespace-nowrap animate-[ticker_22s_linear_infinite]">
            {loop.map((it, i) => (
              <span key={i} className="text-sm font-medium text-brand-navy">
                {it.buyer} از تیم {it.team} خرید ✦ {fa(it.amount)} سکه
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
