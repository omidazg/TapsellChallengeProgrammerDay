import type { Prisma } from "@prisma/client";

/**
 * سکه‌های رزروشدهٔ کیف خرید یک کاربر.
 *
 * مدل رزرو: سکه‌های کاربر فقط تا زمانی رزرو است که او بالاترین پیشنهاددهندهٔ یک حراج
 * *زنده* باشد (هم‌زمان فقط یک حراج زنده است). با شکسته‌شدن پیشنهادش رزرو آزاد می‌شود و
 * بالا بردن پیشنهاد خودش، رزرو قبلی خودش را جایگزین می‌کند (پس حراج جاری با excludeAuctionId کنار گذاشته می‌شود).
 *
 * در فایل جدا (نه auction.ts) است تا market.ts بدون کشیدن کل وابستگی‌های حراج از آن استفاده کند.
 */
export async function reservedBuyCoins(
  tx: Prisma.TransactionClient,
  userId: string,
  excludeAuctionId?: string
): Promise<number> {
  const live = await tx.auction.findMany({
    where: { status: "LIVE", ...(excludeAuctionId ? { id: { not: excludeAuctionId } } : {}) },
    select: { id: true },
  });
  let reserved = 0;
  for (const a of live) {
    const top = await tx.bid.findFirst({
      where: { auctionId: a.id },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
      select: { userId: true, amount: true },
    });
    if (top && top.userId === userId) reserved += top.amount;
  }
  return reserved;
}
