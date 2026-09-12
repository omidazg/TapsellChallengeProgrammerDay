"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { fa, coins } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { investAction, angelPowerAction, type InvestActionState } from "../actions";

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary w-full">
      {status.pending ? "در حال ثبت…" : "ثبت سرمایه‌گذاری"}
    </button>
  );
}

export function InvestPanel({
  ideaId,
  seedWallet,
  maxAllowed,
  isOwnTeam,
  capFull,
}: {
  ideaId: string;
  seedWallet: number;
  maxAllowed: number;
  isOwnTeam: boolean;
  capFull: boolean;
}) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(investAction, {});
  const [amount, setAmount] = useState(1);

  if (maxAllowed <= 0) {
    return (
      <Alert kind="info">
        {capFull ? "سقف جذب سرمایهٔ این ایده پر شده است." : "دیگر امکان سرمایه‌گذاری بیشتر روی این ایده را نداری."}
      </Alert>
    );
  }

  // اگر سقف مجاز کم شده باشد، مقدار انتخاب‌شده را محدود نگه می‌داریم.
  const value = Math.min(Math.max(amount, 1), maxAllowed);
  const after = seedWallet - value;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="ideaId" value={ideaId} />
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
          step={1}
          value={value}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full accent-brand-red"
        />
        <div className="flex justify-between text-xs text-brand-slate mt-1">
          <span>کمینه {coins(1)}</span>
          <span className="font-black text-brand-navy fa-num">{coins(value)}</span>
          <span>بیشینه {coins(maxAllowed)}</span>
        </div>
      </div>

      <p className="text-sm text-brand-slate">
        پس از سرمایه‌گذاری: موجودی {coins(after)}
      </p>

      <SubmitButton />
    </form>
  );
}

export function AngelButton({ ideaId }: { ideaId: string }) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(angelPowerAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ideaId" value={ideaId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{fa(20)} سکهٔ بذر اضافه شد.</Alert>}
      <button type="submit" className="btn-cyan w-full">👼 استفاده از قدرت فرشته</button>
    </form>
  );
}
