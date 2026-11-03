"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui";
import { SHOWCASE_STATUS_LABEL, type ShowcaseStatus } from "@/lib/community";
import { requestShowcaseAction, withdrawShowcaseAction } from "./actions";

const STATUS_CHIP: Record<Exclude<ShowcaseStatus, "">, string> = {
  REQUESTED: "chip-gold",
  APPROVED: "chip-ok",
  REJECTED: "chip-red",
};

/** درخواست نمایش محصول در ویترین عمومی (با نام سازنده‌ها) و بیرون آوردن از آن */
export function ShowcaseCard({
  trackId,
  slug,
  status,
  note,
  submitted,
  canManage,
  open,
}: {
  trackId: string;
  slug: string | null;
  status: ShowcaseStatus;
  note: string;
  submitted: boolean;
  canManage: boolean;
  open: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
    });
  };

  return (
    <section className="card p-5 space-y-3 anim-rise" aria-labelledby="showcase-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="showcase-title" className="text-sm font-black text-brand-navy flex-1">
          🛍️ نمایش در ویترین عمومی <span className="font-medium text-brand-slate">(اختیاری)</span>
        </h2>
        {status && <span className={STATUS_CHIP[status]}>{SHOWCASE_STATUS_LABEL[status]}</span>}
      </div>
      <p className="text-xs text-brand-slate leading-6">
        محصول تأییدشده با نام تیم و سازنده‌ها در صفحهٔ عمومی ویترین دیده می‌شود و بقیه می‌توانند به آن رأی بدهند. برای نمایش نام واقعی‌ات، «نام نمایشی» را در{" "}
        <Link href="/profile#display-name" className="underline underline-offset-4">پروفایل</Link> وارد کن؛ وگرنه نام مستعارت نمایش داده می‌شود.
        نمایش در ویترین مالکیت محصول را تغییر نمی‌دهد.
      </p>
      {status === "REJECTED" && note && <Alert kind="error">یادداشت برگزارکننده: {note}</Alert>}
      {status === "APPROVED" && slug && (
        <Link href={`/showcase/${slug}`} className="btn-cyan w-full justify-center">دیدن صفحهٔ ویترین</Link>
      )}
      {error && <Alert kind="error">{error}</Alert>}
      {canManage && (status === "" || status === "REJECTED") && (
        open && submitted ? (
          <button type="button" disabled={pending} onClick={() => run(() => requestShowcaseAction(trackId))} className="btn-primary w-full justify-center">
            {pending ? "در حال ارسال…" : status === "REJECTED" ? "ارسال دوبارهٔ درخواست" : "درخواست نمایش در ویترین"}
          </button>
        ) : (
          <p className="text-xs text-brand-slate">{!submitted ? "اول محصولت را ثبت نهایی کن." : "ویترین فعلاً درخواست تازه نمی‌پذیرد."}</p>
        )
      )}
      {canManage && (status === "REQUESTED" || status === "APPROVED") && (
        <button type="button" disabled={pending} onClick={() => run(() => withdrawShowcaseAction(trackId))} className="btn-ghost w-full justify-center">
          {pending ? "…" : status === "APPROVED" ? "بیرون آوردن از ویترین" : "لغو درخواست"}
        </button>
      )}
    </section>
  );
}
