"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Alert } from "@/components/ui";
import { resettleAction, settleNowAction, type SettleActionState } from "../actions";
import { fa, jdatetime } from "@/lib/persian";

export function SettleButton({ settled, phaseClosed }: { settled: boolean; phaseClosed: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [state, formAction, pending] = useActionState<SettleActionState, FormData>(
    async () => settleNowAction(),
    {}
  );
  const [reState, reAction, rePending] = useActionState<SettleActionState, FormData>(
    async () => resettleAction(),
    {}
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form
          action={formAction}
          onSubmit={(e) => {
            const warn = phaseClosed
              ? ""
              : "\n\nهشدار: بازی هنوز در فاز «پایان بازی» نیست؛ امتیازها همین حالا قفل می‌شوند و حمایت‌ها، خریدها و نمره‌های بعدی در نتیجه حساب نمی‌شوند.";
            if (!confirm(`تسویهٔ نهایی اجرا شود؟ این کار برگشت‌ناپذیر است.${warn}`)) e.preventDefault();
          }}
        >
          <button type="submit" disabled={pending || settled} className="btn-primary disabled:opacity-50">
            {pending ? "در حال تسویه…" : "تسویهٔ نهایی"}
          </button>
        </form>
        {!settled && (
          <button
            type="button"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
            className="btn-ghost disabled:opacity-50"
          >
            {refreshing ? "در حال بازمحاسبه…" : "بازمحاسبهٔ پیش‌نمایش"}
          </button>
        )}
      </div>

      {settled && (
        <form
          action={reAction}
          onSubmit={(e) => {
            if (!confirm("امتیازها با نمره‌های فعلی داوران و کسرهای تقلب دوباره محاسبه و جایگزین نتیجهٔ ثبت‌شده شوند؟")) e.preventDefault();
          }}
          className="space-y-2"
        >
          <p className="text-xs text-brand-slate">
            اگر پس از تسویه نمرهٔ داوری، انتخاب جایزه یا کسر تقلبی ثبت شد، با بازتسویه در نتیجهٔ نهایی اعمال می‌شود.
          </p>
          <button type="submit" disabled={rePending} className="btn-ghost disabled:opacity-50">
            {rePending ? "در حال بازتسویه…" : "بازتسویه با نمره‌ها و کسرهای تازه"}
          </button>
        </form>
      )}
      {reState.error && <Alert kind="error">{reState.error}</Alert>}
      {reState.ok && (
        <Alert kind="ok">
          بازتسویه انجام شد؛ نتیجهٔ {fa(reState.teams ?? 0)} تیم دوباره ثبت شد
          {reState.settledAt && <> ({jdatetime(new Date(reState.settledAt))})</>}.
        </Alert>
      )}
      {settled && !state.ok && !reState.ok && <Alert kind="ok">تسویهٔ نهایی قبلاً انجام شده است.</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && (
        <Alert kind={state.alreadySettled ? "info" : "ok"}>
          {state.alreadySettled ? "بازی از قبل تسویه شده بود؛ چیزی دوباره ثبت نشد. " : "تسویه انجام شد. "}
          نتیجهٔ {fa(state.teams ?? 0)} تیم ثبت و قفل است
          {state.settledAt && <> (زمان تسویه: {jdatetime(new Date(state.settledAt))})</>}.
        </Alert>
      )}
    </div>
  );
}
