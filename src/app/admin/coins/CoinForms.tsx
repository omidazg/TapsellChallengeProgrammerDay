"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import {
  markOrderPaidAction,
  rejectOrderAction,
  saveManualInstructionsAction,
  type CoinsActionState,
} from "./actions";

/**
 * اقدام روی یک سفارش: «تأیید پرداخت» (و برای سفارش در انتظار «رد سفارش») با یادداشت اختیاری.
 * برای سفارش ناموفق/لغوشده فقط تأیید دستی نمایش داده می‌شود (وقتی وجه واقعاً رسیده است).
 */
export function OrderActions({
  orderId,
  pending,
  coins,
  nickname,
}: {
  orderId: string;
  /** سفارش در وضعیت PENDING است */
  pending: boolean;
  coins: number;
  nickname: string;
}) {
  const [paidState, paidAction, paying] = useActionState<CoinsActionState, FormData>(markOrderPaidAction, {});
  const [rejectState, rejectAction, rejecting] = useActionState<CoinsActionState, FormData>(rejectOrderAction, {});
  const busy = paying || rejecting;
  const noteId = `order-note-${orderId}`;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const reject = submitter?.value === "reject";
        const msg = reject
          ? `سفارش ${fa(coins)} سکه‌ای ${nickname} رد شود؟`
          : `پرداخت ${nickname} تأیید و ${fa(coins)} سکه به کیفش اضافه شود؟ این کار برگشت‌ناپذیر است.`;
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={noteId} className="sr-only">یادداشت برای سفارش {nickname}</label>
        <input
          id={noteId}
          name="note"
          maxLength={300}
          placeholder="یادداشت (اختیاری، مثلاً شمارهٔ پیگیری رسید)"
          className="input !py-2 !px-3 !text-sm flex-1 min-w-40"
        />
        <button type="submit" formAction={paidAction} value="paid" disabled={busy} className="btn-primary !py-2 !px-4 text-sm min-h-10">
          {paying ? "…" : pending ? "تأیید پرداخت" : "وجه رسیده؛ تأیید دستی"}
        </button>
        {pending && (
          <button
            type="submit"
            formAction={rejectAction}
            value="reject"
            disabled={busy}
            className="btn-ghost !py-2 !px-4 text-sm min-h-10 !text-brand-red"
          >
            {rejecting ? "…" : "رد سفارش"}
          </button>
        )}
      </div>
      {paidState.error && <Alert kind="error">{paidState.error}</Alert>}
      {rejectState.error && <Alert kind="error">{rejectState.error}</Alert>}
    </form>
  );
}

function SaveButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary w-full sm:w-auto">
      {status.pending ? "در حال ذخیره…" : "ذخیرهٔ راهنما"}
    </button>
  );
}

/** ویرایش متن راهنمای پرداخت دستی که پس از ثبت سفارش به خریدار نشان داده می‌شود */
export function ManualInstructionsForm({ value, isDefault }: { value: string; isDefault: boolean }) {
  const [state, formAction] = useActionState<CoinsActionState, FormData>(saveManualInstructionsAction, {});
  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="manual-instructions" className="label">متن راهنمای پرداخت دستی</label>
      <textarea
        id="manual-instructions"
        name="text"
        rows={5}
        maxLength={1500}
        defaultValue={isDefault ? "" : value}
        placeholder={value}
        aria-describedby="manual-instructions-hint"
        className="input w-full leading-7"
      />
      <p id="manual-instructions-hint" className="text-[11px] text-brand-slate">
        شمارهٔ کارت/حساب، نام صاحب حساب و راه ارسال رسید را بنویس. خالی بگذاری، متن پیش‌فرض نمایش داده می‌شود.
      </p>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">راهنما ذخیره شد.</Alert>}
      <SaveButton />
    </form>
  );
}
