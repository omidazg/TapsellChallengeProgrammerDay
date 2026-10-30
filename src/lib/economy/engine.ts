/**
 * موتور امتیاز — خالص، بدون وابستگی به پایگاه داده یا هر چیز خارجی.
 * پیاده‌سازی قرارداد در ./types.ts
 *
 * هر ثبت (تیم در یک محور) فقط با ثبت‌های همان محور سنجیده می‌شود. سه بخش با وزن‌های همان محور (جمع ۱۰۰۰):
 *   هوش مصنوعی — نمرهٔ ۰..۱۰۰ ارزیابی نهایی (پیش از آن، بازخورد موقت)
 *   بازار       — حمایت با سکه + نصب فعال + درآمد + امتیاز ستاره‌ای + تعداد نظر
 *   داوری       — میانگین نمرهٔ داوران
 * نصب، درآمد و نظر با مقیاس لگاریتمی نسبت به بهترین ثبت محور سنجیده می‌شوند تا یک محصول
 * پرطرفدار بقیه را به صفر نرساند. در پایان کسر تقلب کم می‌شود.
 */

import { DEFAULTS } from "@/lib/constants";
import { DEFAULT_WEIGHTS, type TrackWeights } from "@/lib/tracks";
import { entryKey } from "./types";
import type { EconomyConfig, MarketPoints, ScoreOutput, TeamInput, TeamResult } from "./types";

/** پیکربندی پیش‌فرض ساخته‌شده از ثابت‌های پروژه. */
export function defaultConfig(): EconomyConfig {
  return {
    supportCap: DEFAULTS.supportCap,
    trackWeights: {},
    ratingMinComments: DEFAULTS.ratingMinComments,
  };
}

/**
 * نمرهٔ ۰..۱۰۰ داوری: هر داور میانگین نمره‌هایی که به معیارها داده (هر کدام ۰..۱۰)،
 * و نتیجه میانگین داورها × ۱۰. اگر هیچ نمره‌ای نباشد null (هنوز داوری نشده).
 */
export function juryRawScore(judges: Record<string, unknown>[], criterionKeys: string[]): number | null {
  const perJudge: number[] = [];
  for (const scores of judges) {
    const given = criterionKeys
      .map((k) => scores[k])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      .map((v) => Math.min(10, Math.max(0, v)));
    if (given.length > 0) perJudge.push(given.reduce((a, b) => a + b, 0) / given.length);
  }
  if (perJudge.length === 0) return null;
  return (perJudge.reduce((a, b) => a + b, 0) / perJudge.length) * 10;
}

/**
 * حمایت مردمی یک پروژه به روش تأمین مالی درجه‌دو: سکه‌های هر حامی جمع می‌شود، تا `cap` بریده
 * می‌شود، از آن جذر گرفته می‌شود و جمع جذرها به توان دو می‌رسد.
 * مثال: ۱۰ حامیِ ۱۰ سکه‌ای (√۱۰ × ۱۰)² = ۱۰۰۰ می‌شوند؛ یک حامیِ ۱۰۰ سکه‌ای با سقف ۵۰ فقط (√۵۰)² = ۵۰،
 * یعنی ۲۰ برابر (با سقف ۱۰۰ یا بیشتر: ۱۰۰۰ در برابر ۱۰۰، ۱۰ برابر). متن نمایشی: peopleExample در lib/people-example.ts.
 * اعضای خود تیم (excludeUserIds) حساب نمی‌شوند.
 */
export function peopleSupport(
  supports: { userId: string; amount: number }[],
  cap: number,
  excludeUserIds: ReadonlySet<string> = new Set()
): { score: number; supporters: number; coins: number } {
  const byUser = new Map<string, number>();
  for (const s of supports) {
    if (excludeUserIds.has(s.userId) || s.amount <= 0) continue;
    byUser.set(s.userId, (byUser.get(s.userId) ?? 0) + s.amount);
  }
  let rootSum = 0;
  let coins = 0;
  for (const amount of byUser.values()) {
    coins += amount;
    rootSum += Math.sqrt(Math.min(amount, Math.max(0, cap)));
  }
  return { score: rootSum * rootSum, supporters: byUser.size, coins };
}

type ValidationResult = { ok: true } | { ok: false; error: string };

interface SpendArgs {
  amount: number;
  walletLeft: number;
  isOwnTeam: boolean;
}

/** اعتبارسنجی حمایت از یک ایده. حمایت از پروژهٔ خود ممنوع است؛ قانون دیگری نیست. */
export function validateInvestment(args: SpendArgs): ValidationResult {
  const { amount, walletLeft, isOwnTeam } = args;
  if (isOwnTeam) return { ok: false, error: "نمی‌توانی از ایدهٔ تیم خودت حمایت کنی" };
  if (amount <= 0) return { ok: false, error: "مبلغ حمایت باید مثبت باشد" };
  if (amount > walletLeft) return { ok: false, error: "سکهٔ کافی نداری" };
  return { ok: true };
}

/** اعتبارسنجی خرید از یک محصول. */
export function validatePurchase(args: SpendArgs): ValidationResult {
  const { amount, walletLeft, isOwnTeam } = args;
  if (isOwnTeam) return { ok: false, error: "نمی‌توانی از تیم خودت بخری" };
  if (amount <= 0) return { ok: false, error: "مبلغ خرید باید مثبت باشد" };
  if (amount > walletLeft) return { ok: false, error: "سکهٔ کافی نداری" };
  return { ok: true };
}

/** کمترین مبلغ مجاز برای پیشنهاد بعدی حراج. */
export function nextMinBid(currentHighest: number | null, startPrice: number, increment: number): number {
  // نخستین پیشنهاد می‌تواند دقیقاً برابر قیمت پایه باشد
  const base = currentHighest ?? startPrice - increment;
  return base + increment;
}

