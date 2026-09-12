"use client";

import { useState, useTransition } from "react";
import { fa, coins } from "@/lib/persian";
import { Alert, Coin } from "@/components/ui";
import { purchaseAction, heartAction } from "./actions";

export function PurchasePanel({
  productId,
  slug,
  price,
  phaseIsMarket,
  isOwnTeam,
  canUsePower,
  alreadySpent,
  maxPerTarget,
  hasPurchasedAny,
  alreadyHearted,
  heartsCount,
  soldCount,
}: {
  productId: string;
  slug: string;
  price: number;
  phaseIsMarket: boolean;
  isOwnTeam: boolean;
  canUsePower: boolean;
  alreadySpent: number;
  maxPerTarget: number;
  hasPurchasedAny: boolean;
  alreadyHearted: boolean;
  heartsCount: number;
  soldCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [useBargain, setUseBargain] = useState(false);
  const [bargainAvailable, setBargainAvailable] = useState(canUsePower);
  const [spent, setSpent] = useState(alreadySpent);
  const [purchased, setPurchased] = useState(hasPurchasedAny);
  const [justBought, setJustBought] = useState(false);
  const [hearted, setHearted] = useState(alreadyHearted);
  const [hearts, setHearts] = useState(heartsCount);
  const [sold, setSold] = useState(soldCount);

  const remaining = Math.max(0, maxPerTarget - spent);
  const discount = useBargain && bargainAvailable ? Math.floor(price * 0.1) : 0;
  const amount = price - discount;
  const disabled = pending || isOwnTeam || !phaseIsMarket || amount > remaining;

  function buy() {
    setError(null);
    startTransition(async () => {
      const res = await purchaseAction(productId, useBargain, slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      const paid = res.amount ?? amount;
      setSpent((s) => s + paid);
      setSold((s) => s + paid);
      setPurchased(true);
      if (useBargain && bargainAvailable) setBargainAvailable(false);
      setUseBargain(false);
      setJustBought(true);
      setTimeout(() => setJustBought(false), 1200);
    });
  }

  function giveHeart() {
    setError(null);
    startTransition(async () => {
      const res = await heartAction(productId, slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      setHearted(true);
      setHearts((h) => h + 1);
    });
  }

  return (
    <div className="card p-5 space-y-4 anim-rise">
      {error && <Alert kind="error">{error}</Alert>}

      <div className="flex items-center justify-between">
        <Coin n={price} label="قیمت هر خرید" />
        <div className="flex items-center gap-3 text-xs text-brand-slate">
          <span>🛒 {fa(sold)} فروش</span>
          <span>❤️ {fa(hearts)}</span>
        </div>
      </div>

      {!phaseIsMarket && <Alert kind="info">خرید فقط در فاز «روز بازار» ممکن است.</Alert>}
      {isOwnTeam && <Alert kind="info">این محصول تیم خودت است؛ نمی‌توانی از آن بخری.</Alert>}

      {phaseIsMarket && !isOwnTeam && (
        <>
          <p className="text-xs text-brand-slate">
            تا سقف {coins(remaining)} دیگر می‌توانی روی این محصول خرج کنی.
          </p>

          {bargainAvailable && (
            <label className="flex items-center gap-2 text-sm font-medium text-brand-navy cursor-pointer">
              <input type="checkbox" checked={useBargain} onChange={(e) => setUseBargain(e.target.checked)} className="accent-brand-red size-4" />
              استفاده از قدرت چانه‌زنی (۱۰٪ تخفیف)
            </label>
          )}

          <button type="button" onClick={buy} disabled={disabled} className={`btn-primary w-full ${justBought ? "anim-pop" : ""}`}>
            {pending ? "در حال خرید…" : `خرید — ${coins(amount)}`}
          </button>

          {amount > remaining && <p className="text-xs text-brand-red">به سقف مجاز رسیده‌ای.</p>}
        </>
      )}

      {purchased && (
        <div className={`pt-2 border-t border-brand-mist ${justBought ? "anim-pop" : ""}`}>
          <button
            type="button"
            onClick={giveHeart}
            disabled={pending || hearted}
            className={hearted ? "chip-red w-full justify-center py-2" : "btn-ghost w-full"}
          >
            {hearted ? "❤️ قلب دادی" : "❤️ قلب بده"}
          </button>
        </div>
      )}
    </div>
  );
}
