import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { coinSales, getPrizePool } from "@/lib/prize-pool";
import { formatMillion } from "@/lib/prizes";
import { getManualInstructions, getPaymentDriver, MANUAL_INSTRUCTIONS_KEY, type CoinOrderStatus } from "@/lib/coins";
import { COIN_PRICE_TOMAN, DEFAULTS } from "@/lib/constants";
import { getSettingInt } from "@/lib/phase";
import { PageHeader, Container, Stat, Alert, Empty } from "@/components/ui";
import { fa, jdatetime } from "@/lib/persian";
import { OrderActions, ManualInstructionsForm } from "./CoinForms";

export const metadata = { title: "سکه و پرداخت · پنل برگزارکننده" };

const PAGE_LIMIT = 200;

const STATUS_LABEL: Record<CoinOrderStatus, string> = {
  PENDING: "در انتظار پرداخت",
  PAID: "پرداخت‌شده",
  FAILED: "ناموفق / ردشده",
  CANCELED: "لغو کاربر",
};
const STATUS_CHIP: Record<CoinOrderStatus, string> = {
  PENDING: "chip-gold",
  PAID: "chip-ok",
  FAILED: "chip-red",
  CANCELED: "chip-navy",
};

const FILTERS = [
  { value: "all", label: "همه" },
  { value: "PENDING", label: STATUS_LABEL.PENDING },
  { value: "PAID", label: STATUS_LABEL.PAID },
  { value: "FAILED", label: STATUS_LABEL.FAILED },
  { value: "CANCELED", label: STATUS_LABEL.CANCELED },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const DRIVER_LABEL: Record<string, string> = {
  fake: "درگاه آزمایشی (fake)",
  manual: "پرداخت دستی (manual)",
};

export default async function AdminCoinsPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const rawStatus = typeof sp.status === "string" ? sp.status : "";
  const filter: Filter = FILTERS.some((f) => f.value === rawStatus) ? (rawStatus as Filter) : "all";
  const where: Prisma.CoinOrderWhereInput = filter === "all" ? {} : { status: filter };

  const driver = getPaymentDriver();
  const [orders, groups, sales, pool, instructions, customInstructions, maxPerUser] = await Promise.all([
    prisma.coinOrder.findMany({
      where,
      include: { user: { select: { nickname: true, email: true, phone: true } } },
      // در انتظارها اول، بعد جدیدترین‌ها
      orderBy: { createdAt: filter === "PENDING" ? "asc" : "desc" },
      take: PAGE_LIMIT,
    }),
    prisma.coinOrder.groupBy({ by: ["status"], _count: true, _sum: { coins: true } }),
    coinSales(),
    getPrizePool(),
    getManualInstructions(),
    prisma.setting.findUnique({ where: { key: MANUAL_INSTRUCTIONS_KEY } }),
    getSettingInt("max_bought_coins_per_user", DEFAULTS.maxBoughtCoinsPerUser),
  ]);

  const countOf = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const pendingCoins = groups.find((g) => g.status === "PENDING")?._sum.coins ?? 0;
  const totalCount = groups.reduce((a, g) => a + g._count, 0);
  const filterCount = (f: Filter) => (f === "all" ? totalCount : countOf(f));

  return (
    <>
      <PageHeader
        eyebrow="پنل برگزارکننده"
        title="سکه و پرداخت"
        desc={`فروش سکه (هر سکه ${fa(COIN_PRICE_TOMAN)} تومان)، تأیید پرداخت‌ها و راهنمای پرداخت دستی. همهٔ مبلغ فروش به صندوق جایزه اضافه می‌شود.`}
      />
      <Container className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
          <Stat label="سکهٔ فروخته‌شده" value={fa(sales.coins)} hint={`${fa(sales.orders)} سفارش پرداخت‌شده`} tone="cyan" />
          <Stat label="مبلغ فروش" value={fa(sales.toman)} hint="تومان" tone="navy" />
          <Stat
            label="صندوق جایزه"
            value={fa(formatMillion(pool.totalMillion))}
            hint={`میلیون تومان (پایه ${fa(formatMillion(pool.baseMillion))} + ${fa(formatMillion(pool.extraMillion))} از فروش سکه)`}
            tone="gold"
          />
          <Stat label="در انتظار پرداخت" value={fa(countOf("PENDING"))} hint={`${fa(pendingCoins)} سکه`} tone="red" />
        </div>

        <section className="card p-4 sm:p-6 space-y-3 anim-rise" aria-labelledby="driver-title">
          <h2 id="driver-title" className="text-lg font-black text-brand-navy">درگاه پرداخت</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-brand-slate">درایور فعال:</span>
            <span className={driver.name === "fake" ? "chip-red" : "chip-navy"}>{DRIVER_LABEL[driver.name] ?? driver.name}</span>
            <span className="text-xs text-brand-slate">
              سقف خرید هر نفر: {fa(maxPerUser)} سکه · حداقل هر سفارش: {fa(DEFAULTS.minCoinPurchase)} سکه
            </span>
          </div>
          {driver.name === "fake" ? (
            <Alert kind="error">
              ⚠ درگاه آزمایشی فعال است: خریدار فقط دکمهٔ «پرداخت موفق» را می‌زند و پولی دریافت نمی‌شود، ولی سکه به کیفش و مبلغ به
              صندوق جایزه اضافه می‌شود. پیش از روز بازی متغیر محیطی <code dir="ltr">PAYMENT_DRIVER</code> را روی درگاه واقعی یا{" "}
              <code dir="ltr">manual</code> بگذار.
            </Alert>
          ) : driver.online ? (
            <Alert kind="info">پرداخت آنلاین است؛ سفارش «در انتظار» یعنی خریدار هنوز از درگاه برنگشته است.</Alert>
          ) : (
            <Alert kind="info">
              پرداخت دستی: هر سفارش تا تأیید تو در انتظار می‌ماند. پس از دیدن واریز، «تأیید پرداخت» را بزن تا سکه‌ها به کیف خریدار
              اضافه شود.
            </Alert>
          )}
        </section>

        <section className="card p-4 sm:p-6 anim-rise" aria-labelledby="instructions-title">
          <h2 id="instructions-title" className="sr-only">راهنمای پرداخت دستی</h2>
          <ManualInstructionsForm value={instructions} isDefault={!customInstructions?.value} />
        </section>

        <section className="space-y-3" aria-labelledby="orders-title">
          <h2 id="orders-title" className="text-lg font-black text-brand-navy">سفارش‌های سکه</h2>
          <nav aria-label="فیلتر وضعیت سفارش" className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => {
              const active = f.value === filter;
              return (
                <Link
                  key={f.value}
                  href={f.value === "all" ? "/admin/coins" : `/admin/coins?status=${f.value}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-pill px-4 min-h-10 text-sm font-bold whitespace-nowrap transition ${
                    active ? "bg-brand-navy text-white" : "bg-brand-ice text-brand-navy hover:bg-brand-mist"
                  }`}
                >
                  {f.label}
                  <span className={`fa-num text-xs ${active ? "opacity-80" : "text-brand-slate"}`}>{fa(filterCount(f.value))}</span>
                </Link>
              );
            })}
          </nav>
          {filterCount(filter) > PAGE_LIMIT && (
            <p className="text-xs text-brand-slate">فقط {fa(PAGE_LIMIT)} سفارش {filter === "PENDING" ? "قدیمی‌تر" : "تازه‌تر"} نمایش داده شده است.</p>
          )}

          {orders.length === 0 ? (
            <Empty title="سفارشی پیدا نشد" />
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => {
                const status = (o.status in STATUS_LABEL ? o.status : "FAILED") as CoinOrderStatus;
                return (
                  <li key={o.id} className="card p-4 space-y-3 anim-rise">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="font-bold text-brand-navy break-words">
                          {o.user.nickname} <span className="text-xs font-normal text-brand-slate break-all">{o.user.email}</span>
                        </div>
                        {o.user.phone && <div className="text-xs text-brand-slate" dir="ltr">{o.user.phone}</div>}
                        <div className="text-xs text-brand-slate">
                          {jdatetime(o.createdAt)}
                          {o.paidAt && <> · پرداخت: {jdatetime(o.paidAt)}</>}
                          {" · "}درگاه: <span dir="ltr">{o.gateway}</span>
                          {o.refId && (
                            <>
                              {" · "}کد پیگیری: <span dir="ltr" className="font-mono">{o.refId}</span>
                            </>
                          )}
                        </div>
                        {o.note && <div className="text-xs text-brand-navy break-words">یادداشت: {o.note}</div>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-black text-brand-navy fa-num">🪙 {fa(o.coins)} سکه</span>
                        <span className="text-xs text-brand-slate fa-num">{fa(o.amountRial / 10)} تومان</span>
                        <span className={STATUS_CHIP[status]}>{STATUS_LABEL[status]}</span>
                      </div>
                    </div>
                    {status === "PENDING" && (
                      <OrderActions orderId={o.id} pending coins={o.coins} nickname={o.user.nickname} />
                    )}
                    {(status === "FAILED" || status === "CANCELED") && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs font-bold text-brand-slate min-h-8 flex items-center">
                          وجه این سفارش واقعاً رسیده است؟
                        </summary>
                        <div className="mt-2">
                          <OrderActions orderId={o.id} pending={false} coins={o.coins} nickname={o.user.nickname} />
                        </div>
                      </details>
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
