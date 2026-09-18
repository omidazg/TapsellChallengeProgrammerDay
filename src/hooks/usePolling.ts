"use client";

import { useEffect, useEffectEvent } from "react";

export type PollingOptions = {
  /** false: polling متوقف است (مثلاً وقتی SSE فعال است). پیش‌فرض true. */
  enabled?: boolean;
  /**
   * فاصلهٔ polling وقتی تب پنهان است. پیش‌فرض null یعنی کاملاً متوقف شود.
   * (برای مواردی مثل هشدار «پیشنهادت شکسته شد» که در تب پس‌زمینه هم لازم است، یک عدد بزرگ‌تر بدهید.)
   */
  hiddenIntervalMs?: number | null;
  /** اجرای فوری در شروع. پیش‌فرض true. */
  immediate?: boolean;
};

/**
 * polling آگاه از دیده‌شدن صفحه:
 * - وقتی `document.hidden` است متوقف (یا کُند) می‌شود؛
 * - با برگشتن به تب بلافاصله یک‌بار اجرا می‌شود؛
 * - اجراها هم‌پوشانی ندارند (زنجیرهٔ setTimeout به‌جای setInterval)؛
 * - با unmount یا تغییر فاصله/فعال‌بودن، همه‌چیز پاک می‌شود.
 * `callback` همیشه آخرین نسخه است (useEffectEvent) و در وابستگی‌ها لازم نیست.
 */
export function usePolling(
  callback: () => void | Promise<unknown>,
  intervalMs: number | null,
  { enabled = true, hiddenIntervalMs = null, immediate = true }: PollingOptions = {}
) {
  const onTick = useEffectEvent(() => callback());

  useEffect(() => {
    if (!enabled || intervalMs === null) return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      clear();
      if (stopped) return;
      const ms = document.hidden ? hiddenIntervalMs : intervalMs;
      if (ms !== null) timer = setTimeout(run, ms);
    };

    async function run() {
      if (stopped || inFlight) return;
      clear();
      inFlight = true;
      try {
        await onTick();
      } catch {
        /* خطا با خود callback مدیریت می‌شود؛ polling ادامه می‌یابد */
      } finally {
        inFlight = false;
        schedule();
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        // فقط زمان‌بندی بعدی را با فاصلهٔ حالت پنهان تنظیم کن (اگر اجرایی در جریان نیست).
        if (!inFlight) schedule();
      } else {
        void run();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (immediate && !document.hidden) void run();
    else schedule();

    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, hiddenIntervalMs, immediate]);
}
