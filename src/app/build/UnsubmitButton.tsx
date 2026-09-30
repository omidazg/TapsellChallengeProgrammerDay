"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { unsubmitProductAction, type ProductActionState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost w-full justify-center">
      {pending ? "در حال باز کردن…" : "بازکردن برای ویرایش"}
    </button>
  );
}

export function UnsubmitButton() {
  const [state, formAction] = useActionState<ProductActionState, FormData>(async () => unsubmitProductAction(), {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Submit />
    </form>
  );
}