/** آیا با توجه به پنجرهٔ ضد-اسنایپ باید حراج تمدید شود؟ */
export function shouldExtendAuction(nowMs: number, endsAtMs: number, windowSec: number): boolean {
  const remainingMs = endsAtMs - nowMs;
  return remainingMs <= windowSec * 1000 && remainingMs > 0;
}

/**
 * ترتیب قطعی رتبه‌بندی (و شکستن تساوی جوایز خودکار):
 * امتیاز کل بیشتر → حمایت مردمی بیشتر → نمرهٔ داوری بیشتر → ثبت نهایی محصول زودتر (بدون محصول = آخر)
 * → teamId و trackId صعودی. نتیجه مستقل از ترتیب ورودی/پایگاه‌داده است.
 */
export function compareRank(
  a: Pick<TeamResult, "teamId" | "trackId" | "total" | "people" | "juryAdjusted">,
  b: Pick<TeamResult, "teamId" | "trackId" | "total" | "people" | "juryAdjusted">,
  submittedAtByEntry: Map<string, number | null> = new Map()
): number {
  if (b.total !== a.total) return b.total - a.total;
  if (b.people !== a.people) return b.people - a.people;
  if (b.juryAdjusted !== a.juryAdjusted) return b.juryAdjusted - a.juryAdjusted;
  const sa = submittedAtByEntry.get(entryKey(a)) ?? null;
  const sb = submittedAtByEntry.get(entryKey(b)) ?? null;
  if (sa !== sb) {
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa - sb;
  }
  const ka = entryKey(a);
  const kb = entryKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** نسبت لگاریتمی به بهترین مقدار: log(1+x) / log(1+max) */
export function logRatio(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.log1p(value) / Math.log1p(max);
}

/** موتور اصلی امتیازدهی: همهٔ ثبت‌ها را می‌گیرد و نتیجهٔ کامل رتبه‌بندی‌شده برمی‌گرداند. */
export function scoreGame(config: EconomyConfig, teams: TeamInput[]): ScoreOutput {
  const partials = teams.map((team) => {
    const support = peopleSupport(team.supports, config.supportCap, new Set(team.memberIds));
    // آمار پرچم‌خورده تا رفع پرچم در امتیاز حساب نمی‌شود.
    const stats = team.stats && !team.stats.flagged ? team.stats : null;
    return {
      teamId: team.teamId,
      trackId: team.trackId,
      category: team.category,
      productId: team.productId,
      productName: team.productName,
      memberCount: team.memberIds.length,
      juryRaw: team.juryRaw,
      juryAdjusted: team.juryRaw ?? 0,
      people: support.score,
      supporters: support.supporters,
      coinsReceived: support.coins,
      ai: team.aiQuality == null ? null : Math.min(100, Math.max(0, team.aiQuality)),
      cheatPenalty: Math.max(0, team.cheatPenalty),
      stats,
    };
  });

  const results: TeamResult[] = [];
  const ratio = (value: number, max: number) => (max > 0 ? value / max : 0);

  for (const trackId of new Set(partials.map((p) => p.trackId))) {
    const group = partials.filter((p) => p.trackId === trackId);
    const w: TrackWeights = config.trackWeights[trackId] ?? DEFAULT_WEIGHTS;
    const maxOf = (pick: (t: (typeof group)[number]) => number) => Math.max(0, ...group.map(pick));
    const maxJury = maxOf((t) => t.juryAdjusted);
    const maxPeople = maxOf((t) => t.people);
    const maxAi = maxOf((t) => t.ai ?? 0);
    const maxInstalls = maxOf((t) => t.stats?.activeInstalls ?? 0);
    const maxRevenue = maxOf((t) => t.stats?.revenueToman ?? 0);
    const maxComments = maxOf((t) => t.stats?.commentCount ?? 0);
    const marketPts = w.market * 10;

    for (const { stats, ...t } of group) {
      const share = (pct: number, r: number) => (marketPts * pct * r) / 100;
      const rating =
        stats && stats.rating != null && stats.commentCount >= config.ratingMinComments
          ? Math.min(5, Math.max(0, stats.rating)) / 5
          : 0;
      const marketDetail: MarketPoints = {
        support: share(w.marketSub.support, ratio(t.people, maxPeople)),
        activeInstalls: share(w.marketSub.activeInstalls, logRatio(stats?.activeInstalls ?? 0, maxInstalls)),
        revenue: share(w.marketSub.revenue, logRatio(stats?.revenueToman ?? 0, maxRevenue)),
        rating: share(w.marketSub.rating, rating),
        comments: share(w.marketSub.comments, logRatio(stats?.commentCount ?? 0, maxComments)),
      };
      const pts = {
        jury: w.jury * 10 * ratio(t.juryAdjusted, maxJury),
        market: Object.values(marketDetail).reduce((a, b) => a + b, 0),
        ai: w.ai * 10 * ratio(t.ai ?? 0, maxAi),
      };
      const total = Math.max(0, pts.jury + pts.market + pts.ai - t.cheatPenalty);
      results.push({ ...t, pts, marketDetail, total });
    }
  }

  const submittedAtByEntry = new Map(teams.map((t) => [entryKey(t), t.productSubmittedAt ?? null]));
  results.sort((a, b) => compareRank(a, b, submittedAtByEntry));
  const nextInTrack = new Map<string, number>();
  results.forEach((r, i) => {
    r.overallRank = i + 1;
    const n = (nextInTrack.get(r.trackId) ?? 0) + 1;
    nextInTrack.set(r.trackId, n);
    r.rank = n;
  });

  return { teams: results };
}
