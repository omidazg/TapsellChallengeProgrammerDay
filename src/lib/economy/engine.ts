/**
 * موتور اقتصاد — خالص، بدون وابستگی به پایگاه داده یا هر چیز خارجی.
 * پیاده‌سازی قرارداد در ./types.ts
 */

import { COMMUNITY_POINTS, DEFAULTS, SCORE_WEIGHTS } from "@/lib/constants";
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
    roiSmoothing: DEFAULTS.roiSmoothing,
    shieldFloor: DEFAULTS.shieldFloor,
    community: { ...COMMUNITY_POINTS },
    weights: { ...SCORE_WEIGHTS },
  };
}

/**
 * سود سهام هر تیم را بر اساس سرمایه‌گذاران خارجی (غیر selfFunded) محاسبه می‌کند.
 * dividend هر سرمایه‌گذار = floor(grossSales * revenueShare/100 * invested/externalCapital)
 *
 * portfolioCredit اعتبار امتیاز پرتفوی است: برابر dividend، مگر برای سرمایه‌گذارانی
 * که قدرت «سپر» دارند — برای آن‌ها حداقل floor(invested × shieldFloor) تضمین می‌شود.
 * این فقط روی امتیاز اثر دارد؛ سکهٔ واقعی پرداختی (dividend) هرگز تغییر نمی‌کند.
 */
export function computeDividends(
  team: TeamInput,
  shieldFloor: number,
  shieldedUserIds: ReadonlySet<string>
): DividendLine[] {
  const grossSales = sum(team.sales.map((s) => s.amount));
  const externalInvestments = team.investments.filter((i) => !i.selfFunded);
  const externalCapital = sum(externalInvestments.map((i) => i.amount));

  if (externalCapital <= 0) return [];

  const pool = grossSales * (team.revenueShare / 100);

  // چند سرمایه‌گذاری یک نفر روی یک تیم، یک سهم‌دار واحد است؛ اول جمع می‌شود
  // بعد گرد به پایین می‌شود تا هر سرمایه‌گذار دقیقاً یک سطر سود بگیرد.
  const byUser = new Map<string, number>();
  for (const inv of externalInvestments) {
    byUser.set(inv.userId, (byUser.get(inv.userId) ?? 0) + inv.amount);
  }

  return [...byUser.entries()].map(([userId, invested]) => {
    const dividend = Math.floor((pool * invested) / externalCapital);
    const portfolioCredit = shieldedUserIds.has(userId)
      ? Math.max(dividend, Math.floor(invested * shieldFloor))
      : dividend;
    return { userId, teamId: team.teamId, invested, dividend, portfolioCredit };
  });
}

/**
 * جریمهٔ سکهٔ خرج‌نشده برای مجموعهٔ اعضای یک تیم.
 * فقط سکه‌ای جریمه می‌شود که «می‌شد» خرج شود: min(seedLeft, seedSpendable) + min(buyLeft, buySpendable).
 * (نسخهٔ قبلی معافیت ثابت «سپر = ۱۰ سکه» داشت؛ سپر دیگر روی جریمه اثر ندارد،
 * فقط روی امتیاز پرتفوی — نگاه کنید computeDividends.)
 */
