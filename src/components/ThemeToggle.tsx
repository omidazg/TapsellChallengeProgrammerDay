"use client";

import { useCallback, useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
// چند نمونهٔ این دکمه هم‌زمان mount است (هدر دسکتاپ + منوی موبایل)؛ با این رویداد هم‌گام می‌مانند
// تا نمونهٔ کهنه با listener حالت «سیستم» انتخاب تازهٔ کاربر را بازنویسی نکند.
const SYNC_EVENT = "theme-mode-change";

function isMode(v: unknown): v is Mode {
  return v === "light" || v === "dark" || v === "system";
}
const NEXT: Record<Mode, Mode> = { light: "dark", dark: "system", system: "light" };
const ICON: Record<Mode, string> = { light: "☀️", dark: "🌙", system: "🖥️" };
const LABEL: Record<Mode, string> = { light: "روشن", dark: "تیره", system: "خودکار (سیستم)" };

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: Mode): "light" | "dark" {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

function apply(mode: Mode) {
  document.documentElement.setAttribute("data-theme", resolve(mode));
}

/**
 * دکمهٔ تعویض پوسته: روشن → تیره → خودکار (سیستم) → روشن.
 * انتخاب در localStorage ذخیره می‌شود؛ یک اسکریپت پیش از رندر در layout.tsx
 * همان مقدار را قبل از رنگ‌آمیزی صفحه اعمال می‌کند تا فلاش نور رخ ندهد.
 * بدون انتخاب ذخیره‌شده، پیش‌فرض «خودکار (سیستم)» است (prefers-color-scheme).
 */
export function ThemeToggle({ className = "inline-flex" }: { className?: string }) {
  // مقدار اولیه باید با رندر سرور یکسان باشد تا خطای hydration رخ ندهد؛
  // مقدار واقعی را در افکت زیر از localStorage می‌خوانیم. تا آن لحظه null است و
  // هیچ پوسته‌ای اعمال نمی‌شود — وگرنه همان فریم اول پوستهٔ درستِ اسکریپت layout را
  // با مقدار پیش‌فرض بازنویسی می‌کرد و یک فلاش کوتاه می‌داد.
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage در بعضی مرورگرها/حالت‌های خصوصی ممکن است در دسترس نباشد
    }
    // این effect عمداً فقط یک‌بار پس از mount مقدار واقعی localStorage را با
    // state سمت سرور (که همیشه null است) همگام می‌کند؛ چون localStorage
    // در سرور در دسترس نیست، این همگام‌سازی نمی‌تواند در حین رندر انجام شود.
    // نبودِ مقدار ذخیره‌شده یعنی «سیستم» (هم‌خوان با اسکریپت پیش از رندر در layout.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(isMode(stored) ? stored : "system");

    const onSync = (e: Event) => {
      const next = (e as CustomEvent<unknown>).detail;
      if (isMode(next)) setMode(next);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && isMode(e.newValue)) setMode(e.newValue);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (mode === null) return;
    apply(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(mode);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    const next = NEXT[mode ?? "system"];
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // نبود دسترسی به localStorage نباید تعویض پوسته را خراب کند
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
  }, [mode]);

  const shown = mode ?? "system";
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`تغییر پوسته (فعلی: ${LABEL[shown]})`}
      title={`پوسته: ${LABEL[shown]}`}
      className={`items-center justify-center size-10 rounded-full border border-brand-mist text-brand-navy hover:bg-brand-ice shrink-0 ${className}`}
    >
      <span aria-hidden className="text-lg leading-none">
        {ICON[shown]}
      </span>
    </button>
  );
}
