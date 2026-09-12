"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui";
import { useShieldAction as activateShield, type WalletActionState } from "./actions";

export function ShieldButton() {
  const [state, formAction, pending] = useActionState<WalletActionState, FormData>(async () => activateShield(), {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">سپر فعال شد؛ ۱۰ سکه از جریمهٔ خرج‌نشده کسر می‌شود.</Alert>}
      <button type="submit" disabled={pending} className="btn-cyan">
        {pending ? "در حال فعال‌سازی…" : "🛡️ فعال‌سازی سپر"}
      </button>
    </form>
  );
}
