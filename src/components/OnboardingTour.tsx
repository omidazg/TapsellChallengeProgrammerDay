"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { PHASE_LABEL } from "@/lib/phases";
import { DEFAULTS } from "@/lib/constants";
import { fa } from "@/lib/persian";

const STORAGE_KEY = "arena:onboarding-seen";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Step = { title: string; body: React.ReactNode };

const STEPS: Step[] = [
  {
    title: "بازی در چهار مرحلهٔ اصلی پیش می‌رود",
    body: (
      <p>
        بعد از ثبت‌نام، بازی از «{PHASE_LABEL.IDEATION}» شروع می‌شود و به‌ترتیب به «{PHASE_LABEL.SEED_ROUND}»، «
        {PHASE_LABEL.BUILD}»، «{PHASE_LABEL.MARKET}» و «{PHASE_LABEL.AUCTION}» می‌رسد. در صفحهٔ اصلی همیشه می‌توانی فاز جاری و زمان
        باقی‌مانده‌اش را ببینی.
      </p>
    ),
  },
  {
    title: "دو کیف پول داری؛ سکهٔ خرج‌نشده جریمه دارد",
    body: (
      <p>
        🌱 «کیف بذر» فقط برای سرمایه‌گذاری روی ایدهٔ تیم‌های دیگر است و 🛒 «کیف خرید» برای خرید محصول و حراج زنده. هر سکهٔ خرج‌نشده در
        پایان بازی {fa(DEFAULTS.penaltyPerCoin)} امتیاز از تیمت کم می‌کند؛ پس بهتر است هر دو کیف را تا آخر خرج کنی.
      </p>
    ),
  },
  {
    title: "قدم بعدی: اتاق تیمت",
    body: (
      <p>
        حالا برو به <b className="text-brand-navy">اتاق تیم</b> تا تیم سه‌نفره‌ات را بسازی یا به تیمی بپیوندی؛ بدون تیم کامل نمی‌توانی
        وارد فازهای بعدی بازی شوی.
      </p>
    ),
  },
  {
    title: "اگر جایی گیر کردی، راهنما همیشه در دسترس است",
    body: (
      <p>
        همهٔ قوانین، مثال‌ها و ترفندهای هر مرحله در{" "}
        <Link href="/guide" className="font-bold text-brand-cyan-deep underline underline-offset-2">
          راهنمای کامل بازی
        </Link>{" "}
        نوشته شده؛ هر وقت خواستی می‌توانی این راهنمای شروع را هم دوباره از همین صفحه باز کنی.
      </p>
    ),
  },
];

/**
 * راهنمای شروع کار (اونبوردینگ): یک مودال قابل‌دسترس با چهار قدم کوتاه.
 * یک‌بار به‌صورت خودکار (وقتی `autoOpen` و هنوز در localStorage دیده نشده) باز می‌شود،
 * و یک لینک کوچک برای بازکردن دستی‌اش همیشه در دسترس است.
 */
export function OnboardingTour({ autoOpen = false }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!autoOpen) return;
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = false;
    }
    if (!seen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- بازکردن یک‌بارهٔ مودال پس از خواندن localStorage، فقط برای جلوگیری از ناسازگاری hydration
      setOpen(true);
    }
    // پاک‌کردن ?welcome=1 از نوار آدرس تا رفرش دوباره مودال را باز نکند
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("welcome")) {
        url.searchParams.delete("welcome");
        window.history.replaceState({}, "", url.pathname + (url.search ? `?${url.searchParams}` : "") + url.hash);
      }
    } catch {
      // تغییر تاریخچهٔ مرورگر در دسترس نبود؛ مهم نیست
    }
  }, [autoOpen]);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ذخیره‌سازی محلی در دسترس نبود؛ مهم نیست، فقط دوباره نمایش داده می‌شود
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
  }, [markSeen]);

  function openAgain() {
    setStep(0);
    setOpen(true);
  }

  // فوکوس‌تراپ + Escape + بازگرداندن فوکوس پس از بسته‌شدن
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const focusables = () => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []);
    const first = focusables()[0] ?? node;
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastFocusedRef.current?.focus?.();
    };
  }, [open, close]);

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <>
      <button type="button" onClick={openAgain} className="text-xs font-bold text-brand-cyan-deep underline underline-offset-2">
        نمایش دوبارهٔ راهنمای شروع
      </button>

      {/* پورتال به body: والد انیمیشنی (transform) جعبهٔ مرجع fixed را عوض می‌کند و مودال را محبوس می‌کرد */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-navy/50 anim-pop" onClick={close} aria-hidden />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="card relative w-full max-w-md p-6 anim-pop focus:outline-none"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="chip-navy">
                قدم {fa(step + 1)} از {fa(STEPS.length)}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="بستن راهنمای شروع"
                className="rounded-full p-1 text-brand-slate hover:text-brand-navy"
              >
                ✕
              </button>
            </div>

            <h2 id={titleId} className="text-lg font-black text-brand-navy">
              {current.title}
            </h2>
            <div className="mt-2 text-sm text-brand-navy/90 leading-7">{current.body}</div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={close} className="btn-ghost !px-4 !py-1.5 text-sm">
                بستن
              </button>
              <div className="flex items-center gap-2">
                {!isFirst && (
                  <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} className="btn-ghost !px-4 !py-1.5 text-sm">
                    قبلی
                  </button>
                )}
                {!isLast ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                    className="btn-primary !px-4 !py-1.5 text-sm"
                  >
                    بعدی
                  </button>
                ) : (
                  <button type="button" onClick={close} className="btn-primary !px-4 !py-1.5 text-sm">
                    باشه، متوجه شدم
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  );
}
