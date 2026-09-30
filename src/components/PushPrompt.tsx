"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { enablePush } from "./PushToggle";

const DISMISS_KEY = "push-prompt-dismissed";

/** فقط جاهایی که اعلان واقعاً به کار می‌آید (شکسته شدن پیشنهاد حراج، اتفاقات تیم و جایگاه تبلیغ). */
const RELEVANT_PREFIXES = ["/auction", "/team", "/adslots"];

type Mode = "none" | "prompt" | "ios-hint";

function isRelevantPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return RELEVANT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* حالت خصوصی یا ذخیره‌سازی مسدود؛ فقط برای همین بازدید بسته می‌ماند */
  }
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS جدید خودش را Mac معرفی می‌کند؛ با صفحهٔ لمسی از مک واقعی جدا می‌شود
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * بنر کوچک پیشنهاد فعال‌سازی اعلان فوری، در لحظهٔ مناسب (صفحه‌های حراج/تیم/جایگاه تبلیغ).
 * فقط برای کاربر واردشده، وقتی مرورگر پشتیبانی می‌کند، اجازه هنوز «default» است و کاربر قبلاً ردش نکرده.
 * در آیفونِ نصب‌نشده (بدون PushManager) به‌جایش راهنمای Add to Home Screen نشان داده می‌شود.
 */
export function PushPrompt({ loggedIn }: { loggedIn: boolean }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("none");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function detect() {
      if (!loggedIn || readDismissed()) {
        if (!cancelled) setMode("none");
        return;
      }
      const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (isIos() && !("PushManager" in window) && !standalone) {
        if (!cancelled) setMode("ios-hint");
        return;
      }
      const supported =
        window.isSecureContext &&
        typeof Notification !== "undefined" &&
        "PushManager" in window &&
        "serviceWorker" in navigator;
      if (!supported || Notification.permission !== "default") {
        if (!cancelled) setMode("none");
        return;
      }
      // اگر VAPID روی سرور تنظیم نشده، پیشنهادی که کار نمی‌کند نشان نمی‌دهیم
      const res = await fetch("/api/push/key", { cache: "no-store" }).catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => null) : null;
      if (!cancelled) setMode(data && data.publicKey ? "prompt" : "none");
    }
    detect();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  function dismiss() {
    writeDismissed();
    setMode("none");
  }

  async function handleEnable() {
    setBusy(true);
    setFeedback("");
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      setDone(true);
      setFeedback("اعلان فوری فعال شد.");
      setTimeout(() => setMode("none"), 2500);
      return;
    }
    if (result.status === "denied" || result.status === "unsupported" || result.status === "not-configured") {
      // دیگر امکان پرسیدن دوباره نیست؛ بنر را کنار می‌گذاریم
      writeDismissed();
      setMode("none");
      return;
    }
    setFeedback(result.error ?? "فعال‌سازی انجام نشد؛ بعداً از صفحهٔ اعلان‌ها هم می‌توانی فعالش کنی.");
  }

  if (mode === "none" || !isRelevantPath(pathname)) return null;

  return (
    <div
      role="region"
      aria-label="پیشنهاد فعال‌سازی اعلان"
      style={{ bottom: "calc(var(--bottom-nav-h, 0px) + 1rem)" }}
      className="print:hidden fixed right-4 left-[5.5rem] sm:left-auto sm:w-96 z-40 card p-3 shadow-lift"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-lg leading-6">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-brand-navy leading-6" aria-live="polite">
            {feedback ||
              (mode === "ios-hint"
                ? "برای دریافت اعلان در آیفون، سایت را با Share → Add to Home Screen نصب کن."
                : "وقتی پیشنهادت در حراج شکسته شد یا اتفاق مهمی افتاد خبرت کنیم؟")}
          </p>
          {mode === "prompt" && !done && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={handleEnable} disabled={busy} className="btn-primary !py-1.5 !px-4 !text-sm">
                {busy ? "در حال انجام…" : "فعال کن"}
              </button>
              <button type="button" onClick={dismiss} disabled={busy} className="btn-ghost !py-1.5 !px-4 !text-sm">
                نه، ممنون
              </button>
            </div>
          )}
        </div>
        {mode === "ios-hint" && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="بستن راهنمای اعلان"
            className="shrink-0 size-8 -m-1 rounded-full flex items-center justify-center text-brand-slate hover:bg-brand-mist hover:text-brand-navy transition"
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>
    </div>
  );
}
