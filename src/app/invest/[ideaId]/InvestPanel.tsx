"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { fa, coins } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { investAction, angelPowerAction, type InvestActionState } from "../actions";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={disabled || status.pending} className="btn-primary w-full">
      {status.pending ? "در حال ثبت…" : "ثبت سرمایه‌گذاری"}
    </button>
  );
}

export function InvestPanel({
  ideaId,
  seedWallet,
  maxAllowed,
  isOwnTeam,
}: {
  ideaId: string;
  seedWallet: number;
  maxAllowed: number;
  isOwnTeam: boolean;
}) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(async (_prev, formData) => {
    const amount = Number(formData.get("amount"));
    return investAction(ideaId, amount);
  }, {});
  const [amount, setAmount] = useState(Math.min(1, maxAllowed));

  if (maxAllowed <= 0) {
    return <Alert kind="info">دیگر امکان سرمایه‌گذاری بیشتر روی این ایده را نداری.</Alert>;
  }

  const after = seedWallet - amount;

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">سرمایه‌گذاری ثبت شد.</Alert>}
      {isOwnTeam && <Alert kind="info">این سرمایه‌گذاری روی تیم خودت به‌صورت «خودتأمین» ثبت می‌شود و سودی به تو تعلق نمی‌گیرد.</Alert>}

      <div>
        <label className="label" htmlFor="amount">مبلغ سرمایه‌گذاری</label>
        <input
          id="amount"
          name="amount"
          type="range"
          min={1}
          max={maxAllowed}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full accent-brand-red"
        />
        <div className="flex justify-between text-xs text-brand-slate mt-1">
          <span>{coins(1)}</span>
          <span className="font-black text-brand-navy fa-num">{coins(amount)}</span>
          <span>{coins(maxAllowed)}</span>
        </div>
      </div>

      <p className="text-sm text-brand-slate">
        پس از سرمایه‌گذاری: موجودی {fa(after)} سکه
      </p>

      <SubmitButton disabled={maxAllowed <= 0} />
    </form>
  );
}

export function AngelButton({ ideaId }: { ideaId: string }) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(async () => angelPowerAction(ideaId), {});
  return (
    <form action={formAction} className="space-y-2">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">۲۰ سکهٔ بذر اضافه شد.</Alert>}
      <button type="submit" className="btn-cyan w-full">👼 استفاده از قدرت فرشته</button>
    </form>
  );
}
