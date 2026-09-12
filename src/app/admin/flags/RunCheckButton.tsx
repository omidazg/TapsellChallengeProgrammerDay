"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { runCollusionCheckAction, type FlagsActionState } from "./actions";

export function RunCheckButton() {
  const [state, formAction, pending] = useActionState<FlagsActionState, FormData>(async () => runCollusionCheckAction(), {});
  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "در حال بررسی…" : "بررسی خرید متقابل مشکوک"}
      </button>
      {state.ok && <Alert kind="ok">بررسی انجام شد.</Alert>}
    </form>
  );
}
