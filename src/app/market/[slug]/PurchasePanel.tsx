"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { fa, coins } from "@/lib/persian";
import { Alert, Coin } from "@/components/ui";
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
  alreadySpent,
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
  /** مجموع سکه‌ای که کاربر تاکنون روی این محصول خرج کرده */
  alreadySpent: number;
  /** سکه‌های قابل‌خرج (موجودی منهای سکه‌های رزروشده برای پیشتازی در حراج زنده)؛ اعتبارسنجی نهایی سمت سرور است */
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

  const walletShort = price > wallet;
  const walletAfter = wallet - price;
  const disabled = pending || isOwnTeam || !phaseIsMarket || walletShort;

  function buy() {
    setError(null);
    startTransition(async () => {
      const res = await purchaseAction(productId, slug);
      if (res.error) {
        setError(res.error);
        return;
      }
      const paid = res.amount ?? price;
      setSpent((s) => s + paid);
      setWallet((w) => Math.max(0, w - paid));
      setSold((s) => s + paid);
      setPurchased(true);
      setJustBought(true);
      setTimeout(() => setJustBought(false), 1200);
      setCelebrate("خرید انجام شد 🎉");
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
        <Coin n={price} label="قیمت" />
        <div className="flex items-center gap-3 text-xs text-brand-slate">
          <span>🛒 {fa(sold)} فروش</span>
          <span>❤️ {fa(hearts)}</span>
        </div>
      </div>

      {!phaseIsMarket && <Alert kind="info">خرید فقط در فاز «روز بازار» ممکن است.</Alert>}
      {isOwnTeam && <Alert kind="info">این محصول تیم خودت است؛ نمی‌توانی از آن بخری.</Alert>}

      {phaseIsMarket && !isOwnTeam && (
        <>
          <p className="text-xs text-brand-slate leading-6">
            هر خرید به قیمت کامل است و یعنی حمایت از این تیم در امتیاز «حمایت مردمی».
            {spent > 0 && <> تا حالا {coins(spent)} از این محصول خریده‌ای.</>}
          </p>

          <dl className="rounded-2xl bg-brand-ice px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-brand-slate">سکه‌های قابل‌خرج تو</dt>
              <dd className="font-black text-brand-navy fa-num">{coins(wallet)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-brand-slate">پس از خرید</dt>
              <dd className={`font-black fa-num ${walletShort ? "text-brand-red" : "text-brand-navy"}`}>
                {walletShort ? "کافی نیست" : coins(walletAfter)}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={buy}
            disabled={disabled}
            aria-describedby={walletShort ? "purchase-blocked-reason" : undefined}
            className={`btn-primary w-full ${justBought ? "anim-pop" : ""}`}
          >
            {pending ? "در حال خرید…" : `خرید — ${coins(price)}`}
          </button>

          {walletShort && (
            <p id="purchase-blocked-reason" className="text-xs text-brand-red leading-6">
              سکهٔ کافی نداری؛ برای این خرید {coins(price - wallet)} دیگر لازم داری.{" "}
              <Link href="/coins" className="font-bold underline">
                خرید سکه ←
              </Link>
            </p>
          )}
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
