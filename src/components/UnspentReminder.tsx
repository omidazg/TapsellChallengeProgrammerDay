"use client";

import { useEffect, useState } from "react";
import { fa, coins, duration } from "@/lib/persian";

/**
 * یادآوری سکهٔ خرج‌نشده: وقتی تا پایان فاز کمتر از ۲ ساعت مانده و کاربر هنوز
 * در کیف مربوطه سکه دارد نشان داده می‌شود. برای هر فاز جدا در localStorage قابل‌بستن است.
 */
export function UnspentReminder({
  phase,
  phaseLabel,
  endsAt,
  coinsLeft,
  penaltyPerCoin,
}: {
  phase: string;
  phaseLabel: string;
  endsAt: string | null;
  coinsLeft: number;
  penaltyPerCoin: number;
}) {
  const storageKey = `arena:unspent-dismissed:${phase}`;
  // «mounted» تنها بعد از رندر اول کلاینت true می‌شود، چون خواندن localStorage/Date.now
  // باید پس از هیدریشن اتفاق بیفتد تا با خروجی سرور ناسازگار نشود.
  const [mounted, setMounted] = useState<{ ready: boolean; dismissed: boolean; now: number }>({
    ready: false,
    dismissed: false,
    now: 0,
  });

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(storageKey) === "1";
    } catch {
      dismissed = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- خواندن یک‌بارهٔ localStorage/ساعت پس از mount، فقط برای جلوگیری از ناسازگاری hydration
    setMounted({ ready: true, dismissed, now: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const { ready, dismissed, now } = mounted;
  if (!ready || dismissed || !endsAt || coinsLeft <= 0) return null;

  const remainingMs = new Date(endsAt).getTime() - now;
  if (remainingMs <= 0 || remainingMs > 2 * 60 * 60 * 1000) return null;

  function dismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ذخیره‌سازی محلی در دسترس نبود؛ مهم نیست، فقط یک‌بار دیگر نمایش داده می‌شود
    }
    setMounted((m) => ({ ...m, dismissed: true }));
  }

  return (
    <div className="card p-4 flex items-start gap-3 bg-amber-50 border border-amber-200 anim-pop">
      <span className="text-xl leading-none" aria-hidden>⏰</span>
      <p className="flex-1 text-sm text-brand-navy leading-6">
        تا پایان {phaseLabel} {duration(remainingMs)} مانده و هنوز {coins(coinsLeft)} خرج‌نشده داری؛ هر سکه{" "}
        {fa(penaltyPerCoin)} امتیاز جریمه دارد.
      </p>
      <button type="button" onClick={dismiss} aria-label="بستن یادآوری سکهٔ خرج‌نشده" className="shrink-0 text-brand-slate hover:text-brand-navy">
        ✕
      </button>
    </div>
  );
}
