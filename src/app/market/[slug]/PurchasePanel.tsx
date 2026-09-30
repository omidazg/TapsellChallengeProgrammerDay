"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fa, coins } from "@/lib/persian";
import { Alert, Coin } from "@/components/ui";
import { DEFAULTS } from "@/lib/constants";
import { bargainDiscountFor } from "@/lib/economy/engine";
import { purchaseAction, heartAction } from "./actions";

// کانفتی جشن فقط پس از خرید/قلب موفق لازم است؛ با ssr:false و mount شرطی زیر،
// باندل آن تا اولین رویداد موفق بارگذاری نمی‌شود.
const Celebrate = dynamic(() => import("@/components/Celebrate").then((m) => m.Celebrate), { ssr: false });

export function PurchasePanel({
  productId,
  slug,
  price,
  phaseIsMarket,
  isOwnTeam,
  hasBargain,
  alreadySpent,
  maxPerTarget,
  walletBalance,
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
  /** آیا کاربر قدرت «چانه‌زنی» دارد؛ برای کل فاز بازار فعال است، نه یک‌بار مصرف */
  hasBargain: boolean;
  alreadySpent: number;
  /** سقف مؤثر خرید از *این* محصول (effectivePurchaseCap: حداقل قیمت محصول، حتی اگر از سقف عمومی بیشتر باشد) */
  maxPerTarget: number;
  /** موجودی قابل‌خرج کیف خرید (کیف خرید منهای رزرو حراج زنده)؛ اعتبارسنجی نهایی سمت سرور است */
  walletBalance: number;
  hasPurchasedAny: boolean;
  alreadyHearted: boolean;
  heartsCount: number;
  soldCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState(alreadySpent);
  const [wallet, setWallet] = useState(walletBalance);
  const [purchased, setPurchased] = useState(hasPurchasedAny);
  const [justBought, setJustBought] = useState(false);
  const [hearted, setHearted] = useState(alreadyHearted);
  const [hearts, setHearts] = useState(heartsCount);
  const [sold, setSold] = useState(soldCount);
  const [celebrate, setCelebrate] = useState<string | null>(null);

  // سقف بر مبنای قیمت کامل شمرده می‌شود، حتی برای دارندهٔ چانه‌زنی (فروشنده قیمت کامل می‌گیرد).
  const remaining = Math.max(0, maxPerTarget - spent);
  const discount = hasBargain ? bargainDiscountFor(price, DEFAULTS.bargainDiscount) : 0;
  const amount = price - discount;
  const capReached = price > remaining;
  const walletShort = amount > wallet;
  const walletAfter = wallet - amount;
  const disabled = pending || isOwnTeam || !phaseIsMarket || capReached || walletShort;

  function buy() {
    setError(null);
    startTransition(async () => {
      const res = await purchaseAction(productId, slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      // سقف و فروش همیشه با قیمت کامل افزایش می‌یابند؛ فقط کیف خریدار با تخفیف کم می‌شود.
      setSpent((s) => s + price);
      setWallet((w) => Math.max(0, w - (res.amount ?? amount)));
      setSold((s) => s + price);
      setPurchased(true);
      setJustBought(true);
      setTimeout(() => setJustBought(false), 1200);
      setCelebrate(discount > 0 ? `خرید با چانه‌زنی انجام شد 🎉 (${coins(res.amount ?? amount)} پرداخت شد)` : "خرید انجام شد 🎉");
      router.refresh();
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
      setCelebrate("قلبت ثبت شد ❤️");
      router.refresh();
    });
  }

  return (
    <div className="card p-5 space-y-4 anim-rise">
      {celebrate && <Celebrate message={celebrate} show onDone={() => setCelebrate(null)} />}
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
            تا سقف {coins(remaining)} دیگر (قیمت کامل) می‌توانی از این محصول بخری.
          </p>

          {hasBargain && (
            <p className="text-sm font-bold text-brand-cyan-dark">
              🏷️ با چانه‌زنی: {coins(amount)} سکه به‌جای {coins(price)}
            </p>
          )}

          <dl className="rounded-2xl bg-brand-ice px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-brand-slate">موجودی کیف خرید</dt>
              <dd className="font-black text-brand-navy fa-num">{coins(wallet)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-brand-slate">موجودی پس از خرید</dt>
              <dd className={`font-black fa-num ${walletShort ? "text-brand-red" : "text-brand-navy"}`}>
                {walletShort ? "کافی نیست" : coins(walletAfter)}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={buy}
            disabled={disabled}
            aria-describedby={capReached || walletShort ? "purchase-blocked-reason" : undefined}
            className={`btn-primary w-full ${justBought ? "anim-pop" : ""}`}
          >
            {pending ? "در حال خرید…" : `خرید — ${coins(amount)}`}
          </button>

          {capReached ? (
            <p id="purchase-blocked-reason" className="text-xs text-brand-red">به سقف مجاز خریدت از این محصول رسیده‌ای.</p>
          ) : walletShort ? (
            <p id="purchase-blocked-reason" className="text-xs text-brand-red">
              موجودی کیف خریدت کافی نیست؛ برای این خرید {coins(amount - wallet)} دیگر لازم داری.
            </p>
          ) : null}
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
