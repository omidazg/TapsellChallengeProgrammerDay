/**
 * داشبورد تحلیلی برگزارکننده (Item 50) — کوئری‌های گروهی، بدون N+1.
 * همهٔ اعداد پشت cached() با TTL کوتاه هستند چون این صفحه فقط ادمین می‌بیند اما
 * می‌تواند چند بار پشت‌سرهم رفرش شود.
 */
import { prisma } from "./db";
import { cached } from "./ttl-cache";

export type ParticipationStats = {
  registered: number;
  inTeam: { count: number; pct: number };
  investors: { count: number; pct: number };
  buyers: { count: number; pct: number };
  bidders: { count: number; pct: number };
  hearters: { count: number; pct: number };
};

async function getParticipationStats(): Promise<ParticipationStats> {
  const [registered, inTeam, investorGroups, buyerGroups, bidderGroups, hearterGroups] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { teamId: { not: null } } }),
    prisma.investment.groupBy({ by: ["userId"] }),
    prisma.purchase.groupBy({ by: ["userId"] }),
    prisma.bid.groupBy({ by: ["userId"] }),
    prisma.heart.groupBy({ by: ["userId"] }),
  ]);
  const pct = (n: number) => (registered > 0 ? Math.round((n / registered) * 1000) / 10 : 0);
  const withPct = (n: number) => ({ count: n, pct: pct(n) });
  return {
    registered,
    inTeam: withPct(inTeam),
    investors: withPct(investorGroups.length),
    buyers: withPct(buyerGroups.length),
    bidders: withPct(bidderGroups.length),
    hearters: withPct(hearterGroups.length),
  };
}

export type SpendBucket = { label: string; count: number };
export type SpendStats = {
  /** درصد کل سکه‌هایی (رایگان + خریده‌شده + افزودهٔ برگزارکننده) که خرج شده */
  spentPct: number;
  buckets: SpendBucket[];
  /** سکه‌های فروخته‌شده با پول و تعداد خریداران سکه */
  coinsSold: number;
  coinBuyers: number;
};

const BUCKET_LABELS = ["۰–۲۵٪", "۲۵–۵۰٪", "۵۰–۷۵٪", "۷۵–۱۰۰٪"];

function bucketIndex(pct: number) {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped >= 100) return 3;
  return Math.min(3, Math.floor(clamped / 25));
}

/**
 * نرخ خرج سکه از روی دفتر کل: خرج هر کاربر = جمع ردیف‌های منفی کیف سکه (BUY)؛ کل سکه‌ای که داشته
 * = موجودی فعلی + خرج. پس سکه‌های رایگان اولیه، خریده‌شده و افزودهٔ برگزارکننده همه حساب می‌شوند.
 */
async function getSpendStats(): Promise<SpendStats> {
  const [users, spentGroups, sold] = await Promise.all([
    prisma.user.findMany({ select: { id: true, buyWallet: true } }),
    prisma.ledgerEntry.groupBy({ by: ["userId"], where: { wallet: "BUY", delta: { lt: 0 } }, _sum: { delta: true } }),
    prisma.coinOrder.groupBy({ by: ["userId"], where: { status: "PAID" }, _sum: { coins: true } }),
  ]);
  const spentByUser = new Map(spentGroups.map((g) => [g.userId, -(g._sum.delta ?? 0)]));

  let totalSpent = 0;
  let totalHad = 0;
  const buckets = [0, 0, 0, 0];
  for (const u of users) {
    const spent = spentByUser.get(u.id) ?? 0;
    const had = spent + u.buyWallet;
    totalSpent += spent;
    totalHad += had;
    buckets[bucketIndex(had > 0 ? (spent / had) * 100 : 0)]++;
  }

  return {
    spentPct: totalHad > 0 ? Math.round((totalSpent / totalHad) * 1000) / 10 : 0,
    buckets: buckets.map((count, i) => ({ label: BUCKET_LABELS[i], count })),
    coinsSold: sold.reduce((a, g) => a + (g._sum.coins ?? 0), 0),
    coinBuyers: sold.length,
  };
}

export type HourlyBucket = { hourStart: Date; count: number };

/** هیستوگرام ساعتی ترکیبی حمایت+خرید+پیشنهاد حراج+قلب، از اولین تا آخرین رخداد بازی */
async function getHourlyActivity(): Promise<HourlyBucket[]> {
  const [inv, pur, bid, heart] = await Promise.all([
    prisma.investment.findMany({ select: { createdAt: true } }),
    prisma.purchase.findMany({ select: { createdAt: true } }),
    prisma.bid.findMany({ select: { createdAt: true } }),
    prisma.heart.findMany({ select: { createdAt: true } }),
  ]);
  const times = [...inv, ...pur, ...bid, ...heart].map((r) => r.createdAt.getTime());
  if (times.length === 0) return [];

  const HOUR = 3_600_000;
  const start = Math.floor(Math.min(...times) / HOUR) * HOUR;
  const end = Math.floor(Math.max(...times) / HOUR) * HOUR;
  const buckets = new Map<number, number>();
  for (let t = start; t <= end; t += HOUR) buckets.set(t, 0);
  for (const t of times) {
    const key = Math.floor(t / HOUR) * HOUR;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ hourStart: new Date(t), count }));
}

export type SurveyStats = {
  count: number;
  averages: { rating: number; fun: number; learned: number };
  distributions: { rating: number[]; fun: number[]; learned: number[] };
  latestComments: { nickname: string; comment: string; createdAt: Date }[];
};

async function getSurveyStats(): Promise<SurveyStats> {
  const responses = await prisma.surveyResponse.findMany({
    include: { user: { select: { nickname: true } } },
    orderBy: { createdAt: "desc" },
  });
  const count = responses.length;
  const avg = (key: "rating" | "fun" | "learned") => (count > 0 ? Math.round((responses.reduce((s, r) => s + r[key], 0) / count) * 100) / 100 : 0);
  const dist = (key: "rating" | "fun" | "learned") => {
    const d = [0, 0, 0, 0, 0];
    for (const r of responses) d[r[key] - 1]++;
    return d;
  };
  const latestComments = responses
    .filter((r) => r.comment.trim().length > 0)
    .slice(0, 20)
    .map((r) => ({ nickname: r.user.nickname, comment: r.comment, createdAt: r.createdAt }));

  return {
    count,
    averages: { rating: avg("rating"), fun: avg("fun"), learned: avg("learned") },
    distributions: { rating: dist("rating"), fun: dist("fun"), learned: dist("learned") },
    latestComments,
  };
}

export type Analytics = {
  participation: ParticipationStats;
  spend: SpendStats;
  hourly: HourlyBucket[];
  survey: SurveyStats;
};

async function computeAnalyticsUncached(): Promise<Analytics> {
  const [participation, spend, hourly, survey] = await Promise.all([
    getParticipationStats(),
    getSpendStats(),
    getHourlyActivity(),
    getSurveyStats(),
  ]);
  return { participation, spend, hourly, survey };
}

export async function getAnalytics(): Promise<Analytics> {
  return cached("analytics:admin", 30_000, computeAnalyticsUncached);
}
