"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { fa, coins } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { Celebrate } from "@/components/Celebrate";
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
  const [celebrate, setCelebrate] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- واکنش به نتیجهٔ server action (منبع خارجی)، نه همگام‌سازی رندر
      setCelebrate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

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
      <Celebrate message="سرمایه‌گذاری ثبت شد 🌱" show={celebrate} onDone={() => setCelebrate(false)} />
      <input type="hidden" name="ideaId" value={ideaId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">سرمایه‌گذاری ثبت شد.</Alert>}
      {isOwnTeam && <Alert kind="info">این سرمایه‌گذاری روی تیم خودت به‌صورت «خودتأمین» ثبت می‌شود و سودی به تو تعلق نمی‌گیرد.</Alert>}

      <div>
        <label className="label" htmlFor="amount">مبلغ سرمایه‌گذاری</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="کم کردن مبلغ"
            disabled={value <= 1}
            onClick={() => setAmount(Math.max(1, value - 1))}
            className="btn-ghost !rounded-full !px-0 size-11 shrink-0 text-lg"
          >
            −
          </button>
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
          <button
            type="button"
            aria-label="زیاد کردن مبلغ"
            disabled={value >= maxAllowed}
            onClick={() => setAmount(Math.min(maxAllowed, value + 1))}
            className="btn-ghost !rounded-full !px-0 size-11 shrink-0 text-lg"
          >
            +
          </button>
        </div>
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
  const [celebrate, setCelebrate] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- واکنش به نتیجهٔ server action (منبع خارجی)، نه همگام‌سازی رندر
      setCelebrate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-2">
      <Celebrate message="سرمایه‌گذاری ثبت شد 🌱" show={celebrate} onDone={() => setCelebrate(false)} />
      <input type="hidden" name="ideaId" value={ideaId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">{fa(20)} سکهٔ بذر اضافه شد.</Alert>}
      <button type="submit" className="btn-cyan w-full">👼 استفاده از قدرت فرشته</button>
    </form>
  );
}
