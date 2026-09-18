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
        total: t.total,
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
 */
export async function loadSettledOutput(): Promise<ScoreOutput> {
  const [scores, dividendRows, investments] = await Promise.all([
    prisma.teamScore.findMany(),
    prisma.ledgerEntry.findMany({ where: { reason: "DIVIDEND", wallet: "BUY" } }),
    prisma.investment.findMany({
      select: { userId: true, amount: true, selfFunded: true, idea: { select: { teamId: true } } },
    }),
  ]);

  const selfCapital = new Map<string, number>();
  const investedByUserTeam = new Map<string, number>();
  for (const inv of investments) {
    const teamId = inv.idea.teamId;
    if (inv.selfFunded) {
      selfCapital.set(teamId, (selfCapital.get(teamId) ?? 0) + inv.amount);
    } else {
      const key = `${inv.userId}|${teamId}`;
      investedByUserTeam.set(key, (investedByUserTeam.get(key) ?? 0) + inv.amount);
    }
  }

  // هر سطر DIVIDEND دفتر کل: refId = شناسهٔ تیم سرمایه‌پذیر
  const byUserTeam = new Map<string, number>();
  for (const row of dividendRows) {
    if (!row.userId || !row.refId) continue;
    const key = `${row.userId}|${row.refId}`;
    byUserTeam.set(key, (byUserTeam.get(key) ?? 0) + row.delta);
  }
  const dividends: DividendLine[] = [...byUserTeam.entries()].map(([key, dividend]) => {
    const [userId, teamId] = key.split("|");
    return { userId, teamId, invested: investedByUserTeam.get(key) ?? 0, dividend };
  });

  const teams: TeamResult[] = scores.map((s) => ({
    teamId: s.teamId,
    grossSales: s.grossSales,
    dividendsPaid: s.dividendsPaid,
    netSales: s.netSales,
    externalCapital: s.externalCapital,
    selfCapital: selfCapital.get(s.teamId) ?? 0,
    investorRoi: s.investorRoi,
    uniqueBuyers: s.uniqueBuyers,
    hearts: s.hearts,
    // نمرهٔ خام کیفیت/تیزر در TeamScore ذخیره نمی‌شود؛ امتیاز وزنی همان ترتیب را دارد
    // و اینجا فقط برای رتبه‌بندی جوایز به کار می‌رود.
    quality: s.ptsQuality,
    teaser: s.ptsTeaser,
    unspentPenalty: s.unspentPenalty,
    pts: {
      sales: s.ptsSales,
      quality: s.ptsQuality,
      capital: s.ptsCapital,
      roi: s.ptsRoi,
      teaser: s.ptsTeaser,
      community: s.ptsCommunity,
    },
    total: s.total,
  }));

  // همان قاعدهٔ رتبه‌بندی موتور اقتصاد
  teams.sort((a, b) => (b.total !== a.total ? b.total - a.total : b.netSales - a.netSales));
  teams.forEach((t, i) => {
    t.rank = i + 1;
  });

  return { teams, dividends };
}
