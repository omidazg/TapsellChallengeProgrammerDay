"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Alert } from "@/components/ui";
import { useConfirmSubmit } from "@/components/ConfirmDialog";
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
  const confirmSubmit = useConfirmSubmit();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form
          action={formAction}
          onSubmit={(e) => {
            confirmSubmit(e, {
              title: "تسویهٔ نهایی اجرا شود؟",
              body: phaseClosed
                ? "نتیجهٔ همهٔ ثبت‌ها ثبت می‌شود. بعداً فقط با «بازتسویه» قابل به‌روزرسانی است."
                : "تسویهٔ زودهنگام: مسابقه هنوز تمام نشده است. نتیجه همین حالا ثبت می‌شود، ولی با پایان مسابقه با همهٔ حمایت‌ها، خریدها و نمره‌ها تا آن لحظه دوباره محاسبه و جایگزین می‌شود.",
              destructive: true,
            });
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
            confirmSubmit(e, "امتیازها با نمره‌های فعلی داوران و کسرهای تقلب دوباره محاسبه و جایگزین نتیجهٔ ثبت‌شده شوند؟");
          }}
          className="space-y-2"
        >
          <p className="text-xs text-brand-slate">
            اگر پس از تسویه نمرهٔ داوری، ارزیابی هوش مصنوعی یا کسر تقلبی ثبت شد، با بازتسویه در نتیجه اعمال می‌شود.
          </p>
          <button type="submit" disabled={rePending} className="btn-ghost disabled:opacity-50">
            {rePending ? "در حال بازتسویه…" : "بازتسویه با نمره‌ها و کسرهای تازه"}
          </button>
        </form>
      )}
      {reState.error && <Alert kind="error">{reState.error}</Alert>}
      {reState.ok && (
        <Alert kind="ok">
          بازتسویه انجام شد؛ نتیجهٔ {fa(reState.teams ?? 0)} ثبت دوباره ذخیره شد
          {reState.settledAt && <> ({jdatetime(new Date(reState.settledAt))})</>}.
        </Alert>
      )}
      {settled && !state.ok && !reState.ok && <Alert kind="ok">تسویهٔ نهایی قبلاً انجام شده است.</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && (
        <Alert kind={state.alreadySettled ? "info" : "ok"}>
          {state.alreadySettled ? "تسویه از قبل انجام شده بود؛ چیزی دوباره ثبت نشد. " : "تسویه انجام شد. "}
          نتیجهٔ {fa(state.teams ?? 0)} ثبت ذخیره شد
          {state.settledAt && <> (زمان تسویه: {jdatetime(new Date(state.settledAt))})</>}.
        </Alert>
      )}
    </div>
  );
}
