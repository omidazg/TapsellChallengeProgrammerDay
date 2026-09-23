/**
 * سری‌های زمانی فروش و سرمایهٔ جذب‌شده برای نمودار روند صفحهٔ نتایج (آیتم ۴۸).
 * بدون وابستگی به فاز بازی: بازهٔ کل از اولین تا آخرین رویداد (خرید یا سرمایه‌گذاری) به‌دست می‌آید
 * (یا تا لحظهٔ فراخوانی، اگر بازی هنوز ادامه دارد).
 *
 * هر سطل (bucket) مقدار «تجمعی» تا پایان همان بازهٔ زمانی را نگه می‌دارد؛ یعنی خط نمودار
 * همیشه صعودی/ثابت است، نه نموداری از رویدادهای هر بازه به‌تنهایی.
 */
import { prisma } from "./db";
import { cached } from "./ttl-cache";

const TIMELINE_CACHE_PREFIX = "timeline:";
const TIMELINE_CACHE_TTL_MS = 15_000;

const MIN_BUCKETS = 24;
const MAX_BUCKETS = 48;
// اندازهٔ هدف هر سطل؛ برای بازهٔ معمول یک هکاتون ۲۴..۴۸ ساعته همین باعث می‌شود تعداد سطل‌ها
// خودش بین MIN_BUCKETS و MAX_BUCKETS بیفتد؛ برای بازه‌های خیلی کوتاه/بلند با min/max کلمپ می‌شود.
const TARGET_BUCKET_MS = 60 * 60 * 1000;

export interface TimelineSeries {
  teamId: string;
  /** فروش خالص تجمعی (Purchase.amount) در پایان هر سطل */
  sales: number[];
  /** سرمایهٔ جذب‌شدهٔ تجمعی (Investment.amount، خودی+خارجی) در پایان هر سطل */
  capital: number[];
}

export interface TimelineData {
  /** زمان پایان هر سطل (میلی‌ثانیه از epoch)، هم‌طول با هر آرایهٔ sales/capital */
  bucketEndsAt: number[];
  series: TimelineSeries[];
}

type Event = { at: number; amount: number };

/** جمع‌بندی تجمعی رویدادهای یک تیم روی مرزهای سطل‌های زمانی. */
function bucketize(events: Event[], edges: number[]): number[] {
  const cum: number[] = new Array(edges.length).fill(0);
  if (edges.length === 0) return cum;
  const sorted = [...events].sort((a, b) => a.at - b.at);
  let running = 0;
  let ei = 0;
  let vi = 0;
  while (ei < edges.length) {
    while (vi < sorted.length && sorted[vi].at <= edges[ei]) {
      running += sorted[vi].amount;
      vi++;
    }
    cum[ei] = running;
    ei++;
  }
  return cum;
}

async function computeTimeline(): Promise<TimelineData> {
  const [purchases, investments] = await Promise.all([
    prisma.purchase.findMany({ select: { amount: true, createdAt: true, product: { select: { teamId: true } } } }),
    prisma.investment.findMany({ select: { amount: true, createdAt: true, idea: { select: { teamId: true } } } }),
  ]);

  const allTimes = [
    ...purchases.map((p) => p.createdAt.getTime()),
    ...investments.map((i) => i.createdAt.getTime()),
  ];
  if (allTimes.length === 0) {
    return { bucketEndsAt: [], series: [] };
  }

  const start = Math.min(...allTimes);
  const end = Math.max(Math.max(...allTimes), Date.now());
  const span = Math.max(1, end - start);

  let bucketCount = Math.round(span / TARGET_BUCKET_MS);
  bucketCount = Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, bucketCount));
  const bucketMs = span / bucketCount;
  const bucketEndsAt = Array.from({ length: bucketCount }, (_, i) =>
    i === bucketCount - 1 ? end : Math.round(start + bucketMs * (i + 1))
  );

  const byTeamSales = new Map<string, Event[]>();
  for (const p of purchases) {
    const arr = byTeamSales.get(p.product.teamId) ?? [];
    arr.push({ at: p.createdAt.getTime(), amount: p.amount });
    byTeamSales.set(p.product.teamId, arr);
  }
  const byTeamCapital = new Map<string, Event[]>();
  for (const i of investments) {
    const arr = byTeamCapital.get(i.idea.teamId) ?? [];
    arr.push({ at: i.createdAt.getTime(), amount: i.amount });
    byTeamCapital.set(i.idea.teamId, arr);
  }

  const teamIds = new Set<string>([...byTeamSales.keys(), ...byTeamCapital.keys()]);
  const series: TimelineSeries[] = [...teamIds].map((teamId) => ({
    teamId,
    sales: bucketize(byTeamSales.get(teamId) ?? [], bucketEndsAt),
    capital: bucketize(byTeamCapital.get(teamId) ?? [], bucketEndsAt),
  }));

  return { bucketEndsAt, series };
}

/** نسخهٔ کش‌شده (۱۵ ثانیه) برای صفحهٔ عمومی نتایج. */
export function loadTimeline(): Promise<TimelineData> {
  return cached(TIMELINE_CACHE_PREFIX, TIMELINE_CACHE_TTL_MS, computeTimeline);
}
