"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { fa } from "@/lib/persian";
import { runCollusionCheckAction, type FlagsActionState } from "./actions";

export function RunCheckButton() {
  const [state, formAction, pending] = useActionState<FlagsActionState, FormData>(async () => runCollusionCheckAction(), {});
  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "در حال بررسی…" : "بررسی خرید متقابل مشکوک"}
      </button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">بررسی انجام شد؛ {fa(state.flagCount ?? 0)} پرچم در فهرست است.</Alert>}
    </form>
  );
}
