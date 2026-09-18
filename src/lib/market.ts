import { prisma } from "./db";
import { coverUrl, parseImages } from "./product";
// اعتبارسنجی خرید مستقیماً از موتور اقتصاد می‌آید تا یک منبع حقیقت واحد بماند.
export { validatePurchase } from "./economy/engine";

export type MarketSort = "all" | "top" | "popular" | "cheap";

export type MarketCard = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  cover: string;
  teamName: string;
  teamLogoSeed: string;
  teamId: string;
  price: number;
  sold: number;
  hearts: number;
  /** آیا بازدیدکننده به سقف مجاز خرید از این محصول رسیده است (در نبود viewer همیشه false) */
  limitReached: boolean;
};

/** فهرست محصولات بازار برای گرید اصلی، با مرتب‌سازی؛ با دادن viewer، سقف خریدِ او هم مشخص می‌شود */
export async function getMarketProducts(
  sort: MarketSort = "all",
  viewer?: { userId: string; maxPerTarget: number }
): Promise<MarketCard[]> {
  // به‌جای include کردن همهٔ ردیف‌های Purchase (که با رشد بازار سنگین می‌شود)، فقط جمع هر
  // محصول و — در صورت وجود viewer — جمع خودِ او از یک کوئری تجمیعی خوانده می‌شود.
  const [products, soldGroups, viewerSpentGroups] = await Promise.all([
    prisma.product.findMany({
      where: { submittedAt: { not: null } },
      include: {
        team: { select: { id: true, name: true, slug: true, logoSeed: true } },
        _count: { select: { hearts: true } },
      },
    }),
    prisma.purchase.groupBy({ by: ["productId"], _sum: { amount: true } }),
    viewer
      ? prisma.purchase.groupBy({ by: ["productId"], where: { userId: viewer.userId }, _sum: { amount: true } })
      : Promise.resolve([]),
  ]);

  const soldByProduct = new Map(soldGroups.map((g) => [g.productId, g._sum.amount ?? 0]));
  const viewerSpentByProduct = new Map(viewerSpentGroups.map((g) => [g.productId, g._sum.amount ?? 0]));

  const cards: MarketCard[] = products.map((p) => {
    const viewerSpent = viewer ? viewerSpentByProduct.get(p.id) ?? 0 : 0;
    return {
      id: p.id,
      slug: p.team.slug,
      name: p.name,
      tagline: p.tagline,
      cover: coverUrl(parseImages(p.images), p.team.slug),
      teamName: p.team.name,
      teamLogoSeed: p.team.logoSeed,
      teamId: p.team.id,
      price: p.price,
      sold: soldByProduct.get(p.id) ?? 0,
      hearts: p._count.hearts,
      limitReached: viewer ? viewerSpent >= viewer.maxPerTarget : false,
    };
  });

  switch (sort) {
    case "top":
      return cards.sort((a, b) => b.sold - a.sold);
    case "popular":
      return cards.sort((a, b) => b.hearts - a.hearts);
    case "cheap":
      return cards.sort((a, b) => a.price - b.price);
    default:
      return cards.sort((a, b) => b.sold - a.sold);
  }
}

export type SalesSummary = { sold: number; buyersCount: number; heartsCount: number };

/** جمع فروش، تعداد خریداران یکتا و تعداد قلب‌های یک محصول */
export async function salesSummary(productId: string): Promise<SalesSummary> {
  const [purchases, hearts] = await Promise.all([
    prisma.purchase.findMany({ where: { productId }, select: { amount: true, userId: true } }),
    prisma.heart.count({ where: { productId } }),
  ]);
  return {
    sold: purchases.reduce((a, p) => a + p.amount, 0),
    buyersCount: new Set(purchases.map((p) => p.userId)).size,
    heartsCount: hearts,
  };
}

/** مجموع سکه‌ای که یک کاربر تاکنون روی یک محصول خرج کرده */
export async function userSpentOn(userId: string, productId: string): Promise<number> {
  const agg = await prisma.purchase.aggregate({
    where: { userId, productId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

export type Buyer = { userId: string; nickname: string; avatarSeed: string; amount: number };

/** فهرست یکتای خریداران یک محصول (برای نمایش آواتار) */
export async function getBuyers(productId: string): Promise<Buyer[]> {
  const purchases = await prisma.purchase.findMany({
    where: { productId },
    include: { user: { select: { id: true, nickname: true, avatarSeed: true } } },
    orderBy: { createdAt: "desc" },
  });
  const byUser = new Map<string, Buyer>();
  for (const p of purchases) {
    const existing = byUser.get(p.userId);
    if (existing) existing.amount += p.amount;
    else byUser.set(p.userId, { userId: p.userId, nickname: p.user.nickname, avatarSeed: p.user.avatarSeed, amount: p.amount });
  }
  return [...byUser.values()];
}

/** آیا کاربر حداقل یک خرید از این محصول دارد (شرط لازم برای قلب‌دادن) */
export async function hasPurchased(userId: string, productId: string): Promise<boolean> {
  const count = await prisma.purchase.count({ where: { userId, productId } });
  return count > 0;
}

/** آیا کاربر قبلاً به این محصول قلب داده */
export async function hasHearted(userId: string, productId: string): Promise<boolean> {
  const heart = await prisma.heart.findUnique({ where: { productId_userId: { productId, userId } } });
  return !!heart;
}

export type AdSlotWinner = {
  kind: "BANNER" | "FEATURED";
  teamId: string;
  teamName: string;
  teamLogoSeed: string;
  productSlug: string;
  productName: string;
  cover: string;
};

/** برندگان جایگاه تبلیغاتی ساعت جاری (فقط خواندن؛ حراج آن در حوزهٔ ایجنت دیگر است) */
export async function getCurrentAdSlotWinners(): Promise<AdSlotWinner[]> {
  const now = new Date();
  const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const slots = await prisma.adSlot.findMany({
    where: { hourStart, kind: { in: ["BANNER", "FEATURED"] }, winnerTeamId: { not: null } },
  });
  const winners: AdSlotWinner[] = [];
  for (const slot of slots) {
    if (!slot.winnerTeamId) continue;
    const team = await prisma.team.findUnique({
      where: { id: slot.winnerTeamId },
      include: { product: true },
    });
    if (!team || !team.product) continue;
    winners.push({
      kind: slot.kind as "BANNER" | "FEATURED",
      teamId: team.id,
      teamName: team.name,
      teamLogoSeed: team.logoSeed,
      productSlug: team.slug,
      productName: team.product.name,
      cover: coverUrl(parseImages(team.product.images), team.slug),
    });
  }
  return winners;
}

export type TickerEntry = { buyer: string; team: string; product: string; amount: number; at: string };

/** آخرین خریدها برای نوار فروش زنده + حجم کل بازار */
export async function getTicker(limit = 20): Promise<{ recent: TickerEntry[]; volume: number; count: number }> {
  const [recent, agg] = await Promise.all([
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { nickname: true } },
        product: { select: { name: true, team: { select: { name: true } } } },
      },
    }),
    prisma.purchase.aggregate({ _sum: { amount: true }, _count: true }),
  ]);
  return {
    recent: recent.map((p) => ({
      buyer: p.user.nickname,
      team: p.product.team.name,
      product: p.product.name,
      amount: p.amount,
      at: p.createdAt.toISOString(),
    })),
    volume: agg._sum.amount ?? 0,
    count: agg._count,
  };
}
