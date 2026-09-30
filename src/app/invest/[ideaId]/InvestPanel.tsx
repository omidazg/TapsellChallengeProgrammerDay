"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { coins, fa, toEnDigits } from "@/lib/persian";
import { Alert } from "@/components/ui";
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
  maxPerTarget,
}: {
  ideaId: string;
  seedWallet: number;
  maxAllowed: number;
  /** سقف مؤثر سرمایه‌گذاری روی یک ایده (تنظیم برگزارکننده یا پیش‌فرض) */
  maxPerTarget: number;
}) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(investAction, {});
  const [amount, setAmount] = useState(1);
  // متن خام ورودی عددی هنگام تایپ (null = نمایش مقدار فعلی)؛ تا کاربر بتواند موقتاً فیلد را خالی کند.
  const [typed, setTyped] = useState<string | null>(null);
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
        دیگر امکان سرمایه‌گذاری بیشتر روی این ایده را نداری (به سقف {coins(maxPerTarget)} خودت روی این ایده رسیده‌ای
        یا کیف بذرت خالی است).
      </Alert>
    );
  }

  // اگر سقف مجاز کم شده باشد، مقدار انتخاب‌شده را محدود نگه می‌داریم.
  const value = Math.min(Math.max(amount, 1), maxAllowed);
  const after = seedWallet - value;

  function onTyped(raw: string) {
    // ارقام فارسی/عربی پذیرفته می‌شوند؛ هر نویسهٔ غیرعددی حذف می‌شود.
    const digits = toEnDigits(raw).replace(/[^0-9]/g, "");
    if (!digits) {
      setTyped("");
      return;
    }
    const n = Math.min(Math.max(Number(digits), 1), maxAllowed);
    setAmount(n);
    // اگر عدد تایپ‌شده از بازهٔ مجاز بیرون بود، همان مقدار محدودشده نمایش داده می‌شود.
    setTyped(n === Number(digits) ? digits : String(n));
  }

  const quick: { label: string; amount: number }[] = [
    { label: "۲۵٪", amount: Math.max(1, Math.floor(maxAllowed * 0.25)) },
    { label: "۵۰٪", amount: Math.max(1, Math.floor(maxAllowed * 0.5)) },
    { label: "حداکثر", amount: maxAllowed },
  ];

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
            onClick={() => {
              setAmount(Math.max(1, value - 1));
              setTyped(null);
            }}
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
            onChange={(e) => {
              setAmount(Number(e.target.value));
              setTyped(null);
            }}
            className="w-full h-11 accent-brand-red"
          />
          <button
            type="button"
            aria-label="زیاد کردن مبلغ"
            disabled={value >= maxAllowed}
            onClick={() => {
              setAmount(Math.min(maxAllowed, value + 1));
              setTyped(null);
            }}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            autoComplete="off"
            aria-label={`مبلغ به سکه (۱ تا ${fa(maxAllowed)})`}
            value={fa(typed ?? value, { sep: false })}
            onChange={(e) => onTyped(e.target.value)}
            onBlur={() => setTyped(null)}
            className="input w-28 min-h-11 text-center font-black fa-num"
          />
          <div className="flex flex-1 gap-2 min-w-[12rem]">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                aria-pressed={value === q.amount}
                onClick={() => {
                  setAmount(q.amount);
                  setTyped(null);
                }}
                className={`flex-1 min-h-11 ${value === q.amount ? "btn-navy" : "btn-ghost"} !px-2`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm text-brand-slate">
        پس از سرمایه‌گذاری: موجودی {coins(after)}
      </p>

      <SubmitButton />
    </form>
  );
}
