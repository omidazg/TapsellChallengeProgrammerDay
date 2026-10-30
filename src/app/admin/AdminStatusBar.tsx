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
 * نوار وضعیت زندهٔ مسابقه بالای صفحه‌های پنل: در جریان یا پایان‌یافته، شمارش معکوس تا ددلاین نهایی و وضعیت تسویه.
 * - hydration-safe: زمان فقط پس از mount محاسبه می‌شود (رندر سرور «…» نشان می‌دهد).
 * - هر ۳۰ ثانیه `/api/phase` پرسیده می‌شود تا پایان مسابقه (دستی یا زمان‌بند) بدون رفرش دیده شود؛
 *   اختلاف ساعت کلاینت/سرور از `serverNow` اصلاح می‌شود.
 * - اگر وضعیت از سمت سرور عوض شد یا شمارش به صفر رسید، یک‌بار `router.refresh()` تا بقیهٔ صفحه هم تازه شود.
 */
export function AdminStatusBar({
  phase: initialPhase,
  endsAt: initialEndsAt,
  settledAt,
}: {
  phase: Phase;
  endsAt: string | null;
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

  useEffect(() => {
    let reason: string | null = null;
    if (phase !== initialPhase) reason = `phase:${phase}`;
    else if (expired && phase !== "CLOSED") reason = `expired:${endsAt}`;
    if (reason && refreshedForRef.current !== reason) {
      refreshedForRef.current = reason;
      router.refresh();
    }
  }, [phase, initialPhase, expired, endsAt, router]);

  const closed = phase === "CLOSED";

  let countdown: React.ReactNode;
  if (closed) countdown = <span className="text-brand-slate">مسابقه تمام شده</span>;
  else if (!endsAt) countdown = <span className="text-brand-slate">ددلاین نهایی تعیین نشده</span>;
  else if (now === null) countdown = <span className="text-brand-slate">…</span>;
  else if (expired) countdown = <span className="font-black text-brand-red">ددلاین گذشت؛ مسابقه به‌زودی خودکار بسته می‌شود</span>;
  else
    countdown = (
      <span>
        <span className="text-brand-slate">تا ددلاین نهایی: </span>
        <span className="fa-num font-black text-brand-red">{duration(remaining ?? 0)}</span>
      </span>
    );

  return (
    // aria-live عمداً ندارد: شمارش معکوس هر ثانیه عوض می‌شود و صفحه‌خوان را پر می‌کرد.
    <section aria-label="وضعیت زندهٔ مسابقه" className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          {!closed && <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 animate-ping motion-reduce:animate-none" />}
          <span className={`relative inline-flex size-2.5 rounded-full ${closed ? "bg-brand-slate" : "bg-emerald-500"}`} />
        </span>
        <Link href="/admin/control" className="font-black text-brand-navy hover:underline">
          {PHASE_LABEL[phase]}
        </Link>
      </div>

      <div className="min-w-0">{countdown}</div>

      <div className="flex flex-wrap items-center gap-2 ms-auto">
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
