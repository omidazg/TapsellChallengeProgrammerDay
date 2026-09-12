import { prisma } from "./db";
import { defaultConfig, scoreGame } from "./economy/engine";
import type { MemberWallet, ScoreOutput, TeamInput, TeamResult } from "./economy/types";

/** برچسب فارسی دلیل تراکنش‌های دفتر کل */
export const LEDGER_REASON_LABEL: Record<string, string> = {
  INVEST: "سرمایه‌گذاری",
  PURCHASE: "خرید",
  BID_HOLD: "توقیف پیشنهاد حراج",
  BID_RELEASE: "آزادسازی پیشنهاد حراج",
  ADSLOT: "جایگاه تبلیغاتی",
  DIVIDEND: "سود سهام",
  PENALTY: "جریمه",
  ADMIN: "تنظیم برگزارکننده",
};

export const WALLET_LABEL: Record<string, string> = {
  SEED: "کیف بذر",
  BUY: "کیف خرید",
  TREASURY: "خزانهٔ تیم",
};

/**
 * همهٔ داده‌های لازم برای امتیازدهی را از پایگاه‌داده جمع می‌کند
 * و به موتور خالص اقتصاد (scoreGame) می‌سپارد.
 */
export async function computeScores(): Promise<ScoreOutput> {
  const config = defaultConfig();

  const teams = await prisma.team.findMany({
    include: {
      members: { select: { id: true } },
      idea: { include: { investments: true } },
      product: { include: { purchases: true, hearts: true, auction: true } },
    },
  });

  const teamInputs: TeamInput[] = teams.map((t) => {
    const investments = (t.idea?.investments ?? []).map((i) => ({
      userId: i.userId,
      amount: i.amount,
      selfFunded: i.selfFunded,
    }));

    const purchaseSales = (t.product?.purchases ?? []).map((p) => ({ userId: p.userId, amount: p.amount }));
    const auction = t.product?.auction;
    const auctionSales =
      auction && auction.status === "ENDED" && auction.winnerId && auction.finalPrice
        ? [{ userId: auction.winnerId, amount: auction.finalPrice }]
        : [];

    return {
      teamId: t.id,
      memberIds: t.members.map((m) => m.id),
      revenueShare: t.idea?.revenueShare ?? config.minRevenueShare,
      investments,
      sales: [...purchaseSales, ...auctionSales],
      hearts: t.product?.hearts.length ?? 0,
      juryQuality: t.product?.juryQuality ?? null,
      juryTeaser: t.product?.juryTeaser ?? null,
      aiQuality: t.product?.aiQuality ?? null,
    };
  });

  const users = await prisma.user.findMany({
    select: { id: true, teamId: true, seedWallet: true, buyWallet: true, power: true, powerUsed: true },
  });
  const wallets: MemberWallet[] = users.map((u) => ({
    userId: u.id,
    teamId: u.teamId,
    seedLeft: u.seedWallet,
    buyLeft: u.buyWallet,
    shieldUsed: u.power === "SHIELD" && u.powerUsed,
  }));

  return scoreGame(config, teamInputs, wallets);
}

export type AwardKey = "champion" | "topSales" | "topCapital" | "popularProduct" | "bestTeaser" | "topInvestor";

export interface Award {
  key: AwardKey;
  label: string;
  emoji: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  userNickname?: string;
  value: number;
}

export interface AwardExtra {
  teamNames: Map<string, string>;
  userNicknames: Map<string, string>;
}

const MIN_INVESTED_FOR_AWARD = 30;
const MAX_AWARDS_PER_TEAM = 2;

/** جوایز پایان بازی؛ هر تیم حداکثر دو جایزه می‌گیرد (بعد از آن به نفر بعدی می‌رسد). */
export function computeAwards(output: ScoreOutput, extra: AwardExtra): Award[] {
  const teamAwardCount = new Map<string, number>();
  const awards: Award[] = [];

  function pickTeam(key: AwardKey, label: string, emoji: string, metric: (t: TeamResult) => number) {
    const sorted = [...output.teams].sort((a, b) => metric(b) - metric(a));
    for (const t of sorted) {
      const count = teamAwardCount.get(t.teamId) ?? 0;
      if (count >= MAX_AWARDS_PER_TEAM) continue;
      awards.push({ key, label, emoji, teamId: t.teamId, teamName: extra.teamNames.get(t.teamId) ?? "", value: metric(t) });
      teamAwardCount.set(t.teamId, count + 1);
      return;
    }
  }

  pickTeam("champion", "قهرمان میدان", "🏆", (t) => t.total);
  pickTeam("topSales", "پرفروش‌ترین", "💰", (t) => t.netSales);
  pickTeam("topCapital", "بهترین جذب سرمایه", "📈", (t) => t.externalCapital);
  pickTeam("popularProduct", "محبوب‌ترین محصول", "❤️", (t) => t.hearts);
  pickTeam("bestTeaser", "بهترین تیزر", "🎬", (t) => t.teaser);

  const byUser = new Map<string, { invested: number; dividend: number }>();
  for (const d of output.dividends) {
    const cur = byUser.get(d.userId) ?? { invested: 0, dividend: 0 };
    cur.invested += d.invested;
    cur.dividend += d.dividend;
    byUser.set(d.userId, cur);
  }
  let bestUser: { userId: string; roi: number } | null = null;
  for (const [userId, v] of byUser) {
    if (v.invested < MIN_INVESTED_FOR_AWARD) continue;
    const roi = v.dividend / v.invested;
    if (!bestUser || roi > bestUser.roi) bestUser = { userId, roi };
  }
  if (bestUser) {
    awards.push({
      key: "topInvestor",
      label: "بهترین سرمایه‌گذار",
      emoji: "💎",
      userId: bestUser.userId,
      userNickname: extra.userNicknames.get(bestUser.userId) ?? "",
      value: bestUser.roi,
    });
  }

  return awards;
}

/** فهرست سرمایه‌گذاران برتر بر اساس مجموع سود دریافتی نسبت‌به مجموع سرمایهٔ خارجی. */
export function topInvestors(output: ScoreOutput): { userId: string; invested: number; dividend: number; roi: number }[] {
  const byUser = new Map<string, { invested: number; dividend: number }>();
  for (const d of output.dividends) {
    const cur = byUser.get(d.userId) ?? { invested: 0, dividend: 0 };
    cur.invested += d.invested;
    cur.dividend += d.dividend;
    byUser.set(d.userId, cur);
  }
  return [...byUser.entries()]
    .map(([userId, v]) => ({ userId, invested: v.invested, dividend: v.dividend, roi: v.invested > 0 ? v.dividend / v.invested : 0 }))
    .sort((a, b) => b.roi - a.roi);
}
