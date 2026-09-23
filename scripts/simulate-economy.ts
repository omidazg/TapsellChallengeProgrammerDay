/**
 * شبیه‌سازی مونت‌کارلو موتور اقتصاد.
 * اجرا: npx tsx scripts/simulate-economy.ts
 *
 * ۱۲ تیم × ۳ عضو با رفتارهای تصادفی (احتکارکننده / سرمایه‌گذار متمرکز / معمولی)
 * می‌سازد، ۲۰۰ بار با seed های مختلف scoreGame را اجرا می‌کند و خلاصه‌ای
 * فارسی/انگلیسی از نتایج چاپ می‌کند.
 *
 * مدل جدید (پرتفوی/سلیقه/سپر/چانه‌زنی/بدون سرمایه‌گذاری خودی) اینجا هم شبیه‌سازی می‌شود:
 * هر تیم یک قیمت محصول ثابت دارد، هر کاربر یک قدرت تصادفی (از ۶ قدرت بازی) می‌گیرد،
 * و seedSpendable/buySpendable/hasShield دقیقاً با همان فرمول src/lib/scoring.ts محاسبه می‌شوند.
 */

import { bargainDiscountFor, defaultConfig, effectivePurchaseCap, maxSpendable, scoreGame } from "../src/lib/economy/engine";
import { DEFAULTS } from "../src/lib/constants";
import type { MemberWallet, TeamInput } from "../src/lib/economy/types";

// ---------- PRNG بدون وابستگی (mulberry32) ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const randInt = (rand: Rand, min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(rand: Rand, arr: T[]): T => arr[randInt(rand, 0, arr.length - 1)];

const NUM_TEAMS = 12;
const MEMBERS_PER_TEAM = 3;
const NUM_RUNS = 200;
const SEED_WALLET = 100;
const BUY_WALLET = 100;
const MAX_PER_TARGET = 40;
const POWERS = ["HYPE", "BARGAIN", "ANGEL", "SECOND_WIND", "INSIDER", "SHIELD"] as const;

type Profile = "hoarder" | "concentrated" | "normal";

interface RunOutcome {
  totals: number[];
  hoarderWon: boolean;
  winnerZeroSales: boolean;
  metricShares: {
    sales: number;
    quality: number;
    capital: number;
    roi: number;
    teaser: number;
    community: number;
    portfolio: number;
    taste: number;
  };
}

function buildTeams(rand: Rand): { teamIds: string[]; hoarderIdx: number; concentratedIdx: number } {
  const teamIds = Array.from({ length: NUM_TEAMS }, (_, i) => `team${i}`);
  const hoarderIdx = randInt(rand, 0, NUM_TEAMS - 1);
  let concentratedIdx = randInt(rand, 0, NUM_TEAMS - 1);
  while (concentratedIdx === hoarderIdx) concentratedIdx = randInt(rand, 0, NUM_TEAMS - 1);
  return { teamIds, hoarderIdx, concentratedIdx };
}

