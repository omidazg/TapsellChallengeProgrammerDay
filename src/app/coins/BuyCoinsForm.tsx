"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert } from "@/components/ui";
import { COIN_PACKAGES, COIN_PRICE_RIAL, COIN_PRICE_TOMAN } from "@/lib/constants";
import { coins, fa, toEnDigits } from "@/lib/persian";
import { buyCoins, type BuyCoinsState } from "./actions";

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className="btn-primary w-full sm:w-auto">
      {pending ? "در حال اتصال به پرداخت…" : label}
    </button>
  );
}

/**
 * انتخاب بسته یا مقدار دلخواه سکه و رفتن به پرداخت.
 * room: سکه‌ای که این کاربر هنوز تا سقف خرید می‌تواند بخرد؛ min: حداقل هر خرید؛ manual: پرداخت بدون درگاه.
 */
export function BuyCoinsForm({ room, min, manual }: { room: number; min: number; manual: boolean }) {
  const [state, formAction] = useActionState<BuyCoinsState, FormData>(buyCoins, {});
  const firstFit = COIN_PACKAGES.find((p) => p <= room) ?? null;
  const [selected, setSelected] = useState<number | null>(firstFit);
  const [custom, setCustom] = useState("");

  const amount = custom ? Number(custom) : (selected ?? 0);
  const valid = Number.isInteger(amount) && amount >= min && amount <= room;
  const hint =
    amount > room
      ? `حداکثر ${coins(room)} دیگر می‌توانی بخری`
      : amount > 0 && amount < min
        ? `حداقل خرید ${coins(min)} است`
        : null;

  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.manual && (
        <Alert kind="ok">
          سفارش {coins(state.coins ?? 0)} ثبت شد و منتظر تأیید برگزارکننده است. طبق راهنمای پرداخت همین صفحه عمل کن؛
          پس از تأیید، سکه‌ها خودکار به کیفت اضافه می‌شوند.
        </Alert>
      )}

      <fieldset>
        <legend className="label">یک بسته انتخاب کن</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {COIN_PACKAGES.map((p) => {
            const active = !custom && selected === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                disabled={p > room}
                onClick={() => {
                  setSelected(p);
                  setCustom("");
                }}
                className={`rounded-2xl border p-4 text-center transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  active ? "border-brand-red bg-brand-ice ring-2 ring-brand-red/30" : "border-brand-mist hover:bg-brand-ice"
                }`}
              >
                <div className="text-xl font-black text-brand-navy fa-num">{coins(p)}</div>
                <div className="mt-1 text-xs text-brand-slate fa-num">{fa(p * COIN_PRICE_TOMAN)} تومان</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="customCoins">
          یا مقدار دلخواه (از {fa(min)} تا {fa(room)} سکه)
        </label>
        <input
          id="customCoins"
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          value={fa(custom, { sep: false })}
          onChange={(e) => setCustom(toEnDigits(e.target.value).replace(/[^0-9]/g, "").slice(0, 6))}
          aria-describedby={hint ? "customCoinsHint" : undefined}
          aria-invalid={hint ? true : undefined}
          className="input w-40 text-center font-black fa-num"
          placeholder={fa(min)}
        />
        {hint && (
          <p id="customCoinsHint" className="mt-1 text-xs text-brand-red">
            {hint}
          </p>
        )}
      </div>

      <input type="hidden" name="coins" value={valid ? String(amount) : ""} />

      <div className="rounded-2xl bg-brand-ice p-4 text-sm text-brand-navy" aria-live="polite">
        {valid ? (
          <>
            مبلغ قابل پرداخت برای {coins(amount)}:{" "}
            <b className="fa-num">{fa(amount * COIN_PRICE_TOMAN)} تومان</b>{" "}
            <span className="text-brand-slate fa-num">({fa(amount * COIN_PRICE_RIAL)} ریال)</span>
          </>
        ) : (
          <>هر سکه {fa(COIN_PRICE_TOMAN)} تومان است.</>
        )}
      </div>

      <SubmitButton
        disabled={!valid}
        label={valid ? (manual ? `ثبت سفارش ${coins(amount)}` : `پرداخت و خرید ${coins(amount)}`) : "مقدار سکه را انتخاب کن"}
      />
    </form>
  );
}
