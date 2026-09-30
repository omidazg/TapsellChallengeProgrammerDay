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
 */
export function ThemeToggle({ className = "inline-flex" }: { className?: string }) {
  // مقدار اولیه باید با رندر سرور یکسان باشد تا خطای hydration رخ ندهد؛
  // مقدار واقعی را در افکت زیر از localStorage می‌خوانیم.
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage در بعضی مرورگرها/حالت‌های خصوصی ممکن است در دسترس نباشد
    }
    // این effect عمداً فقط یک‌بار پس از mount مقدار واقعی localStorage را با
    // state سمت سرور (که همیشه "light" است) همگام می‌کند؛ چون localStorage
    // در سرور در دسترس نیست، این همگام‌سازی نمی‌تواند در حین رندر انجام شود.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isMode(stored)) setMode(stored);

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
    apply(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(mode);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    const next = NEXT[mode];
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // نبود دسترسی به localStorage نباید تعویض پوسته را خراب کند
    }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
  }, [mode]);

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`تغییر پوسته (فعلی: ${LABEL[mode]})`}
      title={`پوسته: ${LABEL[mode]}`}
      className={`items-center justify-center size-10 rounded-full border border-brand-mist text-brand-navy hover:bg-brand-ice shrink-0 ${className}`}
    >
      <span aria-hidden className="text-lg leading-none">
        {ICON[mode]}
      </span>
    </button>
  );
}
