/**
 * تسویهٔ نهایی بازی (پرداخت سود سرمایه‌گذاران، ثبت جریمه‌ها و تثبیت امتیازها).
 * قرارداد: settleGame باید idempotent باشد — فراخوانی دوباره چیزی را دو بار پرداخت نمی‌کند.
 *
 * ترتیب مهم است: امتیاز و جریمهٔ سکهٔ خرج‌نشده روی کیف‌پول‌ها **پیش از** واریز سود
 * محاسبه می‌شود؛ وگرنه سودِ تازه‌واریز‌شده خودش «خرج‌نشده» حساب می‌شد و دوباره جریمه می‌خورد.
 */
import { prisma } from "./db";
import { computeScores } from "./scoring";
import { invalidate } from "./ttl-cache";
import { DEFAULTS } from "./constants";
import type { DividendLine, ScoreOutput, TeamResult } from "./economy/types";

/** کلید Setting که زمان تسویه در آن ذخیره می‌شود (ISO). */
export const SETTLED_AT_KEY = "settled_at";

export type SettlementResult = {
  alreadySettled: boolean;
  dividendsPaid: number;
  teams: number;
  settledAt: Date;
  /** تعداد سطرهای سود پرداخت‌شده (هر سرمایه‌گذار روی هر تیم یک سطر) */
  dividendLines?: number;
};

