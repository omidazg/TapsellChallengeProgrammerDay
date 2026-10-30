"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
import { usePolling } from "@/hooks/usePolling";
import { fa, jdatetime } from "@/lib/persian";
import { finalAiStatusAction, startFinalAiAction, type FinalAiStatus } from "./actions";

/** دکمهٔ ارزیابی نهایی با نمایش پیشرفت: اجرا در پس‌زمینهٔ سرور است و این فرم نتیجه را می‌پرسد. */
export function FinalAiButton({ initial }: { initial: FinalAiStatus }) {
  const router = useRouter();
  const confirmSubmit = useConfirmSubmit();
  const [polled, setPolled] = useState<FinalAiStatus | null>(null);
  const [started, formAction, pending] = useActionState<FinalAiStatus | null, FormData>(async () => {
    const next = await startFinalAiAction();
    setPolled(next);
    return next;
  }, null);
  const status = polled ?? started ?? initial;
  const wasRunning = useRef(status.running);

  usePolling(
    async () => {
      setPolled(await finalAiStatusAction());
    },
    5_000,
    { enabled: status.running, immediate: false }
  );

  // پایان اجرا: جدول امتیاز و نمره‌ها در همین صفحه تازه شوند.
  useEffect(() => {
    if (wasRunning.current && !status.running) router.refresh();
    wasRunning.current = status.running;
  }, [status.running, router]);

  const last = status.last;
  return (
    <div className="space-y-3">
      <form
        action={formAction}
        onSubmit={(e) =>
          confirmSubmit(e, {
            title: "ارزیابی نهایی هوش مصنوعی اجرا شود؟",
            body: "همهٔ محصول‌های ثبت‌شده دوباره با پارامترهای محور خودشان نمره می‌گیرند و این نمره جای بازخورد موقت را می‌گیرد.",
          })
        }
      >
        <button type="submit" disabled={pending || status.running} className="btn-cyan disabled:opacity-50">
          {pending ? "در حال شروع…" : status.running ? "در حال ارزیابی…" : "اجرای ارزیابی نهایی هوش مصنوعی"}
        </button>
      </form>
      {status.error && <Alert kind="error">{status.error}</Alert>}
      {status.running && (
        <Alert kind="info">
          <span role="progressbar" aria-valuemin={0} aria-valuemax={status.total} aria-valuenow={status.evaluated} className="fa-num">
            {fa(status.evaluated)} از {fa(status.total)} محصول ارزیابی شده است. می‌توانی از این صفحه بروی؛ ارزیابی ادامه دارد.
          </span>
        </Alert>
      )}
      {!status.running && last && (
        <Alert kind={last.error || last.failed > 0 || last.done === 0 ? "error" : "ok"}>
          {last.error
            ? "ارزیابی نهایی با خطا روبه‌رو شد."
            : last.done === 0 && last.failed === 0
              ? "هیچ محصولی ارزیابی نشد: محصول ثبت‌شده‌ای نیست، هوش مصنوعی در دسترس نیست یا ارزیابی دیگری (مثلاً پس از پایان مسابقه) در جریان است."
              : `${fa(last.done)} محصول ارزیابی شد${last.failed > 0 ? ` و ${fa(last.failed)} محصول ناموفق بود؛ می‌توانی دوباره اجرا کنی` : ""}.`}{" "}
          <span className="text-xs">({jdatetime(new Date(last.finishedAt))})</span>
        </Alert>
      )}
    </div>
  );
}
