"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { requestAiRecheckAction, type ProductActionState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-cyan w-full justify-center">
      {pending ? "هوش مصنوعی در حال بررسی دوباره…" : "درخواست ارزیابی مجدد (فقط یک بار)"}
    </button>
  );
}

/** یک بار درخواست ارزیابی مجدد هوش مصنوعی؛ پس از مصرف، صفحه دیگر این دکمه را نشان نمی‌دهد. */
export function AiRecheckButton({ trackId }: { trackId: string }) {
  const [state, formAction] = useActionState<ProductActionState, FormData>(() => requestAiRecheckAction(trackId), {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Submit />
    </form>
  );
}