export function unspentPenalty(config: EconomyConfig, wallets: MemberWallet[]): number {
  let totalUnspent = 0;
  for (const w of wallets) {
    totalUnspent += Math.min(w.seedLeft, w.seedSpendable) + Math.min(w.buyLeft, w.buySpendable);
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

/** اعتبارسنجی سرمایه‌گذاری روی یک ایده. سرمایه‌گذاری روی تیم خود ممنوع است. */
export function validateInvestment(args: ValidationArgs): ValidationResult {
  const { amount, alreadyOnTarget, walletLeft, maxPerTarget, isOwnTeam } = args;

  if (isOwnTeam) {
    return { ok: false, error: "نمی‌توانی روی ایدهٔ تیم خودت سرمایه‌گذاری کنی" };
  }
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

/**
 * تخفیف قدرت «چانه‌زنی» روی یک واحد (سکه). حداقل ۱ تا روی محصولات ارزان هم اثر داشته باشد.
 * فروشنده همچنان قیمت کامل را می‌گیرد؛ این فقط مبلغی است که خریدار کمتر می‌پردازد.
 * بازار (پرداخت) و امتیازدهی (buySpendable) هر دو باید از همین تابع استفاده کنند.
 */
export function bargainDiscountFor(price: number, rate: number): number {
  if (price <= 1) return 0;
  return Math.min(price - 1, Math.max(1, Math.round(price * rate)));
}

/**
 * سقف مؤثر خرید یک نفر از یک محصول (بر حسب درآمد فروشنده).
 * هر خریدار همیشه دست‌کم یک واحد می‌تواند بخرد، حتی اگر برگزارکننده سقف را
 * پایین‌تر از قیمت محصولی که قبلاً ثبت شده بیاورد.
 */
export function effectivePurchaseCap(maxPerTarget: number, price: number): number {
  return Math.max(maxPerTarget, price);
}

/**
 * بیشترین مبلغی که با بودجهٔ `budget` واقعاً می‌شود خرج کرد، وقتی هر خرید یک «واحد» با
 * هزینهٔ ثابت است (items: هزینهٔ هر واحد و تعداد واحد مجاز). این یک subset-sum کران‌دار است.
 *
 * چرا لازم است: کیف خرید بخش‌پذیر نیست. اگر ۷ سکه مانده و ارزان‌ترین محصول ۱۰ سکه است،
 * آن ۷ سکه «خرج‌شدنی» نیست و نباید جریمه شود. بودجه کوچک است (حداکثر چند صد سکه)،
 * پس جدول بولی به طول budget+1 کاملاً ارزان است.
 */
export function maxSpendable(budget: number, items: { cost: number; count: number }[]): number {
  const cap = Math.max(0, Math.floor(budget));
  if (cap === 0) return 0;
  const reach = new Uint8Array(cap + 1);
  reach[0] = 1;
  for (const { cost, count } of items) {
    if (cost <= 0 || count <= 0) continue;
    const n = Math.min(count, Math.floor(cap / cost));
    for (let k = 0; k < n; k++) {
      let changed = false;
      for (let v = cap; v >= cost; v--) {
        if (!reach[v] && reach[v - cost]) {
          reach[v] = 1;
          changed = true;
        }
      }
      if (!changed) break;
    }
  }
  for (let v = cap; v > 0; v--) if (reach[v]) return v;
  return 0;
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

type BasePartial = Omit<TeamResult, "pts" | "total" | "rank" | "portfolio" | "taste">;

/** موتور اصلی امتیازدهی: همهٔ تیم‌ها را می‌گیرد و نتیجهٔ کامل رتبه‌بندی‌شده برمی‌گرداند. */
export function scoreGame(
  config: EconomyConfig,
  teams: TeamInput[],
  wallets: MemberWallet[]
): ScoreOutput {
  const walletByUser = new Map(wallets.map((w) => [w.userId, w]));
  const shieldedUserIds = new Set(wallets.filter((w) => w.hasShield).map((w) => w.userId));

  const allDividends: DividendLine[] = [];
  const basePartials: BasePartial[] = [];

  for (const team of teams) {
    const dividends = computeDividends(team, config.shieldFloor, shieldedUserIds);
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
    const investorRoi = dividendsPaid / (externalCapital + config.roiSmoothing);
    const uniqueBuyers = new Set(team.sales.map((s) => s.userId)).size;
    const quality = team.juryQuality ?? team.aiQuality ?? 0;
    const teaser = team.juryTeaser ?? 0;

    const teamWallets = wallets.filter((w) => team.memberIds.includes(w.userId));
    const penalty = unspentPenalty(config, teamWallets);

    basePartials.push({
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

  // پرتفوی: اعتبار هر خط سود به تیمِ *سرمایه‌گذار* اضافه می‌شود (نه تیم سرمایه‌پذیر).
  // سرمایه‌گذاری روی تیم خود هرگز اینجا نمی‌رسد (computeDividends خودی‌ها را حذف می‌کند)،
  // اما برای اطمینان دوباره بررسی می‌شود.
  const portfolioByTeam = new Map<string, number>();
  for (const d of allDividends) {
    const investorTeamId = walletByUser.get(d.userId)?.teamId ?? null;
    if (!investorTeamId || investorTeamId === d.teamId) continue;
    portfolioByTeam.set(investorTeamId, (portfolioByTeam.get(investorTeamId) ?? 0) + d.portfolioCredit);
  }

  // سلیقه: خرید اعضای یک تیم از محصولات باکیفیتِ تیم‌های دیگر.
  const qualityByTeam = new Map(basePartials.map((t) => [t.teamId, t.quality]));
  const tasteByTeam = new Map<string, number>();
  for (const team of teams) {
    const sellerQuality = qualityByTeam.get(team.teamId) ?? 0;
    for (const s of team.sales) {
      const buyerTeamId = walletByUser.get(s.userId)?.teamId ?? null;
      if (!buyerTeamId || buyerTeamId === team.teamId) continue;
      tasteByTeam.set(buyerTeamId, (tasteByTeam.get(buyerTeamId) ?? 0) + (s.amount * sellerQuality) / 100);
    }
  }

  const partials: Omit<TeamResult, "pts" | "total" | "rank">[] = basePartials.map((t) => ({
    ...t,
    portfolio: portfolioByTeam.get(t.teamId) ?? 0,
    taste: tasteByTeam.get(t.teamId) ?? 0,
  }));

  const maxOf = (pick: (t: (typeof partials)[number]) => number) =>
    Math.max(0, ...partials.map(pick));

  const community = (t: (typeof partials)[number]) =>
    t.uniqueBuyers * config.community.uniqueBuyer + t.hearts * config.community.heart;

  const maxNetSales = maxOf((t) => t.netSales);
  const maxQuality = maxOf((t) => t.quality);
  const maxCapital = maxOf((t) => t.externalCapital);
  const maxRoi = maxOf((t) => t.investorRoi);
  const maxTeaser = maxOf((t) => t.teaser);
  const maxCommunity = maxOf(community);
  const maxPortfolio = maxOf((t) => t.portfolio);
  const maxTaste = maxOf((t) => t.taste);

  const ratio = (value: number, max: number) => (max > 0 ? value / max : 0);

  const results: TeamResult[] = partials.map((t) => {
    const pts = {
      sales: config.weights.sales * ratio(t.netSales, maxNetSales),
      quality: config.weights.quality * ratio(t.quality, maxQuality),
      capital: config.weights.capital * ratio(t.externalCapital, maxCapital),
      roi: config.weights.roi * ratio(t.investorRoi, maxRoi),
      teaser: config.weights.teaser * ratio(t.teaser, maxTeaser),
      community: config.weights.community * ratio(community(t), maxCommunity),
      portfolio: config.weights.portfolio * ratio(t.portfolio, maxPortfolio),
      taste: config.weights.taste * ratio(t.taste, maxTaste),
    };
    const rawTotal =
      pts.sales +
      pts.quality +
      pts.capital +
      pts.roi +
      pts.teaser +
      pts.community +
      pts.portfolio +
      pts.taste -
      t.unspentPenalty;
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
