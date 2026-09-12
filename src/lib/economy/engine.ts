/**
 * موتور اقتصاد — خالص، بدون وابستگی به پایگاه داده یا هر چیز خارجی.
 * پیاده‌سازی قرارداد در ./types.ts
 */

import { DEFAULTS, SCORE_WEIGHTS } from "@/lib/constants";
import type {
  DividendLine,
  EconomyConfig,
  MemberWallet,
  ScoreOutput,
  TeamInput,
  TeamResult,
} from "./types";

/** پیکربندی پیش‌فرض ساخته‌شده از ثابت‌های پروژه. */
export function defaultConfig(): EconomyConfig {
  return {
    seedWallet: DEFAULTS.seedWallet,
    buyWallet: DEFAULTS.buyWallet,
    maxPerTarget: DEFAULTS.maxPerTarget,
    penaltyPerCoin: DEFAULTS.penaltyPerCoin,
    minRevenueShare: DEFAULTS.minRevenueShare,
    maxRevenueShare: DEFAULTS.maxRevenueShare,
    weights: { ...SCORE_WEIGHTS },
  };
}

/**
 * سود سهام هر تیم را بر اساس سرمایه‌گذاران خارجی (غیر selfFunded) محاسبه می‌کند.
 * dividend هر سرمایه‌گذار = floor(grossSales * revenueShare/100 * invested/externalCapital)
 */
export function computeDividends(team: TeamInput): DividendLine[] {
  const grossSales = sum(team.sales.map((s) => s.amount));
  const externalInvestments = team.investments.filter((i) => !i.selfFunded);
  const externalCapital = sum(externalInvestments.map((i) => i.amount));

  if (externalCapital <= 0) return [];

  const pool = grossSales * (team.revenueShare / 100);

  return externalInvestments.map((inv) => ({
    userId: inv.userId,
    teamId: team.teamId,
    invested: inv.amount,
    dividend: Math.floor((pool * inv.amount) / externalCapital),
  }));
}

