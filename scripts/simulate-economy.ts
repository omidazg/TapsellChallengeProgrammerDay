/**
 * شبیه‌سازی مونت‌کارلو موتور اقتصاد.
 * اجرا: npx tsx scripts/simulate-economy.ts
 *
 * ۱۲ تیم × ۳ عضو با رفتارهای تصادفی (احتکارکننده / سرمایه‌گذار متمرکز / معمولی)
 * می‌سازد، ۲۰۰ بار با seed های مختلف scoreGame را اجرا می‌کند و خلاصه‌ای
 * فارسی/انگلیسی از نتایج چاپ می‌کند.
 */

import { defaultConfig, scoreGame } from "../src/lib/economy/engine";
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

type Profile = "hoarder" | "concentrated" | "normal";

interface RunOutcome {
  totals: number[];
  hoarderWon: boolean;
  winnerZeroSales: boolean;
  metricShares: { sales: number; quality: number; capital: number; roi: number; teaser: number; community: number };
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

  // انباشت سرمایه‌گذاری و فروش هر تیم
  const investmentsByTeam: Map<string, { userId: string; amount: number; selfFunded: boolean }[]> = new Map(
    teamIds.map((id) => [id, []])
  );
  const salesByTeam: Map<string, { userId: string; amount: number }[]> = new Map(teamIds.map((id) => [id, []]));
  const walletLeft: Map<string, { seedLeft: number; buyLeft: number }> = new Map();

  for (let ti = 0; ti < NUM_TEAMS; ti++) {
    const teamId = teamIds[ti];
    const profile = profiles[ti];
    for (const userId of memberIdsByTeam[ti]) {
      let seedLeft = SEED_WALLET;
      let buyLeft = BUY_WALLET;

      if (profile === "hoarder") {
        // احتکارکننده: تقریباً هیچ خرج نمی‌کند
        // (احتمال کوچک یک سرمایه‌گذاری/خرید ناچیز برای واقع‌گرایی)
        if (rand() < 0.1) {
          const other = pick(rand, teamIds.filter((t) => t !== teamId));
          const amt = randInt(rand, 1, 5);
          investmentsByTeam.get(other)!.push({ userId, amount: amt, selfFunded: false });
          seedLeft -= amt;
        }
      } else if (profile === "concentrated") {
        // همهٔ سرمایه روی یک هدف؛ خرید هم متمرکز
        const targetTeam = pick(rand, teamIds.filter((t) => t !== teamId));
        const invAmt = Math.min(MAX_PER_TARGET, seedLeft);
        investmentsByTeam.get(targetTeam)!.push({ userId, amount: invAmt, selfFunded: false });
        seedLeft -= invAmt;

        const buyTarget = pick(rand, teamIds.filter((t) => t !== teamId));
        const buyAmt = Math.min(MAX_PER_TARGET, buyLeft);
        salesByTeam.get(buyTarget)!.push({ userId, amount: buyAmt });
        buyLeft -= buyAmt;
      } else {
        // معمولی: سرمایه‌گذاری و خرید پراکنده در ۲ تا ۳ هدف
        const investTargets = new Set<string>();
        const numInv = randInt(rand, 1, 3);
        while (investTargets.size < numInv) investTargets.add(pick(rand, teamIds.filter((t) => t !== teamId)));
        for (const target of investTargets) {
          const amt = Math.min(randInt(rand, 5, 25), seedLeft);
          if (amt <= 0) continue;
          const selfFunded = false;
          investmentsByTeam.get(target)!.push({ userId, amount: amt, selfFunded });
          seedLeft -= amt;
        }
        // گاهی هم روی تیم خودش سرمایه‌گذاری می‌کند (selfFunded)
        if (rand() < 0.3 && seedLeft > 0) {
          const amt = Math.min(randInt(rand, 5, 15), seedLeft);
          investmentsByTeam.get(teamId)!.push({ userId, amount: amt, selfFunded: true });
          seedLeft -= amt;
        }

        const buyTargets = new Set<string>();
        const numBuy = randInt(rand, 1, 3);
        while (buyTargets.size < numBuy) buyTargets.add(pick(rand, teamIds.filter((t) => t !== teamId)));
        for (const target of buyTargets) {
          const amt = Math.min(randInt(rand, 5, 20), buyLeft);
          if (amt <= 0) continue;
          salesByTeam.get(target)!.push({ userId, amount: amt });
          buyLeft -= amt;
        }
      }

      walletLeft.set(userId, { seedLeft, buyLeft });
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
      return {
        userId,
        teamId,
        seedLeft: w.seedLeft,
        buyLeft: w.buyLeft,
        shieldUsed: rand() < 0.15,
      };
    })
  );

  const config = defaultConfig();
  const output = scoreGame(config, teams, wallets);

  const winner = output.teams.find((t) => t.rank === 1)!;
  const hoarderTeamId = teamIds[hoarderIdx];
  const hoarderResult = output.teams.find((t) => t.teamId === hoarderTeamId)!;

  // سهم هر معیار از مجموع امتیازهای مثبت (بدون جریمه) در این اجرا
  const metricSums = { sales: 0, quality: 0, capital: 0, roi: 0, teaser: 0, community: 0 };
  for (const t of output.teams) {
    metricSums.sales += t.pts.sales;
    metricSums.quality += t.pts.quality;
    metricSums.capital += t.pts.capital;
    metricSums.roi += t.pts.roi;
    metricSums.teaser += t.pts.teaser;
    metricSums.community += t.pts.community;
  }
  const grandTotal = Object.values(metricSums).reduce((a, b) => a + b, 0) || 1;
  const metricShares = {
    sales: metricSums.sales / grandTotal,
    quality: metricSums.quality / grandTotal,
    capital: metricSums.capital / grandTotal,
    roi: metricSums.roi / grandTotal,
    teaser: metricSums.teaser / grandTotal,
    community: metricSums.community / grandTotal,
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

  const metricKeys = ["sales", "quality", "capital", "roi", "teaser", "community"] as const;
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
