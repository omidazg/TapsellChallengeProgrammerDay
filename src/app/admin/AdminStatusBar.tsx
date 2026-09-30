"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PHASES, PHASE_LABEL, type Phase } from "@/lib/phases";
import { duration, jdatetime } from "@/lib/persian";
import { usePolling } from "@/hooks/usePolling";

type PhaseResponse = { phase: string; endsAt: string | null; serverNow: string };

function asPhase(p: string): Phase | null {
  return (PHASES as readonly string[]).includes(p) ? (p as Phase) : null;
}

/**
 * نوار وضعیت زندهٔ بازی بالای همهٔ صفحه‌های پنل: فاز جاری، شمارش معکوس تا پایان فاز،
 * روشن/خاموش بودن پیشروی خودکار و وضعیت تسویهٔ نهایی.
 * - hydration-safe: زمان فقط پس از mount محاسبه می‌شود (رندر سرور «…» نشان می‌دهد).
 * - هر ۳۰ ثانیه `/api/phase` پرسیده می‌شود تا تغییر فاز (دستی یا زمان‌بند) بدون رفرش دیده شود؛
 *   اختلاف ساعت کلاینت/سرور از `serverNow` اصلاح می‌شود.
 * - اگر فاز از سمت سرور عوض شد یا شمارش به صفر رسید، یک‌بار `router.refresh()` تا بقیهٔ صفحه
 *   (فرم فاز، وضعیت تسویه) هم تازه شود.
 */
export function AdminStatusBar({
  phase: initialPhase,
  endsAt: initialEndsAt,
  autoAdvance,
  settledAt,
}: {
  phase: Phase;
  endsAt: string | null;
  autoAdvance: boolean;
  settledAt: string | null;
}) {
  const router = useRouter();
  // تا وقتی polling چیزی نگفته، داده‌های سرور ملاک‌اند؛ با رندر تازهٔ سرور (props جدید) پاسخ polling کنار می‌رود.
  const [polled, setPolled] = useState<{ phase: Phase; endsAt: string | null; base: string } | null>(null);
  const baseKey = `${initialPhase}|${initialEndsAt ?? ""}`;
  const fresh = polled && polled.base === baseKey ? polled : null;
  const phase = fresh ? fresh.phase : initialPhase;
  const endsAt = fresh ? fresh.endsAt : initialEndsAt;

  const [now, setNow] = useState<number | null>(null);
  const skewRef = useRef(0);
  const refreshedForRef = useRef<string | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now() + skewRef.current);
    const first = setTimeout(update, 0);
    const tick = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
    };
  }, []);

  usePolling(async () => {
    try {
      const res = await fetch("/api/phase", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as PhaseResponse;
      const p = asPhase(data.phase);
      if (!p) return;
      setPolled({ phase: p, endsAt: data.endsAt, base: baseKey });
      const serverNow = new Date(data.serverNow).getTime();
      if (!Number.isNaN(serverNow)) skewRef.current = serverNow - Date.now();
    } catch {
      // شبکه قطع است؛ در نوبت بعدی دوباره تلاش می‌شود
    }
  }, 30_000);

  const remaining = now !== null && endsAt ? new Date(endsAt).getTime() - now : null;
  const expired = remaining !== null && remaining <= 0;

  // فاز روی سرور عوض شده (مثلاً زمان‌بند خودکار) → یک‌بار کل صفحه تازه شود.
  // شمارش به صفر رسید و پیشروی خودکار روشن است → یک‌بار رفرش (فاز تازه ظرف چند ثانیه می‌رسد).
  useEffect(() => {
    let reason: string | null = null;
    if (phase !== initialPhase) reason = `phase:${phase}`;
    else if (expired && autoAdvance) reason = `expired:${endsAt}`;
    if (reason && refreshedForRef.current !== reason) {
      refreshedForRef.current = reason;
      router.refresh();
    }
  }, [phase, initialPhase, expired, autoAdvance, endsAt, router]);

  const idx = PHASES.indexOf(phase);
  const next = idx >= 0 && idx < PHASES.length - 1 ? PHASES[idx + 1] : null;
  const closed = phase === "CLOSED";

  let countdown: React.ReactNode;
  if (closed) countdown = <span className="text-brand-slate">بازی تمام شده</span>;
  else if (!endsAt) countdown = <span className="text-brand-slate">بدون زمان پایان</span>;
  else if (now === null) countdown = <span className="text-brand-slate">…</span>;
  else if (expired)
    countdown = (
      <span className="font-black text-brand-red">
        زمان تمام شد{autoAdvance ? " — در انتظار پیشروی خودکار" : " — فاز را دستی جلو ببر"}
      </span>
    );
  else
    countdown = (
      <span>
        <span className="text-brand-slate">تا پایان: </span>
        <span className="fa-num font-black text-brand-red">{duration(remaining ?? 0)}</span>
      </span>
    );

  return (
    // aria-live عمداً ندارد: شمارش معکوس هر ثانیه عوض می‌شود و صفحه‌خوان را پر می‌کرد.
    <section aria-label="وضعیت زندهٔ بازی" className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          {!closed && <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 animate-ping motion-reduce:animate-none" />}
          <span className={`relative inline-flex size-2.5 rounded-full ${closed ? "bg-brand-slate" : "bg-emerald-500"}`} />
        </span>
        <span className="text-brand-slate">فاز:</span>
        <Link href="/admin#phase-control" className="font-black text-brand-navy hover:underline">
          {PHASE_LABEL[phase]}
        </Link>
        {next && <span className="text-xs text-brand-slate whitespace-nowrap">(بعدی: {PHASE_LABEL[next]})</span>}
      </div>

      <div className="min-w-0">{countdown}</div>

      <div className="flex flex-wrap items-center gap-2 ms-auto">
        <Link
          href="/admin#scheduler"
          className={autoAdvance ? "chip-ok" : "chip-navy"}
          title="تنظیمات زمان‌بند خودکار"
        >
          پیشروی خودکار: {autoAdvance ? "روشن" : "خاموش"}
        </Link>
        <Link
          href="/admin/settlement"
          className={settledAt ? "chip-ok" : closed ? "chip-red" : "chip-navy"}
          title={settledAt && now !== null ? `تسویه در ${jdatetime(new Date(settledAt))}` : undefined}
        >
          {settledAt ? "✓ تسویه‌شده" : closed ? "⚠ تسویه نشده" : "تسویه نشده"}
        </Link>
      </div>
    </section>
  );
}
