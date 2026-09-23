/**
 * فید زندهٔ رویدادهای عمومی — بدون جدول جدید؛ از جدول‌های موجود ساخته می‌شود.
 * فقط دادهٔ از قبل عمومی (نام تیم، نام‌مستعار کاربر، اسم محصول) را نشان می‌دهد؛
 * هیچ ایمیل، موجودی کیف یا مبلغ سرمایه‌گذاری (که در InvestorList پنهان است) درز نمی‌کند.
 */
import { prisma } from "./db";
import { PHASE_LABEL, PHASES, type Phase } from "./phases";
import { cached } from "./ttl-cache";

export type FeedEvent = {
  id: string;
  emoji: string;
  text: string;
  at: string; // ISO
};

const FEED_CACHE_KEY = "feed:latest";
const FEED_CACHE_TTL_MS = 5_000;
const FEED_LIMIT = 20;
/** از هر منبع کمی بیشتر از سقف نهایی می‌خوانیم تا بعد از ادغام و برش، ۲۰‌تای واقعاً جدید بمانند. */
const PER_SOURCE_LIMIT = FEED_LIMIT;

/** ساخت فهرست رویدادهای عمومی از جدول‌های موجود (بدون تغییر اسکیما). */
export async function buildFeed(limit = FEED_LIMIT): Promise<FeedEvent[]> {
  const [teams, ideas, investments, purchases, wonAuctions, phaseChanges] = await Promise.all([
    prisma.team.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.idea.findMany({
      where: { submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: { id: true, submittedAt: true, team: { select: { name: true } } },
    }),
    prisma.investment.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: { id: true, createdAt: true, idea: { select: { team: { select: { name: true } } } } },
    }),
    prisma.purchase.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        createdAt: true,
        amount: true,
        user: { select: { nickname: true } },
        product: { select: { name: true, team: { select: { name: true } } } },
      },
    }),
    prisma.auction.findMany({
      where: { winnerId: { not: null } },
      orderBy: { endsAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: {
        id: true,
        endsAt: true,
        finalPrice: true,
        product: { select: { name: true } },
        winnerId: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { action: "phase.set" },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_LIMIT,
      select: { id: true, target: true, createdAt: true },
    }),
  ]);

  // برندهٔ حراج فقط winnerId اسکالر دارد؛ نیکنیم‌ها را جدا می‌خوانیم (بدون ایمیل/کیف پول).
  const winnerIds = [...new Set(wonAuctions.map((a) => a.winnerId).filter((id): id is string => !!id))];
  const winners = winnerIds.length
    ? await prisma.user.findMany({ where: { id: { in: winnerIds } }, select: { id: true, nickname: true } })
    : [];
  const winnerNickname = new Map(winners.map((w) => [w.id, w.nickname]));

  const events: FeedEvent[] = [];

  for (const t of teams) {
    events.push({ id: `team:${t.id}`, emoji: "🏗️", text: `تیم «${t.name}» ساخته شد`, at: t.createdAt.toISOString() });
  }

  for (const i of ideas) {
    if (!i.submittedAt) continue;
    events.push({ id: `idea:${i.id}`, emoji: "💡", text: `تیم «${i.team.name}» ایده‌اش را ثبت کرد`, at: i.submittedAt.toISOString() });
  }

  for (const inv of investments) {
    if (!inv.idea) continue;
    // مبلغ سرمایه‌گذاری در جای دیگر (InvestorList) هم پیش از افشا پنهان است؛ اینجا هم فقط خبر بدون رقم می‌آید.
    events.push({
      id: `invest:${inv.id}`,
      emoji: "🌱",
      text: `تیم «${inv.idea.team.name}» سرمایهٔ تازه گرفت`,
      at: inv.createdAt.toISOString(),
    });
  }

  for (const p of purchases) {
    // مبلغ خرید همین حالا در نوار فروش زنده (SalesTicker) عمومی است؛ اینجا هم نشان دادنش نشتی نیست.
    events.push({
      id: `purchase:${p.id}`,
      emoji: "🛍️",
      text: `${p.user.nickname} از تیم «${p.product.team.name}» محصول «${p.product.name}» را خرید`,
      at: p.createdAt.toISOString(),
    });
  }

  for (const a of wonAuctions) {
    if (!a.winnerId || !a.endsAt) continue;
    const nickname = winnerNickname.get(a.winnerId) ?? "یک بازیکن";
    events.push({
      id: `auction:${a.id}`,
      emoji: "🔨",
      text: `${nickname} حراج «${a.product.name}» را برد`,
      at: a.endsAt.toISOString(),
    });
  }

  for (const c of phaseChanges) {
    const phase = (PHASES as readonly string[]).includes(c.target) ? (c.target as Phase) : null;
    if (!phase) continue;
    events.push({
      id: `phase:${c.id}`,
      emoji: "🚦",
      text: `فاز بازی به «${PHASE_LABEL[phase]}» تغییر کرد`,
      at: c.createdAt.toISOString(),
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, limit);
}

/** نسخهٔ کش‌شدهٔ ۵ ثانیه‌ای برای مسیر عمومی /api/feed و /api/hall. */
export function getFeedCached(): Promise<FeedEvent[]> {
  return cached(FEED_CACHE_KEY, FEED_CACHE_TTL_MS, () => buildFeed(FEED_LIMIT));
}