/** زمان تسویهٔ نهایی؛ null یعنی هنوز تسویه نشده است. */
export async function getSettledAt(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: SETTLED_AT_KEY } });
  if (!row?.value) return null;
  const d = new Date(row.value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * تسویهٔ نهایی.
 *
 * امتیازها با `computeScores()` (فقط-خواندنی) محاسبه می‌شوند — یعنی جریمهٔ خرج‌نشده
 * بر اساس کیف‌پول‌های *پیش از* واریز سود به‌دست می‌آید — و سپس همهٔ نوشتن‌ها
 * (دفتر کل سود، افزایش کیف خرید، ثبت TeamScore و کلید settled_at) در یک تراکنش انجام می‌شود.
 * درون همان تراکنش دوباره settled_at بررسی می‌شود تا دو فراخوانی هم‌زمان دوبار پرداخت نکنند.
 */
export async function settleGame(): Promise<SettlementResult> {
  const existing = await getSettledAt();
  if (existing) {
    const teams = await prisma.teamScore.count();
    const paid = await prisma.ledgerEntry.aggregate({
      where: { reason: "DIVIDEND", wallet: "BUY" },
      _sum: { delta: true },
    });
    return { alreadySettled: true, dividendsPaid: paid._sum.delta ?? 0, teams, settledAt: existing };
  }

  const output: ScoreOutput = await computeScores();
  const settledAt = new Date();

  const result = await prisma.$transaction<SettlementResult>(async (tx) => {
    // بررسی دوباره داخل تراکنش (محافظت در برابر فراخوانی هم‌زمان)
    const guard = await tx.setting.findUnique({ where: { key: SETTLED_AT_KEY } });
    if (guard?.value) {
      const teams = await tx.teamScore.count();
      const paid = await tx.ledgerEntry.aggregate({
        where: { reason: "DIVIDEND", wallet: "BUY" },
        _sum: { delta: true },
      });
      return {
        alreadySettled: true,
        dividendsPaid: paid._sum.delta ?? 0,
        teams,
        settledAt: new Date(guard.value),
      };
    }

    // ۱) پرداخت سود سرمایه‌گذاران خارجی (موتور فقط سرمایه‌گذاری‌های غیر selfFunded را می‌شمارد)
    let dividendsPaid = 0;
    let dividendLines = 0;
    for (const line of output.dividends) {
      if (line.dividend <= 0) continue;
      await tx.ledgerEntry.create({
        data: {
          userId: line.userId,
          teamId: line.teamId,
          wallet: "BUY",
          delta: line.dividend,
          reason: "DIVIDEND",
          refId: line.teamId,
        },
      });
      await tx.user.update({
        where: { id: line.userId },
        data: { buyWallet: { increment: line.dividend } },
      });
      dividendsPaid += line.dividend;
      dividendLines += 1;
    }

    // ۲) تثبیت نتیجهٔ همهٔ تیم‌ها (جریمهٔ خرج‌نشده در ستون unspentPenalty ثبت می‌شود)
    for (const t of output.teams) {
      const data = {
        grossSales: t.grossSales,
        dividendsPaid: t.dividendsPaid,
        netSales: t.netSales,
        externalCapital: t.externalCapital,
        investorRoi: t.investorRoi,
        uniqueBuyers: t.uniqueBuyers,
        hearts: t.hearts,
        unspentPenalty: t.unspentPenalty,
        ptsSales: t.pts.sales,
        ptsCapital: t.pts.capital,
        ptsRoi: t.pts.roi,
        ptsQuality: t.pts.quality,
        ptsTeaser: t.pts.teaser,
        ptsCommunity: t.pts.community,
        ptsPortfolio: t.pts.portfolio,
        ptsTaste: t.pts.taste,
        total: t.total,
        rank: t.rank ?? 0,
        selfCapital: t.selfCapital,
        quality: t.quality,
        teaser: t.teaser,
        portfolio: t.portfolio,
        taste: t.taste,
        computedAt: settledAt,
      };
      await tx.teamScore.upsert({
        where: { teamId: t.teamId },
        update: data,
        create: { teamId: t.teamId, ...data },
      });
    }

    // ۳) مهر تسویه
    await tx.setting.upsert({
      where: { key: SETTLED_AT_KEY },
      update: { value: settledAt.toISOString() },
      create: { key: SETTLED_AT_KEY, value: settledAt.toISOString() },
    });

    return {
      alreadySettled: false,
      dividendsPaid,
      teams: output.teams.length,
      settledAt,
      dividendLines,
    };
  });

  // امتیازها بعد از تسویه (سود سرمایه‌گذاران، جریمه، قفل‌شدن نتایج) تغییر کرده‌اند؛
  // کش صفحات عمومی (جدول امتیازات، نتایج) باید پاک شود تا داده‌های قدیمی نمایش داده نشود.
  invalidate("scores:");
  return result;
}

/**
 * بعد از تسویهٔ نهایی، نتیجه از جدول TeamScore و دفتر کل خوانده می‌شود (نه بازمحاسبه)،
 * تا عددهای صفحه دقیقاً همانی باشد که پرداخت و ثبت شده است.
 *
 * از آیتم ۳۵ به بعد، rank/selfCapital/quality/teaser هم مستقیماً روی TeamScore ذخیره‌اند و
 * دیگر لازم نیست از Investment/pts بازسازی شوند. سطرهایی که پیش از این تغییر نوشته شده‌اند
 * rank=۰ دارند (مقدار پیش‌فرض ستون تازه)؛ برای آن‌ها به مسیر بازسازی قدیمی برمی‌گردیم.
 */
export async function loadSettledOutput(): Promise<ScoreOutput> {
  const [scores, dividendRows] = await Promise.all([
    prisma.teamScore.findMany(),
    prisma.ledgerEntry.findMany({ where: { reason: "DIVIDEND", wallet: "BUY" } }),
  ]);

  // سطر تسویه‌شدهٔ پیش از آیتم ۳۵ چون rank را نداشت، پیش‌فرض ۰ گرفته است.
  const legacy = scores.some((s) => s.rank === 0);

  const selfCapital = new Map<string, number>();
  const investedByUserTeam = new Map<string, number>();
  {
    // invested هر سرمایه‌گذار روی هر تیم در TeamScore ذخیره نمی‌شود (فقط مجموع تیم)،
    // پس برای ساختن خطوط سود همیشه از Investment خوانده می‌شود.
    const investments = await prisma.investment.findMany({
      select: { userId: true, amount: true, selfFunded: true, idea: { select: { teamId: true } } },
    });
    for (const inv of investments) {
      const teamId = inv.idea.teamId;
      if (inv.selfFunded) {
        if (legacy) selfCapital.set(teamId, (selfCapital.get(teamId) ?? 0) + inv.amount);
      } else {
        const key = `${inv.userId}|${teamId}`;
        investedByUserTeam.set(key, (investedByUserTeam.get(key) ?? 0) + inv.amount);
      }
    }
  }

  // هر سطر DIVIDEND دفتر کل: refId = شناسهٔ تیم سرمایه‌پذیر
  const byUserTeam = new Map<string, number>();
  for (const row of dividendRows) {
    if (!row.userId || !row.refId) continue;
    const key = `${row.userId}|${row.refId}`;
    byUserTeam.set(key, (byUserTeam.get(key) ?? 0) + row.delta);
  }

  // portfolioCredit در دفتر کل ذخیره نمی‌شود (فقط یک مشتق امتیازی است)؛ اینجا از روی
  // قدرت فعلی کاربر (سپر) بازسازی می‌شود — همان چیزی که scoreGame هنگام تسویه دید.
  const dividendUserIds = [...new Set([...byUserTeam.keys()].map((k) => k.split("|")[0]))];
  const shieldUsers = dividendUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: dividendUserIds }, power: "SHIELD" },
        select: { id: true },
      })
    : [];
  const shieldedUserIds = new Set(shieldUsers.map((u) => u.id));

  const dividends: DividendLine[] = [...byUserTeam.entries()].map(([key, dividend]) => {
    const [userId, teamId] = key.split("|");
    const invested = investedByUserTeam.get(key) ?? 0;
    const portfolioCredit = shieldedUserIds.has(userId)
      ? Math.max(dividend, Math.floor(invested * DEFAULTS.shieldFloor))
      : dividend;
    return { userId, teamId, invested, dividend, portfolioCredit };
  });

  const teams: TeamResult[] = scores.map((s) => ({
    teamId: s.teamId,
    grossSales: s.grossSales,
    dividendsPaid: s.dividendsPaid,
    netSales: s.netSales,
    externalCapital: s.externalCapital,
    selfCapital: legacy ? selfCapital.get(s.teamId) ?? 0 : s.selfCapital,
    investorRoi: s.investorRoi,
    uniqueBuyers: s.uniqueBuyers,
    hearts: s.hearts,
    // مسیر جدید: نمرهٔ خام مستقیماً از ستون‌های quality/teaser خوانده می‌شود.
    // مسیر قدیمی (بک‌فیل): این مقدار در TeamScore نبود، امتیاز وزنی جایگزینش می‌شود
    // (فقط برای ترتیب جوایز کافی بود).
    quality: legacy ? s.ptsQuality : s.quality,
    teaser: legacy ? s.ptsTeaser : s.teaser,
    // مسیر قدیمی (پیش از پرتفوی/سلیقه): این ستون‌ها وجود نداشتند، ۰ پیش‌فرض می‌مانند.
    portfolio: s.portfolio,
    taste: s.taste,
    unspentPenalty: s.unspentPenalty,
    pts: {
      sales: s.ptsSales,
      quality: s.ptsQuality,
      capital: s.ptsCapital,
      roi: s.ptsRoi,
      teaser: s.ptsTeaser,
      community: s.ptsCommunity,
      portfolio: s.ptsPortfolio,
      taste: s.ptsTaste,
    },
    total: s.total,
    rank: legacy ? undefined : s.rank,
  }));

  if (legacy) {
    // همان قاعدهٔ رتبه‌بندی موتور اقتصاد
    teams.sort((a, b) => (b.total !== a.total ? b.total - a.total : b.netSales - a.netSales));
    teams.forEach((t, i) => {
      t.rank = i + 1;
    });
  } else {
    teams.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }

  return { teams, dividends };
}
