/**
 * داشبورد تحلیلی برگزارکننده (Item 50) — کوئری‌های گروهی، بدون N+1.
 * همهٔ اعداد پشت cached() با TTL کوتاه هستند چون این صفحه فقط ادمین می‌بیند اما
 * می‌تواند چند بار پشت‌سرهم رفرش شود.
 */
import { prisma } from "./db";
import { cached } from "./ttl-cache";
import { getSettingInt } from "./phase";
import { DEFAULTS } from "./constants";

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
  seed: { spentPct: number; buckets: SpendBucket[] };
  buy: { spentPct: number; buckets: SpendBucket[] };
};

const BUCKET_LABELS = ["۰–۲۵٪", "۲۵–۵۰٪", "۵۰–۷۵٪", "۷۵–۱۰۰٪"];

function bucketIndex(pct: number) {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped >= 100) return 3;
  return Math.min(3, Math.floor(clamped / 25));
}

/**
 * کیف اولیهٔ هر کاربر در پایگاه‌داده ذخیره نشده (فقط موجودی فعلی)؛ به‌عنوان تقریب
 * از مقدار فعلی Setting به‌عنوان کیف شروعِ همهٔ کاربران استفاده می‌شود (همان مقداری
 * که register/actions.ts هنگام ساخت کاربر جدید از آن می‌خواند).
 */
async function getSpendStats(): Promise<SpendStats> {
  const [seedStart, buyStart, users] = await Promise.all([
    getSettingInt("seed_wallet", DEFAULTS.seedWallet),
    getSettingInt("buy_wallet", DEFAULTS.buyWallet),
    prisma.user.findMany({ select: { seedWallet: true, buyWallet: true } }),
  ]);

  let seedSpent = 0;
  let buySpent = 0;
  const seedBuckets = [0, 0, 0, 0];
  const buyBuckets = [0, 0, 0, 0];

  for (const u of users) {
    const sSpent = Math.max(0, seedStart - u.seedWallet);
    const bSpent = Math.max(0, buyStart - u.buyWallet);
    seedSpent += sSpent;
    buySpent += bSpent;
    seedBuckets[bucketIndex(seedStart > 0 ? (sSpent / seedStart) * 100 : 0)]++;
    buyBuckets[bucketIndex(buyStart > 0 ? (bSpent / buyStart) * 100 : 0)]++;
  }

  const totalSeedStart = seedStart * users.length;
  const totalBuyStart = buyStart * users.length;
  const toBuckets = (arr: number[]) => arr.map((count, i) => ({ label: BUCKET_LABELS[i], count }));

  return {
    seed: { spentPct: totalSeedStart > 0 ? Math.round((seedSpent / totalSeedStart) * 1000) / 10 : 0, buckets: toBuckets(seedBuckets) },
    buy: { spentPct: totalBuyStart > 0 ? Math.round((buySpent / totalBuyStart) * 1000) / 10 : 0, buckets: toBuckets(buyBuckets) },
  };
}

export type HourlyBucket = { hourStart: Date; count: number };

/** هیستوگرام ساعتی ترکیبی سرمایه‌گذاری+خرید+پیشنهاد حراج+قلب، از اولین تا آخرین رخداد بازی */
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
