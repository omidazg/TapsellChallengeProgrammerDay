"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { coins } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { DEFAULTS } from "@/lib/constants";
import { investAction, type InvestActionState } from "../actions";

// کانفتی جشن فقط پس از سرمایه‌گذاری/استفاده از قدرت موفق لازم است؛ با ssr:false و mount شرطی
// زیر، باندل آن تا اولین رویداد موفق بارگذاری نمی‌شود.
const Celebrate = dynamic(() => import("@/components/Celebrate").then((m) => m.Celebrate), { ssr: false });

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
}: {
  ideaId: string;
  seedWallet: number;
  maxAllowed: number;
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
        دیگر امکان سرمایه‌گذاری بیشتر روی این ایده را نداری (به سقف {coins(DEFAULTS.maxPerTarget)} خودت روی این ایده رسیده‌ای
        یا کیف بذرت خالی است).
      </Alert>
    );
  }

  // اگر سقف مجاز کم شده باشد، مقدار انتخاب‌شده را محدود نگه می‌داریم.
  const value = Math.min(Math.max(amount, 1), maxAllowed);
  const after = seedWallet - value;

  return (
    <form action={formAction} className="space-y-4">
      {celebrate && <Celebrate message="سرمایه‌گذاری ثبت شد 🌱" show onDone={() => setCelebrate(false)} />}
      <input type="hidden" name="ideaId" value={ideaId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">سرمایه‌گذاری ثبت شد.</Alert>}

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
