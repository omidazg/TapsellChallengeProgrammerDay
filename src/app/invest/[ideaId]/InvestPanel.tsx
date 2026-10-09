"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { coins, fa, toEnDigits } from "@/lib/persian";
import { Alert } from "@/components/ui";
import { investAction, type InvestActionState } from "../actions";

// کانفتی جشن فقط پس از حمایت موفق لازم است؛ با ssr:false و mount شرطی
// زیر، باندل آن تا اولین رویداد موفق بارگذاری نمی‌شود.
const Celebrate = dynamic(() => import("@/components/Celebrate").then((m) => m.Celebrate), { ssr: false });

function SubmitButton() {
  const status = useFormStatus();
  return (
    <button type="submit" disabled={status.pending} className="btn-primary w-full">
      {status.pending ? "در حال ثبت…" : "ثبت حمایت"}
    </button>
  );
}

export function InvestPanel({
  ideaId,
  spendable,
  alreadyGiven,
  supportCap,
}: {
  ideaId: string;
  /** سکهٔ قابل‌خرج (موجودی منهای رزرو حراج زنده) */
  spendable: number;
  /** حمایت قبلی همین کاربر از همین ایده */
  alreadyGiven: number;
  /** سقف اثر هر نفر روی امتیاز حمایت مردمی یک پروژه */
  supportCap: number;
}) {
  const [state, formAction] = useActionState<InvestActionState, FormData>(investAction, {});
  const [amount, setAmount] = useState(10);
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

  const maxAllowed = spendable;
  if (maxAllowed <= 0) {
    return (
      <div className="space-y-3">
        {state.ok && <Alert kind="ok">حمایت ثبت شد.</Alert>}
        <Alert kind="info">سکهٔ قابل‌خرجی نداری.</Alert>
        <Link href="/coins" className="btn-ghost w-full justify-center">
          خرید سکه
        </Link>
      </div>
    );
  }

  // اگر موجودی کم شده باشد، مقدار انتخاب‌شده را محدود نگه می‌داریم.
  const value = Math.min(Math.max(amount, 1), maxAllowed);
  const after = spendable - value;
  // بیش از سقف اثر، در امتیاز حساب نمی‌شود (خرج ممنوع نیست؛ فقط هشدار می‌دهیم)
  const overCap = alreadyGiven + value > supportCap;

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

  const quick = [5, 10, 20].filter((n) => n <= maxAllowed);

  return (
    <form action={formAction} className="space-y-4">
      {celebrate && <Celebrate message="حمایت ثبت شد 💚" show onDone={() => setCelebrate(false)} />}
      <input type="hidden" name="ideaId" value={ideaId} />
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.ok && <Alert kind="ok">حمایت ثبت شد.</Alert>}

      <div>
        <label className="label" htmlFor="amount">مبلغ حمایت</label>
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
          {quick.length > 0 && (
            <div className="flex flex-1 gap-2 min-w-[12rem]">
              {quick.map((q) => (
                <button
                  key={q}
                  type="button"
                  aria-pressed={value === q}
                  onClick={() => {
                    setAmount(q);
                    setTyped(null);
                  }}
                  className={`flex-1 min-h-11 ${value === q ? "btn-navy" : "btn-ghost"} !px-2 fa-num`}
                >
                  {fa(q)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {overCap && (
        <p className="text-xs text-amber-700">
          از هر نفر فقط {coins(supportCap)} برای هر پروژه در امتیاز «حمایت مردمی» حساب می‌شود؛ حمایت بیشتر مجاز است
          اما امتیاز بیشتری نمی‌سازد.
        </p>
      )}

      <p className="text-sm text-brand-slate">پس از حمایت: سکهٔ قابل‌خرج {coins(after)}</p>

      <SubmitButton />
    </form>
  );
}
