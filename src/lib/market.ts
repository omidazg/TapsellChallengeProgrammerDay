import { prisma } from "./db";
import { coverUrl, parseImages } from "./product";
import { getSettingInt } from "./phase";
import { moduleGate } from "./module-state";
import { DEFAULTS } from "./constants";
import { reservedBuyCoins } from "./reservations";
import { cached, invalidate } from "./ttl-cache";
// اعتبارسنجی خرید مستقیماً از موتور اقتصاد می‌آید تا یک منبع حقیقت واحد بماند.
import { validatePurchase } from "./economy/engine";
export { validatePurchase } from "./economy/engine";

export type MarketSort = "all" | "top" | "popular" | "cheap";

export type MarketCard = {
  id: string;
  slug: string;
  trackId: string;
  name: string;
  tagline: string;
  cover: string;
  teamName: string;
  teamLogoSeed: string;
  teamId: string;
  price: number;
  sold: number;
  hearts: number;
  /** وضعیت انتشار روی بازار استودیو (LIVE یعنی منتشر شده) */
  live: boolean;
  /** بازدیدکننده قبلاً از این محصول خریده است (در نبود viewer همیشه false) */
  bought: boolean;
};

/** پیشوند کلید کش بازار؛ هر خرید (و برد حراج) با invalidate("market:") آن را پاک می‌کند. */
export const MARKET_CACHE_PREFIX = "market:";
/** TTL کوتاه کش بازار: صفحهٔ بازار در روز بازار پربازدید است و جمع فروش را روی هر بازدید دوباره نمی‌سازیم. */
const MARKET_CACHE_TTL_MS = 3_000;

/** کارت‌های پایهٔ بازار (بدون دادهٔ مخصوص بازدیدکننده) — مشترک بین همه، با کش کوتاه. */
function getBaseMarketCards(): Promise<Omit<MarketCard, "bought">[]> {
  return cached(`${MARKET_CACHE_PREFIX}cards`, MARKET_CACHE_TTL_MS, async () => {
    // به‌جای include کردن همهٔ ردیف‌های Purchase (که با رشد بازار سنگین می‌شود)، فقط جمع هر محصول
    // از یک کوئری تجمیعی خوانده می‌شود.
    const [products, soldGroups] = await Promise.all([
      prisma.product.findMany({
        where: { submittedAt: { not: null } },
        include: {
          team: { select: { id: true, name: true, slug: true, logoSeed: true } },
          _count: { select: { hearts: true } },
        },
      }),
      prisma.purchase.groupBy({ by: ["productId"], _sum: { amount: true } }),
    ]);
    const soldByProduct = new Map(soldGroups.map((g) => [g.productId, g._sum.amount ?? 0]));
    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      trackId: p.trackId,
      name: p.name,
      tagline: p.tagline,
      cover: coverUrl(parseImages(p.images), p.team.slug),
      teamName: p.team.name,
      teamLogoSeed: p.team.logoSeed,
      teamId: p.team.id,
      price: p.price,
      sold: soldByProduct.get(p.id) ?? 0,
      hearts: p._count.hearts,
      live: p.liveStatus === "LIVE",
    }));
  });
}

/** محصولاتی که بازدیدکننده از آن‌ها خریده (کش کوتاه جدا برای هر کاربر). */
function getViewerBoughtIds(userId: string): Promise<Set<string>> {
  return cached(`${MARKET_CACHE_PREFIX}bought:${userId}`, MARKET_CACHE_TTL_MS, async () => {
    const groups = await prisma.purchase.groupBy({ by: ["productId"], where: { userId }, _sum: { amount: true } });
    return new Set(groups.filter((g) => (g._sum.amount ?? 0) > 0).map((g) => g.productId));
  });
}

