/**
 * صندوق جایزه (فقط سرور): پایهٔ ثابت + کل مبلغ سفارش‌های پرداخت‌شدهٔ سکه.
 * محاسبه‌های خالص و مقادیر قابل‌استفاده در کلاینت در ./prizes.ts هستند.
 */
import { prisma } from "./db";
import { cached } from "./ttl-cache";
import { PRIZE_POOL_CACHE_PREFIX } from "./coins";
import { prizePoolFrom, type PrizePool } from "./prizes";

/** جمع مبلغ سکه‌های فروخته‌شده (تومان) و تعداد سکه‌ها */
export async function coinSales(): Promise<{ toman: number; coins: number; orders: number }> {
  const agg = await prisma.coinOrder.aggregate({
    where: { status: "PAID" },
    _sum: { amountRial: true, coins: true },
    _count: true,
  });
  return { toman: (agg._sum.amountRial ?? 0) / 10, coins: agg._sum.coins ?? 0, orders: agg._count };
}

export async function getPrizePool(): Promise<PrizePool> {
  const sales = await coinSales();
  return prizePoolFrom(sales.toman);
}

/** نسخهٔ کش‌شده برای صفحات عمومی؛ پرداخت تازه با invalidate(PRIZE_POOL_CACHE_PREFIX) آن را پاک می‌کند. */
export function getPrizePoolCached(): Promise<PrizePool> {
  return cached(PRIZE_POOL_CACHE_PREFIX, 30_000, getPrizePool);
}
