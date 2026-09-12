"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { unsubmitProductAction, type ProductActionState } from "./actions";

export function UnsubmitButton() {
  const [state, formAction] = useActionState<ProductActionState, FormData>(async () => unsubmitProductAction(), {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <button type="submit" className="btn-ghost w-full justify-center">بازکردن برای ویرایش</button>
    </form>
  );
}
