"use client";

import { useEffect } from "react";

/**
 * کانفتی سبک برای لحظهٔ تبریک (خرید/قلب/سرمایه‌گذاری) — بدون کتابخانه،
 * با CSS خالص. اگر کاربر «حرکت کمتر» را در سیستم‌عامل فعال کرده باشد،
 * فقط پیام متنی نشان داده می‌شود، بدون انیمیشن.
 */

const COLORS = ["#e10126", "#00b8e0", "#002d47", "#f5a524", "#49ba86"];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function ConfettiBurst() {
  const pieces = Array.from({ length: 26 }, (_, i) => {
    const left = seededRandom(i * 7.13) * 100;
    const delay = seededRandom(i * 3.71) * 0.2;
    const dur = 0.8 + seededRandom(i * 11.9) * 0.6;
    const color = COLORS[i % COLORS.length];
    const rotate = seededRandom(i * 5.2) * 360;
    const drift = Math.round((seededRandom(i * 9.4) - 0.5) * 120);
    return { id: i, left, delay, dur, color, rotate, drift };
  });
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      <style>{`
        @keyframes celebrate-piece {
          0% { opacity: 1; transform: translate(0, 0) rotate(0deg); }
          100% { opacity: 0; transform: translate(var(--cx-drift), 46vh) rotate(420deg); }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-1/4 block w-2 h-3 rounded-sm"
          style={
            {
              left: `${p.left}%`,
              backgroundColor: p.color,
              transform: `rotate(${p.rotate}deg)`,
              animationName: "celebrate-piece",
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              animationTimingFunction: "ease-out",
              animationFillMode: "forwards",
              "--cx-drift": `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function Celebrate({
  message,
  show,
  onDone,
}: {
  message: string;
  show: boolean;
  onDone?: () => void;
}) {
  // این کامپوننت فقط وقتی show=true است چیزی رندر می‌کند (بعد از یک رویداد کلاینتی)،
  // پس خواندن مستقیم matchMedia در بدنهٔ رندر مشکلی برای hydration ایجاد نمی‌کند.
  const reducedMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onDone?.(), 1700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  return (
    <>
      {!reducedMotion && <ConfettiBurst />}
      <div role="status" aria-live="polite" className="pointer-events-none fixed top-4 inset-x-0 z-[61] flex justify-center px-4">
        <div className="chip bg-brand-navy text-white shadow-lift anim-pop !px-4 !py-2 !text-sm font-bold">{message}</div>
      </div>
    </>
  );
}