/** فهرست محصولات بازار برای گرید اصلی، با مرتب‌سازی؛ با دادن viewer، خریدهای قبلیِ او هم مشخص می‌شود */
export async function getMarketProducts(
  sort: MarketSort = "all",
  viewer?: { userId: string }
): Promise<MarketCard[]> {
  const [base, boughtIds] = await Promise.all([
    getBaseMarketCards(),
    viewer ? getViewerBoughtIds(viewer.userId) : Promise.resolve(new Set<string>()),
  ]);
  // کپی تازه از کارت‌های کش‌شده (مرتب‌سازی زیر درجا است و نباید کش مشترک را تغییر دهد).
  const cards: MarketCard[] = base.map((c) => ({ ...c, bought: boughtIds.has(c.id) }));

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

/**
 * سکه‌های قابل‌خرج برای نمایش در UI: موجودی منهای سکه‌های رزروشده برای پیشتازی در حراج زنده
 * (همان مبنای purchaseProduct). اعتبارسنجی نهایی در تراکنش خرید انجام می‌شود.
 */
export async function spendableBuyCoins(userId: string, buyWallet: number): Promise<number> {
  const reserved = await reservedBuyCoins(prisma, userId);
  return Math.max(0, buyWallet - reserved);
}

/** خطای قابل نمایش به کاربر (متن فارسی)؛ در purchaseProduct به شکل نتیجهٔ ok:false برگردانده می‌شود. */
class UserFacingError extends Error {}

export type PurchaseResult =
  | { ok: true; purchaseId: string; amount: number }
  | { ok: false; error: string };

/**
 * هستهٔ خرید یک محصول در بازار — بدون وابستگی به cookies/session (userId مستقیم گرفته می‌شود)،
 * تا هم از server action و هم از دود-تست قابل فراخوانی باشد.
 *
 * هر خرید به قیمت کامل محصول است و سقفی روی تعداد خرید نیست؛ اثر هر نفر روی امتیاز «حمایت مردمی»
 * در موتور امتیاز (support_cap و تأمین مالی درجه‌دو) محدود می‌شود. سکه‌های رزروشده برای پیشتازی
 * در حراج زنده خرج‌پذیر نیستند (حراج و خرید یک بخش‌اند).
 */
export async function purchaseProduct(userId: string, productId: string): Promise<PurchaseResult> {
  const buyer = await prisma.user.findUnique({ where: { id: userId }, select: { teamId: true } });
  const gate = await moduleGate("market", buyer?.teamId);
  if (gate) return { ok: false, error: gate };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.submittedAt) return { ok: false, error: "این محصول در دسترس نیست" };

  try {
    return await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const isOwnTeam = !!freshUser.teamId && freshUser.teamId === product.teamId;
      const spendable = freshUser.buyWallet - (await reservedBuyCoins(tx, userId));

      const validation = validatePurchase({ amount: product.price, walletLeft: spendable, isOwnTeam });
      if (!validation.ok) throw new UserFacingError(validation.error);

      const purchase = await tx.purchase.create({
        data: { productId, userId, amount: product.price, discount: 0 },
      });
      const charged = await tx.user.updateMany({
        where: { id: userId, buyWallet: { gte: product.price } },
        data: { buyWallet: { decrement: product.price } },
      });
      if (charged.count === 0) throw new UserFacingError("سکهٔ کافی نداری");
      await tx.ledgerEntry.create({
        data: { userId, teamId: product.teamId, wallet: "BUY", delta: -product.price, reason: "PURCHASE", refId: purchase.id },
      });
      return { ok: true as const, purchaseId: purchase.id, amount: purchase.amount };
    });
  } catch (e) {
    if (e instanceof UserFacingError) return { ok: false, error: e.message };
    throw e;
  } finally {
    invalidate("scores:");
    invalidate(MARKET_CACHE_PREFIX);
  }
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

/**
 * صاحبان جایگاه تبلیغاتی بازهٔ جاری (فقط خواندن): بازهٔ هر جایگاه از hourStart به طول adslot_hours است.
 * محصول و تیم در همان کوئری (بدون N+1) خوانده می‌شوند.
 */
export async function getCurrentAdSlotWinners(now: Date = new Date()): Promise<AdSlotWinner[]> {
  const hours = await getSettingInt("adslot_hours", DEFAULTS.adslotHours);
  const durationMs = Math.max(1, hours) * 60 * 60 * 1000;
  const slots = await prisma.adSlot.findMany({
    where: {
      kind: { in: ["BANNER", "FEATURED"] },
      winnerProductId: { not: null },
      status: { not: "REFUNDED" },
      hourStart: { lte: now, gt: new Date(now.getTime() - durationMs) },
    },
    orderBy: { hourStart: "desc" },
  });
  if (slots.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(slots.map((s) => s.winnerProductId!))] } },
    select: { id: true, name: true, slug: true, images: true, submittedAt: true, team: { select: { id: true, name: true, logoSeed: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const winners: AdSlotWinner[] = [];
  const seenKinds = new Set<string>();
  for (const slot of slots) {
    // در هر نوع، جدیدترین جایگاه فعال (در صورت هم‌پوشانی بازه‌ها) برنده است.
    if (seenKinds.has(slot.kind)) continue;
    const p = byId.get(slot.winnerProductId!);
    // محصول ثبت‌نهایی‌نشده در بازار نمایش داده نمی‌شود (صفحه‌اش هم 404 است)، پس تبلیغش هم نه.
    if (!p || !p.submittedAt) continue;
    seenKinds.add(slot.kind);
    winners.push({
      kind: slot.kind as "BANNER" | "FEATURED",
      teamId: p.team.id,
      teamName: p.team.name,
      teamLogoSeed: p.team.logoSeed,
      productSlug: p.slug,
      productName: p.name,
      cover: coverUrl(parseImages(p.images), p.slug),
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
