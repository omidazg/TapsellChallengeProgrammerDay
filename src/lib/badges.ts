/**
 * نشان‌ها (Item 46) — کاملاً محاسبه‌شده از داده‌های موجود، بدون تغییر اسکیما.
 *
 * هر نشان یا برای «یک نفر» (یا چند نفر در صورت تساوی) محاسبه می‌شود، یا برای
 * «مجموعه‌ای از کاربران» (مثل ده نفر اول ثبت‌نامی یا اعضای تیم برتر).
 * توابع خالص (بدون دیتابیس) در پایین فایل هستند و در badges.test.ts پوشش داده می‌شوند.
 *
 * توجه: نشان «بنیان‌گذار» (سازندهٔ تیم) در لیست پیشنهادی حذف شده چون اسکیما
 * سازندهٔ تیم را جداگانه ثبت نمی‌کند (Team بدون ownerId/creatorId است) و افزودنش
 * نیاز به تغییر اسکیما داشت که طبق تسک ممنوع است.
 */
import { prisma } from "./db";
import { cached } from "./ttl-cache";

export type BadgeDef = {
  id: string;
  title: string;
  emoji: string;
  /** توضیح؛ همان متنی که زیر نشانِ قفل‌شده هم نشان داده می‌شود */
  description: string;
};

export const BADGES: BadgeDef[] = [
  { id: "first_investor", title: "اولین سرمایه‌گذار", emoji: "🥇", description: "اولین سرمایه‌گذاریِ کل بازی را ثبت کرد." },
  { id: "team_angel", title: "فرشتهٔ تیم‌ها", emoji: "😇", description: "روی بیشترین تعداد تیم متفاوت سرمایه‌گذاری کرد." },
  { id: "pro_buyer", title: "خریدار حرفه‌ای", emoji: "🛍️", description: "بیشترین تعداد خرید را از بازار انجام داد." },
  { id: "auction_winner", title: "برندهٔ حراج", emoji: "🔨", description: "دست‌کم یک حراج زنده را برد." },
  { id: "early_bird", title: "سحرخیز", emoji: "🌅", description: "جزو ده نفر اولی بود که ثبت‌نام کردند." },
  { id: "heart_hunter", title: "شکارچی قلب", emoji: "💘", description: "بیشترین تعداد قلب را به محصولات داد." },
  { id: "top_sales", title: "فروش برتر", emoji: "📈", description: "عضو تیمی بود که بیشترین فروش کل بازار را داشت." },
];

const BADGE_IDS = BADGES.map((b) => b.id);

// ───────────────────────── توابع خالص (بدون دیتابیس) ─────────────────────────

/** مرتب‌سازی قطعی برای تساوی: userId کوچک‌تر (asc) */
function byUserIdAsc(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type CountRow = { userId: string };

/** کاربر/کاربرانی با بیشترین تعداد رخداد؛ در تساوی همه برگردانده می‌شوند (قطعی) */
export function topByCount(rows: CountRow[]): { userId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.userId, (counts.get(r.userId) ?? 0) + 1);
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;
  if (max === 0) return [];
  return [...counts.entries()]
    .filter(([, c]) => c === max)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => byUserIdAsc(a.userId, b.userId));
}

export type TimedRow = { id: string; userId: string; createdAt: Date | string };

/** اولین رخداد از نظر زمان؛ در تساوی id کوچک‌تر برنده است (قطعی) */
export function earliestUserId(rows: TimedRow[]): string | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted[0].userId;
}

export type TeamInvestRow = { userId: string; teamId: string };

/** کاربر/کاربرانی که روی بیشترین تعداد تیمِ متفاوت سرمایه‌گذاری کرده‌اند */
export function mostDistinctTeamsInvestor(rows: TeamInvestRow[]): { userId: string; count: number }[] {
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.userId)) map.set(r.userId, new Set());
    map.get(r.userId)!.add(r.teamId);
  }
  const counts = [...map.entries()].map(([userId, set]) => ({ userId, count: set.size }));
  let max = 0;
  for (const c of counts) if (c.count > max) max = c.count;
  if (max === 0) return [];
  return counts.filter((c) => c.count === max).sort((a, b) => byUserIdAsc(a.userId, b.userId));
}

export type UserCreatedRow = { id: string; createdAt: Date | string };

