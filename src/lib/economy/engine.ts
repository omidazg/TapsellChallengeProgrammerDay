/**
 * موتور امتیاز — خالص، بدون وابستگی به پایگاه داده یا هر چیز خارجی.
 * پیاده‌سازی قرارداد در ./types.ts
 *
 * سه معیار (جمع وزن‌ها ۱۰۰۰):
 *   داوری انسانی  — میانگین سه پرسش داوری × ۱۰
 *   حمایت مردمی   — (Σ √min(سکهٔ هر حامی، سقف))²  (تأمین مالی درجه‌دو)
 *   داوری هوش مصنوعی — نمرهٔ ۰..۱۰۰ داور هوش مصنوعی
 * هر معیار نسبت به بهترین پروژهٔ همان معیار سنجیده می‌شود؛ سپس کسر تقلب کم می‌شود.
 * تعداد اعضای تیم (۱ تا ۳ نفر) در امتیاز هیچ اثری ندارد.
 */

import { DEFAULTS, SCORE_WEIGHTS } from "@/lib/constants";
import type { EconomyConfig, JuryScores, ScoreOutput, TeamInput, TeamResult } from "./types";

/** پیکربندی پیش‌فرض ساخته‌شده از ثابت‌های پروژه. */
export function defaultConfig(): EconomyConfig {
  return {
    supportCap: DEFAULTS.supportCap,
    weights: { ...SCORE_WEIGHTS },
  };
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * نمرهٔ ۰..۱۰۰ داوری انسانی: میانگین پرسش‌هایی که داور نمره داده (هر کدام ۰..۱۰) × ۱۰.
 * اگر هیچ پرسشی نمره نگرفته باشد null (هنوز داوری نشده).
 */
export function juryRawScore(jury: JuryScores | null): number | null {
  if (!jury) return null;
  const given = [jury.works, jury.value, jury.pitch].filter((v): v is number => typeof v === "number");
  if (given.length === 0) return null;
  const clamped = given.map((v) => Math.min(10, Math.max(0, v)));
  return (sum(clamped) / clamped.length) * 10;
}

/**
 * حمایت مردمی یک پروژه به روش تأمین مالی درجه‌دو: سکه‌های هر حامی جمع می‌شود، تا `cap` بریده
 * می‌شود، از آن جذر گرفته می‌شود و جمع جذرها به توان دو می‌رسد.
 * «۱۰ نفر که هر کدام ۱۰ سکه بدهند، ۱۰ برابرِ یک نفر با ۱۰۰ سکه می‌ارزند.»
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

/** موتور اصلی امتیازدهی: همهٔ تیم‌ها را می‌گیرد و نتیجهٔ کامل رتبه‌بندی‌شده برمی‌گرداند. */
export function scoreGame(config: EconomyConfig, teams: TeamInput[]): ScoreOutput {
  const partials = teams.map((team) => {
    const memberCount = team.memberIds.length;
    const juryRaw = juryRawScore(team.jury);
    // نمرهٔ داوری همان نمرهٔ خام است؛ اندازهٔ تیم اثری ندارد. داوری‌نشده = صفر.
    const juryAdjusted = juryRaw ?? 0;
    const support = peopleSupport(team.supports, config.supportCap, new Set(team.memberIds));
    return {
      teamId: team.teamId,
      memberCount,
      juryRaw,
      juryAdjusted,
      people: support.score,
      supporters: support.supporters,
      coinsReceived: support.coins,
      ai: team.aiQuality == null ? null : Math.min(100, Math.max(0, team.aiQuality)),
      cheatPenalty: Math.max(0, team.cheatPenalty),
    };
  });

  const maxOf = (pick: (t: (typeof partials)[number]) => number) => Math.max(0, ...partials.map(pick));
  const maxJury = maxOf((t) => t.juryAdjusted);
  const maxPeople = maxOf((t) => t.people);
  const maxAi = maxOf((t) => t.ai ?? 0);
  const ratio = (value: number, max: number) => (max > 0 ? value / max : 0);

  const results: TeamResult[] = partials.map((t) => {
    const pts = {
      jury: config.weights.jury * ratio(t.juryAdjusted, maxJury),
      people: config.weights.people * ratio(t.people, maxPeople),
      ai: config.weights.ai * ratio(t.ai ?? 0, maxAi),
    };
    const total = Math.max(0, pts.jury + pts.people + pts.ai - t.cheatPenalty);
    return { ...t, pts, total };
  });

  results.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.people !== a.people) return b.people - a.people;
    return b.juryAdjusted - a.juryAdjusted;
  });
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  return { teams: results };
}
