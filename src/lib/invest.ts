import { prisma } from "./db";
import { validateInvestment } from "./economy/engine";

export { validateInvestment };

/** جمع سرمایه‌گذاری‌شدهٔ یک کاربر روی یک ایدهٔ خاص */
export async function investedByUserOnIdea(userId: string, ideaId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { userId, ideaId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** جمع کل سرمایه‌گذاری‌شدهٔ یک کاربر (برای نمایش در هدر) */
export async function totalInvestedByUser(userId: string): Promise<number> {
  const agg = await prisma.investment.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}