/** شناسهٔ n نفر اولِ ثبت‌نامی (پیش‌فرض ۱۰)؛ تساوی زمانی با id شکسته می‌شود */
export function earlyBirdUserIds(users: UserCreatedRow[], n = 10): Set<string> {
  const sorted = [...users].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return new Set(sorted.slice(0, n).map((u) => u.id));
}

export type AuctionWinnerRow = { winnerId: string | null };

/** شناسهٔ کاربرانی که دست‌کم یک حراج را برده‌اند */
export function auctionWinnerIds(auctions: AuctionWinnerRow[]): Set<string> {
  return new Set(auctions.map((a) => a.winnerId).filter((id): id is string => !!id));
}

export type TeamSalesRow = { teamId: string; amount: number };

/** شناسهٔ تیم(های) با بیشترین فروش کل (مجموع مبلغ خریدها)؛ صفر یعنی بدون فروش */
export function topSalesTeamIds(rows: TeamSalesRow[]): Set<string> {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.teamId, (totals.get(r.teamId) ?? 0) + r.amount);
  let max = 0;
  for (const v of totals.values()) if (v > max) max = v;
  if (max <= 0) return new Set();
  return new Set([...totals.entries()].filter(([, v]) => v === max).map(([teamId]) => teamId));
}

// ───────────────────────── محاسبهٔ کامل (با دیتابیس) ─────────────────────────

/** badgeId -> مجموعهٔ userId هایی که آن نشان را دارند */
export type BadgeMap = Map<string, Set<string>>;

async function computeAllBadgesUncached(): Promise<BadgeMap> {
  const [investments, purchaseRows, heartRows, endedAuctions, users, teamMembers] = await Promise.all([
    prisma.investment.findMany({
      select: { id: true, userId: true, createdAt: true, idea: { select: { teamId: true } } },
    }),
    prisma.purchase.findMany({ select: { userId: true, amount: true, product: { select: { teamId: true } } } }),
    prisma.heart.findMany({ select: { userId: true } }),
    prisma.auction.findMany({ where: { status: "ENDED" }, select: { winnerId: true } }),
    prisma.user.findMany({ select: { id: true, createdAt: true } }),
    prisma.user.findMany({ where: { teamId: { not: null } }, select: { id: true, teamId: true } }),
  ]);

  const result: BadgeMap = new Map(BADGE_IDS.map((id) => [id, new Set<string>()]));

  const firstInvestor = earliestUserId(investments.map((i) => ({ id: i.id, userId: i.userId, createdAt: i.createdAt })));
  if (firstInvestor) result.get("first_investor")!.add(firstInvestor);

  const teamAngels = mostDistinctTeamsInvestor(investments.map((i) => ({ userId: i.userId, teamId: i.idea.teamId })));
  for (const w of teamAngels) result.get("team_angel")!.add(w.userId);

  const proBuyers = topByCount(purchaseRows.map((p) => ({ userId: p.userId })));
  for (const w of proBuyers) result.get("pro_buyer")!.add(w.userId);

  for (const id of auctionWinnerIds(endedAuctions)) result.get("auction_winner")!.add(id);

  for (const id of earlyBirdUserIds(users)) result.get("early_bird")!.add(id);

  const heartHunters = topByCount(heartRows.map((h) => ({ userId: h.userId })));
  for (const w of heartHunters) result.get("heart_hunter")!.add(w.userId);

  const salesRows: TeamSalesRow[] = purchaseRows.filter((p) => p.product.teamId).map((p) => ({ teamId: p.product.teamId, amount: p.amount }));
  const topTeams = topSalesTeamIds(salesRows);
  if (topTeams.size > 0) {
    for (const m of teamMembers) if (m.teamId && topTeams.has(m.teamId)) result.get("top_sales")!.add(m.id);
  }

  return result;
}

/** محاسبهٔ نشان همهٔ کاربران با کش ۳۰ ثانیه‌ای (کوئری سنگین است، برای همه یکسان) */
export async function computeAllBadges(): Promise<BadgeMap> {
  return cached("badges:all", 30_000, computeAllBadgesUncached);
}

export type UserBadge = BadgeDef & { earned: boolean };

/** نشان‌های یک کاربر مشخص، همراه با وضعیت قفل/باز، به ترتیب ثابت BADGES */
export async function computeBadges(userId: string): Promise<UserBadge[]> {
  const all = await computeAllBadges();
  return BADGES.map((def) => ({ ...def, earned: all.get(def.id)?.has(userId) ?? false }));
}
