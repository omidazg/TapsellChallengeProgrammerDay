import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPhase, getSettingInt } from "@/lib/phase";
import { COIN_PRICE_TOMAN, DEFAULTS } from "@/lib/constants";
import { boughtOrPendingCoins, coinsToToman, getManualInstructions, getPaymentDriver, type CoinOrderStatus } from "@/lib/coins";
import { getPrizePoolCached } from "@/lib/prize-pool";
import { formatMillion } from "@/lib/prizes";
import { PageHeader, Container, Stat, Alert, Empty } from "@/components/ui";
import { fa, coins, jdatetime, toEnDigits } from "@/lib/persian";
import { BuyCoinsForm } from "./BuyCoinsForm";
import { cancelOrder } from "./actions";

export const metadata = { title: "خرید سکه" };

const STATUS: Record<CoinOrderStatus, { label: string; chip: string }> = {
  PENDING: { label: "در انتظار پرداخت", chip: "chip-gold" },
  PAID: { label: "پرداخت‌شده", chip: "chip-ok" },
  FAILED: { label: "ناموفق", chip: "chip-red" },
  CANCELED: { label: "لغوشده", chip: "chip-navy" },
};

export default async function CoinsPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; failed?: string; order?: string; canceled?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const driver = getPaymentDriver();

  const [{ phase }, maxPerUser, bought, pool, orders, manualText] = await Promise.all([
    getPhase(),
    getSettingInt("max_bought_coins_per_user", DEFAULTS.maxBoughtCoinsPerUser),
    boughtOrPendingCoins(user.id),
    getPrizePoolCached(),
    prisma.coinOrder.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    driver.online ? Promise.resolve("") : getManualInstructions(),
  ]);
  const room = Math.max(0, maxPerUser - bought.paid - bought.pending);
  const closed = phase === "CLOSED";

  // پیام‌های بازگشت از درگاه/لغو. متن خطا از URL خوانده نمی‌شود (جلوی پیام جعلی در صفحهٔ پرداخت)؛
  // توضیح خطا از یادداشت همان سفارش خودِ کاربر می‌آید.
  const paidCoins = Number.parseInt(toEnDigits(String(sp.paid ?? "")), 10);
  const failedOrder = sp.failed ? orders.find((o) => o.id === sp.order) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="کیف سکه"
        title="خرید سکه"
        desc={`هر سکه ${fa(COIN_PRICE_TOMAN)} تومان است. با سکه از ایده‌ها حمایت می‌کنی، محصول می‌خری، در حراج شرکت می‌کنی و جایگاه تبلیغاتی می‌خری.`}
        action={
          <div className="flex flex-wrap gap-3">
            <Stat label="موجودی سکه" value={coins(user.buyWallet)} tone="gold" />
            <Link href="/wallet" className="btn-ghost self-center">
              کیف سکه و تراکنش‌ها
            </Link>
          </div>
        }
      />
      <Container className="max-w-3xl space-y-6">
        {Number.isFinite(paidCoins) && paidCoins > 0 && (
          <Alert kind="ok">پرداخت موفق بود و {coins(paidCoins)} به کیفت اضافه شد. 🎉</Alert>
        )}
        {sp.failed && (
          <Alert kind="error">
            پرداخت انجام نشد{failedOrder?.note ? `: ${failedOrder.note}` : "."} سکه‌ای اضافه نشد. اگر مبلغی از حسابت کم شده،
            معمولاً تا ۷۲ ساعت به حسابت برمی‌گردد؛ وگرنه به برگزارکننده خبر بده.
          </Alert>
        )}
        {sp.canceled && <Alert kind="info">سفارش لغو شد.</Alert>}

        <div className="card p-6 anim-rise space-y-2 border-amber-200 bg-amber-50">
          <h2 className="text-lg font-black text-brand-navy">💰 همهٔ پولِ خرید سکه به صندوق جایزه می‌رود</h2>
          <p className="text-sm text-brand-slate leading-7">
            هر تومانی که برای خرید سکه می‌پردازی، کامل به صندوق جایزه اضافه می‌شود و بین پروژه‌های برنده تقسیم می‌شود.
          </p>
          <p className="text-sm text-brand-navy">
            صندوق جایزه الان: <b className="fa-num">{fa(Number(formatMillion(pool.totalMillion)))} میلیون تومان</b>
            <span className="text-brand-slate fa-num">
              {" "}
              (پایهٔ {fa(Number(formatMillion(pool.baseMillion)))} میلیون + {fa(Number(formatMillion(pool.extraMillion)))} میلیون از خرید سکه)
            </span>
          </p>
        </div>

        <section className="card p-6 anim-rise space-y-4" aria-labelledby="buy-title">
          <h2 id="buy-title" className="text-lg font-black text-brand-navy">
            خرید سکه
          </h2>
          <p className="text-sm text-brand-slate leading-7">
            سقف خرید هر نفر در کل بازی {coins(maxPerUser)} است؛ تا الان {coins(bought.paid)} خریده‌ای
            {bought.pending > 0 ? ` و ${coins(bought.pending)} در انتظار پرداخت داری` : ""}.{" "}
            {room > 0 ? `می‌توانی تا ${coins(room)} دیگر بخری.` : ""}
          </p>
          {driver.name === "fake" && (
            <Alert kind="info">🧪 درگاه پرداخت آزمایشی فعال است؛ پولی جابه‌جا نمی‌شود.</Alert>
          )}
          {closed ? (
            <Alert kind="info">بازی تمام شده و خرید سکه بسته است.</Alert>
          ) : room < DEFAULTS.minCoinPurchase ? (
            <Alert kind="info">
              {bought.pending > 0
                ? "به سقف خرید رسیده‌ای؛ اگر سفارشی در انتظار داری که نمی‌خواهی بپردازی، آن را از فهرست پایین لغو کن."
                : "به سقف خرید سکه رسیده‌ای."}
            </Alert>
          ) : (
            <BuyCoinsForm room={room} min={DEFAULTS.minCoinPurchase} manual={!driver.online} />
          )}
        </section>

        {!driver.online && !closed && (
          <section className="card p-6 anim-rise space-y-3" aria-labelledby="manual-title">
            <h2 id="manual-title" className="text-lg font-black text-brand-navy">
              راهنمای پرداخت
            </h2>
            <p className="text-sm text-brand-navy leading-7 whitespace-pre-line break-words">{manualText}</p>
            <p className="text-xs text-brand-slate leading-6">
              پرداخت فعلاً بدون درگاه آنلاین است: سفارش را ثبت کن و مبلغ را طبق همین راهنما بپرداز. برگزارکننده پس از دیدن
              پرداخت، سفارشت را تأیید می‌کند و سکه‌ها خودکار به کیفت اضافه می‌شوند.
            </p>
          </section>
        )}

        <section aria-labelledby="orders-title">
          <h2 id="orders-title" className="text-lg font-black text-brand-navy mb-3">
            سفارش‌های من
          </h2>
          {orders.length === 0 ? (
            <Empty title="هنوز سفارشی ثبت نکرده‌ای" />
          ) : (
            <ul className="card divide-y divide-brand-mist anim-rise">
              {orders.map((o) => {
                const status = STATUS[o.status as CoinOrderStatus] ?? { label: o.status, chip: "chip-navy" };
                const pendingLabel = o.status === "PENDING" && o.gateway === "manual" ? "در انتظار تأیید برگزارکننده" : status.label;
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-[10rem]">
                      <div className="font-black text-brand-navy fa-num">
                        {coins(o.coins)} · {fa(coinsToToman(o.coins))} تومان
                      </div>
                      <div className="text-xs text-brand-slate">
                        {jdatetime(o.createdAt)}
                        {o.refId && o.status === "PAID" ? (
                          <>
                            {" "}
                            · کد پیگیری: <span dir="ltr">{o.refId}</span>
                          </>
                        ) : null}
                      </div>
                      {o.note && o.status !== "PAID" && <div className="text-xs text-brand-slate mt-1 break-words">{o.note}</div>}
                    </div>
                    <span className={status.chip}>{pendingLabel}</span>
                    {o.status === "PENDING" && (
                      <form action={cancelOrder}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <button type="submit" className="btn-ghost text-xs">
                          لغو سفارش
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </Container>
    </>
  );
}