/** جریمهٔ سکهٔ خرج‌نشده برای مجموعهٔ اعضای یک تیم. */
export function unspentPenalty(config: EconomyConfig, wallets: MemberWallet[]): number {
  let totalUnspent = 0;
  for (const w of wallets) {
    const leftover = w.seedLeft + w.buyLeft;
    const shielded = w.shieldUsed ? Math.min(10, leftover) : 0;
    totalUnspent += leftover - shielded;
  }
  return config.penaltyPerCoin * totalUnspent;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

interface ValidationArgs {
  amount: number;
  alreadyOnTarget: number;
  walletLeft: number;
  maxPerTarget: number;
  isOwnTeam: boolean;
}

type ValidationResult = { ok: true } | { ok: false; error: string };

/** اعتبارسنجی سرمایه‌گذاری روی یک ایده. */
export function validateInvestment(args: ValidationArgs): ValidationResult {
  const { amount, alreadyOnTarget, walletLeft, maxPerTarget } = args;

  if (amount <= 0) {
    return { ok: false, error: "مبلغ سرمایه‌گذاری باید مثبت باشد" };
  }
  if (amount > walletLeft) {
    return { ok: false, error: "موجودی کیف بذر کافی نیست" };
  }
  if (alreadyOnTarget + amount > maxPerTarget) {
    return { ok: false, error: `سقف سرمایه‌گذاری روی هر ایده ${faDigits(maxPerTarget)} سکه است` };
  }
  return { ok: true };
}

/** اعتبارسنجی خرید از یک محصول. */
export function validatePurchase(args: ValidationArgs): ValidationResult {
  const { amount, alreadyOnTarget, walletLeft, maxPerTarget, isOwnTeam } = args;

  if (isOwnTeam) {
    return { ok: false, error: "نمی‌توانی از تیم خودت بخری" };
  }
  if (amount <= 0) {
    return { ok: false, error: "مبلغ خرید باید مثبت باشد" };
  }
  if (amount > walletLeft) {
    return { ok: false, error: "موجودی کیف خرید کافی نیست" };
  }
  if (alreadyOnTarget + amount > maxPerTarget) {
    return { ok: false, error: `سقف خرید از هر محصول ${faDigits(maxPerTarget)} سکه است` };
  }
  return { ok: true };
}

// تبدیل عدد به رقم فارسی برای پیام‌های خطا
function faDigits(n: number): string {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(n).replace(/[0-9]/g, (d) => persian[Number(d)]);
}

/** کمترین مبلغ مجاز برای پیشنهاد بعدی حراج. */
export function nextMinBid(currentHighest: number | null, startPrice: number, increment: number): number {
  if (currentHighest === null) return startPrice;
  return currentHighest + increment;
}

/** آیا با توجه به پنجرهٔ ضد-اسنایپ باید حراج تمدید شود؟ */
export function shouldExtendAuction(nowMs: number, endsAtMs: number, windowSec: number): boolean {
  const remainingMs = endsAtMs - nowMs;
  return remainingMs <= windowSec * 1000 && remainingMs >= 0;
}

/** موتور اصلی امتیازدهی: همهٔ تیم‌ها را می‌گیرد و نتیجهٔ کامل رتبه‌بندی‌شده برمی‌گرداند. */
export function scoreGame(
  config: EconomyConfig,
  teams: TeamInput[],
  wallets: MemberWallet[]
): ScoreOutput {
  const allDividends: DividendLine[] = [];
  const partials: Omit<TeamResult, "pts" | "total" | "rank">[] = [];

  for (const team of teams) {
    const dividends = computeDividends(team);
    allDividends.push(...dividends);

    const grossSales = sum(team.sales.map((s) => s.amount));
    const dividendsPaid = sum(dividends.map((d) => d.dividend));
    const netSales = grossSales - dividendsPaid;
    const externalCapital = sum(
      team.investments.filter((i) => !i.selfFunded).map((i) => i.amount)
    );
    const selfCapital = sum(
      team.investments.filter((i) => i.selfFunded).map((i) => i.amount)
    );
    const investorRoi = externalCapital > 0 ? dividendsPaid / externalCapital : 0;
    const uniqueBuyers = new Set(team.sales.map((s) => s.userId)).size;
    const quality = team.juryQuality ?? team.aiQuality ?? 0;
    const teaser = team.juryTeaser ?? 0;

    const teamWallets = wallets.filter((w) => team.memberIds.includes(w.userId));
    const penalty = unspentPenalty(config, teamWallets);

    partials.push({
      teamId: team.teamId,
      grossSales,
      dividendsPaid,
      netSales,
      externalCapital,
      selfCapital,
      investorRoi,
      uniqueBuyers,
      hearts: team.hearts,
      quality,
      teaser,
      unspentPenalty: penalty,
    });
  }

  const maxOf = (pick: (t: (typeof partials)[number]) => number) =>
    Math.max(0, ...partials.map(pick));

  const community = (t: (typeof partials)[number]) => t.uniqueBuyers * 10 + t.hearts * 5;

  const maxNetSales = maxOf((t) => t.netSales);
  const maxQuality = maxOf((t) => t.quality);
  const maxCapital = maxOf((t) => t.externalCapital);
  const maxRoi = maxOf((t) => t.investorRoi);
  const maxTeaser = maxOf((t) => t.teaser);
  const maxCommunity = maxOf(community);

  const ratio = (value: number, max: number) => (max > 0 ? value / max : 0);

  const results: TeamResult[] = partials.map((t) => {
    const pts = {
      sales: config.weights.sales * ratio(t.netSales, maxNetSales),
      quality: config.weights.quality * ratio(t.quality, maxQuality),
      capital: config.weights.capital * ratio(t.externalCapital, maxCapital),
      roi: config.weights.roi * ratio(t.investorRoi, maxRoi),
      teaser: config.weights.teaser * ratio(t.teaser, maxTeaser),
      community: config.weights.community * ratio(community(t), maxCommunity),
    };
    const rawTotal = pts.sales + pts.quality + pts.capital + pts.roi + pts.teaser + pts.community - t.unspentPenalty;
    const total = Math.max(0, rawTotal);
    return { ...t, pts, total };
  });

  results.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return b.netSales - a.netSales;
  });
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  return { teams: results, dividends: allDividends };
}
