"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Alert } from "@/components/ui";
import { settleNowAction, type SettleActionState } from "../actions";
import { fa, coins } from "@/lib/persian";

export function SettleButton({ settled }: { settled: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [state, formAction, pending] = useActionState<SettleActionState, FormData>(
    async () => settleNowAction(),
    {}
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form action={formAction}>
          <button type="submit" disabled={pending || settled} className="btn-primary disabled:opacity-50">
            {pending ? "در حال تسویه…" : "تسویهٔ نهایی"}
          </button>
        </form>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
          className="btn-ghost disabled:opacity-50"
        >
          {refreshing ? "در حال بازمحاسبه…" : "بازمحاسبهٔ پیش‌نمایش"}
        </button>
      </div>

      {settled && !state.ok && <Alert kind="ok">تسویهٔ نهایی قبلاً انجام شده است؛ دکمه غیرفعال است.</Alert>}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && state.alreadySettled && <Alert kind="info">بازی از قبل تسویه شده بود؛ چیزی دوباره پرداخت نشد.</Alert>}
      {state.ok && !state.alreadySettled && (
        <Alert kind="ok">
          تسویه انجام شد: {coins(state.dividendsPaid ?? 0)} سود پرداخت شد و نتیجهٔ {fa(state.teams ?? 0)} تیم ثبت گردید.
        </Alert>
      )}
    </div>
  );
}