function runOnce(seed: number): RunOutcome {
  const rand = mulberry32(seed);
  const { teamIds, hoarderIdx, concentratedIdx } = buildTeams(rand);

  const profiles: Profile[] = teamIds.map((_, i) =>
    i === hoarderIdx ? "hoarder" : i === concentratedIdx ? "concentrated" : "normal"
  );

  const memberIdsByTeam: string[][] = teamIds.map((teamId) =>
    Array.from({ length: MEMBERS_PER_TEAM }, (_, m) => `${teamId}_u${m}`)
  );

  // هر تیم یک محصول با قیمت ثابت دارد (۵..۴۰، مثل بازی واقعی)
  const priceByTeam = new Map<string, number>(teamIds.map((id) => [id, randInt(rand, DEFAULTS.minPrice, DEFAULTS.maxPrice)]));
  // هر کاربر یک قدرت تصادفی از ۶ قدرت بازی؛ فقط BARGAIN و SHIELD روی موتور اثر دارند
  const powerByUser = new Map<string, (typeof POWERS)[number]>();
  for (const members of memberIdsByTeam) for (const userId of members) powerByUser.set(userId, pick(rand, [...POWERS]));

  // انباشت سرمایه‌گذاری و فروش هر تیم (+ نگاشت هر کاربر روی هر هدف، برای محاسبهٔ seedSpendable/buySpendable)
  const investmentsByTeam: Map<string, { userId: string; amount: number; selfFunded: boolean }[]> = new Map(
    teamIds.map((id) => [id, []])
  );
  const salesByTeam: Map<string, { userId: string; amount: number }[]> = new Map(teamIds.map((id) => [id, []]));
  const investedByUserTeam = new Map<string, number>(); // `${userId}|${targetTeamId}` -> سرمایهٔ سرمایه‌گذاری‌شده
  const purchasedByUserTeam = new Map<string, number>(); // `${userId}|${targetTeamId}` -> مجموع درآمدِ فروشنده (قیمت کامل)
  const walletLeft: Map<string, { seedLeft: number; buyLeft: number }> = new Map();

  const addInvest = (userId: string, targetTeam: string, amount: number) => {
    investmentsByTeam.get(targetTeam)!.push({ userId, amount, selfFunded: false });
    const key = `${userId}|${targetTeam}`;
    investedByUserTeam.set(key, (investedByUserTeam.get(key) ?? 0) + amount);
  };
  const addSale = (userId: string, targetTeam: string, amount: number) => {
    salesByTeam.get(targetTeam)!.push({ userId, amount });
    const key = `${userId}|${targetTeam}`;
    purchasedByUserTeam.set(key, (purchasedByUserTeam.get(key) ?? 0) + amount);
  };

  for (let ti = 0; ti < NUM_TEAMS; ti++) {
    const teamId = teamIds[ti];
    const profile = profiles[ti];
    for (const userId of memberIdsByTeam[ti]) {
      let seedLeft = SEED_WALLET;
      let buyLeft = BUY_WALLET;
      const isBargain = powerByUser.get(userId) === "BARGAIN";

      // هزینهٔ واقعیِ کیف خرید یک خرید به مبلغ (درآمد فروشنده) amount؛
      // با چانه‌زنی خریدار کمتر می‌پردازد، فروشنده همچنان amount کامل را می‌گیرد.
      const buyerCost = (amount: number) => (isBargain ? Math.max(1, amount - bargainDiscountFor(amount, DEFAULTS.bargainDiscount)) : amount);

      if (profile === "hoarder") {
        // احتکارکننده: تقریباً هیچ خرج نمی‌کند
        if (rand() < 0.1) {
          const other = pick(rand, teamIds.filter((t) => t !== teamId));
          const amt = randInt(rand, 1, 5);
          addInvest(userId, other, amt);
          seedLeft -= amt;
        }
      } else if (profile === "concentrated") {
        // همهٔ سرمایه روی یک هدف؛ خرید هم متمرکز
        const targetTeam = pick(rand, teamIds.filter((t) => t !== teamId));
        const invAmt = Math.min(MAX_PER_TARGET, seedLeft);
        addInvest(userId, targetTeam, invAmt);
        seedLeft -= invAmt;

        const buyTarget = pick(rand, teamIds.filter((t) => t !== teamId));
        const buyAmt = Math.min(MAX_PER_TARGET, buyLeft);
        const cost = Math.min(buyLeft, buyerCost(buyAmt));
        addSale(userId, buyTarget, buyAmt);
        buyLeft -= cost;
      } else {
        // معمولی: سرمایه‌گذاری و خرید پراکنده در ۲ تا ۳ هدف (سرمایه‌گذاری خودی دیگر مجاز نیست)
        const investTargets = new Set<string>();
        const numInv = randInt(rand, 1, 3);
        while (investTargets.size < numInv) investTargets.add(pick(rand, teamIds.filter((t) => t !== teamId)));
        for (const target of investTargets) {
          const amt = Math.min(randInt(rand, 5, 25), seedLeft);
          if (amt <= 0) continue;
          addInvest(userId, target, amt);
          seedLeft -= amt;
        }

        const buyTargets = new Set<string>();
        const numBuy = randInt(rand, 1, 3);
        while (buyTargets.size < numBuy) buyTargets.add(pick(rand, teamIds.filter((t) => t !== teamId)));
        for (const target of buyTargets) {
          const amt = Math.min(randInt(rand, 5, 20), buyLeft);
          if (amt <= 0) continue;
          const cost = Math.min(buyLeft, buyerCost(amt));
          addSale(userId, target, amt);
          buyLeft -= cost;
        }
      }

      walletLeft.set(userId, { seedLeft: Math.max(0, seedLeft), buyLeft: Math.max(0, buyLeft) });
    }
  }

  const teams: TeamInput[] = teamIds.map((teamId, i) => ({
    teamId,
    memberIds: memberIdsByTeam[i],
    revenueShare: randInt(rand, 20, 60),
    investments: investmentsByTeam.get(teamId)!,
    sales: salesByTeam.get(teamId)!,
    hearts: randInt(rand, 0, 40),
    juryQuality: rand() < 0.7 ? randInt(rand, 20, 100) : null,
    juryTeaser: rand() < 0.7 ? randInt(rand, 20, 100) : null,
    aiQuality: randInt(rand, 20, 90),
  }));

  const wallets: MemberWallet[] = teamIds.flatMap((teamId, i) =>
    memberIdsByTeam[i].map((userId) => {
      const w = walletLeft.get(userId)!;
      const power = powerByUser.get(userId);

      // seedSpendable/buySpendable: همان فرمول src/lib/scoring.ts، برای هر هدف دیگر
      let seedSpendable = 0;
      const buyUnits: { cost: number; count: number }[] = [];
      for (const otherTeam of teamIds) {
        if (otherTeam === teamId) continue;
        const invested = investedByUserTeam.get(`${userId}|${otherTeam}`) ?? 0;
        seedSpendable += Math.max(0, MAX_PER_TARGET - invested);

        const price = priceByTeam.get(otherTeam)!;
        const purchased = purchasedByUserTeam.get(`${userId}|${otherTeam}`) ?? 0;
        const cap = effectivePurchaseCap(MAX_PER_TARGET, price);
        const units = Math.floor(Math.max(0, cap - purchased) / price);
        const discount = power === "BARGAIN" ? bargainDiscountFor(price, DEFAULTS.bargainDiscount) : 0;
        buyUnits.push({ cost: price - discount, count: units });
      }
      const buySpendable = maxSpendable(w.buyLeft, buyUnits);

      return {
        userId,
        teamId,
        seedLeft: w.seedLeft,
        buyLeft: w.buyLeft,
        seedSpendable,
        buySpendable,
        hasShield: power === "SHIELD",
      };
    })
  );

  const config = defaultConfig();
  const output = scoreGame(config, teams, wallets);

  const winner = output.teams.find((t) => t.rank === 1)!;
  const hoarderTeamId = teamIds[hoarderIdx];
  const hoarderResult = output.teams.find((t) => t.teamId === hoarderTeamId)!;

  // سهم هر معیار از مجموع امتیازهای مثبت (بدون جریمه) در این اجرا
  const metricSums = { sales: 0, quality: 0, capital: 0, roi: 0, teaser: 0, community: 0, portfolio: 0, taste: 0 };
  for (const t of output.teams) {
    metricSums.sales += t.pts.sales;
    metricSums.quality += t.pts.quality;
    metricSums.capital += t.pts.capital;
    metricSums.roi += t.pts.roi;
    metricSums.teaser += t.pts.teaser;
    metricSums.community += t.pts.community;
    metricSums.portfolio += t.pts.portfolio;
    metricSums.taste += t.pts.taste;
  }
  const grandTotal = Object.values(metricSums).reduce((a, b) => a + b, 0) || 1;
  const metricShares = {
    sales: metricSums.sales / grandTotal,
    quality: metricSums.quality / grandTotal,
    capital: metricSums.capital / grandTotal,
    roi: metricSums.roi / grandTotal,
    teaser: metricSums.teaser / grandTotal,
    community: metricSums.community / grandTotal,
    portfolio: metricSums.portfolio / grandTotal,
    taste: metricSums.taste / grandTotal,
  };

  return {
    totals: output.teams.map((t) => t.total),
    hoarderWon: hoarderResult.rank === 1,
    winnerZeroSales: winner.grossSales === 0,
    metricShares,
  };
}

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stdev(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function main() {
  const outcomes: RunOutcome[] = [];
  for (let run = 0; run < NUM_RUNS; run++) {
    outcomes.push(runOnce(1000 + run * 7919));
  }

  const allTotals = outcomes.flatMap((o) => o.totals);
  const hoarderWinCount = outcomes.filter((o) => o.hoarderWon).length;
  const zeroSalesWinCount = outcomes.filter((o) => o.winnerZeroSales).length;

  const metricKeys = ["sales", "quality", "capital", "roi", "teaser", "community", "portfolio", "taste"] as const;
  const avgMetricShare = Object.fromEntries(
    metricKeys.map((k) => [k, mean(outcomes.map((o) => o.metricShares[k]))])
  ) as Record<(typeof metricKeys)[number], number>;

  console.log("========================================");
  console.log("خلاصهٔ شبیه‌سازی موتور اقتصاد / Economy Engine Simulation Summary");
  console.log("========================================");
  console.log(`تعداد اجراها / runs: ${NUM_RUNS} × ${NUM_TEAMS} تیم / teams`);
  console.log("");
  console.log(`میانگین امتیاز کل تیم‌ها / average team total: ${mean(allTotals).toFixed(2)}`);
  console.log(
    `پراکندگی (انحراف معیار) / spread (stdev): ${stdev(allTotals).toFixed(2)}  ` +
      `(min=${Math.min(...allTotals).toFixed(1)}, max=${Math.max(...allTotals).toFixed(1)})`
  );
  console.log("");
  console.log(
    `تیم احتکارکننده چند بار برنده شد؟ / hoarding team wins: ${hoarderWinCount}/${NUM_RUNS} ` +
      `(${((hoarderWinCount / NUM_RUNS) * 100).toFixed(1)}%)`
  );
  console.log(
    `چند بار تیمی با فروش صفر برنده شد؟ / winner with zero sales: ${zeroSalesWinCount}/${NUM_RUNS} ` +
      `(${((zeroSalesWinCount / NUM_RUNS) * 100).toFixed(1)}%)`
  );
  console.log("");
  console.log("سهم میانگین هر معیار از امتیاز کل / average share of total points per metric:");
  for (const k of metricKeys) {
    console.log(`  ${k.padEnd(10)} ${(avgMetricShare[k] * 100).toFixed(1)}%`);
  }
  console.log("========================================");
}

main();
