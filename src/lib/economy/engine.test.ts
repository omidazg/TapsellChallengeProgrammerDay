import { describe, expect, it } from "vitest";
import {
  computeDividends,
  defaultConfig,
  nextMinBid,
  scoreGame,
  shouldExtendAuction,
  unspentPenalty,
  validateInvestment,
  validatePurchase,
} from "./engine";
import type { EconomyConfig, MemberWallet, TeamInput } from "./types";

function baseTeam(overrides: Partial<TeamInput> = {}): TeamInput {
  return {
    teamId: "t1",
    memberIds: ["u1", "u2", "u3"],
    revenueShare: 20,
    investments: [],
    sales: [],
    hearts: 0,
    juryQuality: null,
    juryTeaser: null,
    aiQuality: null,
    ...overrides,
  };
}

describe("computeDividends", () => {
  it("distributes pro-rata with floor rounding", () => {
    const team = baseTeam({
      revenueShare: 20,
      investments: [
        { userId: "a", amount: 30, selfFunded: false },
        { userId: "b", amount: 70, selfFunded: false },
      ],
      sales: [{ userId: "x", amount: 33 }],
    });
    // pool = 33 * 0.2 = 6.6
    // a: floor(6.6 * 30/100) = floor(1.98) = 1
    // b: floor(6.6 * 70/100) = floor(4.62) = 4
    const lines = computeDividends(team);
    expect(lines).toEqual([
      { userId: "a", teamId: "t1", invested: 30, dividend: 1 },
      { userId: "b", teamId: "t1", invested: 70, dividend: 4 },
    ]);
  });

  it("excludes self-funded investments from dividends and dilution", () => {
    const team = baseTeam({
      revenueShare: 50,
      investments: [
        { userId: "owner", amount: 40, selfFunded: true },
        { userId: "ext", amount: 20, selfFunded: false },
      ],
      sales: [{ userId: "x", amount: 100 }],
    });
    const lines = computeDividends(team);
    // externalCapital = 20 only (self-funded excluded from denominator)
    // pool = 100 * 0.5 = 50; ext dividend = floor(50 * 20/20) = 50
    expect(lines).toEqual([{ userId: "ext", teamId: "t1", invested: 20, dividend: 50 }]);
  });

  it("returns no dividends when externalCapital is zero", () => {
    const team = baseTeam({
      investments: [{ userId: "owner", amount: 40, selfFunded: true }],
      sales: [{ userId: "x", amount: 100 }],
    });
    expect(computeDividends(team)).toEqual([]);
  });

  it("aggregates multiple investments by the same investor before flooring", () => {
    const team = baseTeam({
      revenueShare: 20,
      investments: [
        { userId: "a", amount: 15, selfFunded: false },
        { userId: "a", amount: 15, selfFunded: false },
        { userId: "b", amount: 70, selfFunded: false },
      ],
      sales: [{ userId: "x", amount: 33 }],
    });
    // یک سطر برای هر سرمایه‌گذار: a با ۳۰ سکه، b با ۷۰ سکه
    const lines = computeDividends(team);
    expect(lines).toEqual([
      { userId: "a", teamId: "t1", invested: 30, dividend: 1 },
      { userId: "b", teamId: "t1", invested: 70, dividend: 4 },
    ]);
  });

  it("returns no dividends when there are no investments at all", () => {
    const team = baseTeam({ sales: [{ userId: "x", amount: 100 }] });
    expect(computeDividends(team)).toEqual([]);
  });
});

describe("scoreGame netSales / roi", () => {
  it("computes netSales = grossSales - dividendsPaid", () => {
    const config = defaultConfig();
    const team = baseTeam({
      revenueShare: 20,
      investments: [{ userId: "a", amount: 100, selfFunded: false }],
      sales: [{ userId: "x", amount: 50 }],
    });
    const wallets: MemberWallet[] = team.memberIds.map((userId) => ({
      userId,
      teamId: "t1",
      seedLeft: 0,
      buyLeft: 0,
      shieldUsed: false,
    }));
    const out = scoreGame(config, [team], wallets);
    const res = out.teams[0];
    // pool = 50*0.2=10, dividend = floor(10 * 100/100)=10
    expect(res.dividendsPaid).toBe(10);
    expect(res.grossSales).toBe(50);
    expect(res.netSales).toBe(40);
  });

  it("computes investorRoi as dividendsPaid/externalCapital, 0 when no capital", () => {
    const config = defaultConfig();
    const teamWithCapital = baseTeam({
      teamId: "t1",
      revenueShare: 50,
      investments: [{ userId: "a", amount: 40, selfFunded: false }],
      sales: [{ userId: "x", amount: 40 }],
    });
    const teamNoCapital = baseTeam({ teamId: "t2", memberIds: ["v1"], sales: [] });
    const wallets: MemberWallet[] = [
      { userId: "u1", teamId: "t1", seedLeft: 0, buyLeft: 0, shieldUsed: false },
      { userId: "u2", teamId: "t1", seedLeft: 0, buyLeft: 0, shieldUsed: false },
      { userId: "u3", teamId: "t1", seedLeft: 0, buyLeft: 0, shieldUsed: false },
      { userId: "v1", teamId: "t2", seedLeft: 0, buyLeft: 0, shieldUsed: false },
    ];
    const out = scoreGame(config, [teamWithCapital, teamNoCapital], wallets);
    const t1 = out.teams.find((t) => t.teamId === "t1")!;
    const t2 = out.teams.find((t) => t.teamId === "t2")!;
    // dividend = floor(40*0.5 * 40/40) = 20; roi = 20/40 = 0.5
    expect(t1.investorRoi).toBe(0.5);
    expect(t2.investorRoi).toBe(0);
  });
});

describe("unspentPenalty", () => {
  const config: EconomyConfig = { ...defaultConfig(), penaltyPerCoin: 1.5 };

  it("penalizes leftover seed+buy coins", () => {
    const wallets: MemberWallet[] = [
      { userId: "u1", teamId: "t1", seedLeft: 10, buyLeft: 20, shieldUsed: false },
    ];
    // leftover = 30, penalty = 1.5*30 = 45
    expect(unspentPenalty(config, wallets)).toBe(45);
  });

  it("shield exempts up to 10 coins from penalty", () => {
    const wallets: MemberWallet[] = [
      { userId: "u1", teamId: "t1", seedLeft: 10, buyLeft: 20, shieldUsed: true },
    ];
    // leftover = 30, shielded = min(10,30)=10, penalized = 20, penalty=30
    expect(unspentPenalty(config, wallets)).toBe(30);
  });

  it("shield does not exceed actual leftover when leftover < 10", () => {
    const wallets: MemberWallet[] = [
      { userId: "u1", teamId: "t1", seedLeft: 2, buyLeft: 3, shieldUsed: true },
    ];
    // leftover = 5, shielded = min(10,5)=5, penalized=0
    expect(unspentPenalty(config, wallets)).toBe(0);
  });

  it("sums penalty across multiple members", () => {
    const wallets: MemberWallet[] = [
      { userId: "u1", teamId: "t1", seedLeft: 10, buyLeft: 0, shieldUsed: false },
      { userId: "u2", teamId: "t1", seedLeft: 5, buyLeft: 5, shieldUsed: true },
    ];
    // u1: leftover=10, penalty coins=10
    // u2: leftover=10, shielded=10, penalty coins=0
    // total coins=10, penalty = 15
    expect(unspentPenalty(config, wallets)).toBe(15);
  });
});

describe("scoreGame normalization and ranking", () => {
  it("normalizes each metric against the best team and ranks by total desc", () => {
    const config = defaultConfig();
    const teamA = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      revenueShare: 20,
      investments: [{ userId: "inv", amount: 40, selfFunded: false }],
      sales: [{ userId: "x", amount: 100 }],
      hearts: 10,
      juryQuality: 90,
      juryTeaser: 80,
    });
    const teamB = baseTeam({
      teamId: "B",
      memberIds: ["b1"],
      revenueShare: 20,
      investments: [],
      sales: [{ userId: "y", amount: 10 }],
      hearts: 1,
      juryQuality: 10,
      juryTeaser: 5,
    });
    const wallets: MemberWallet[] = [
      { userId: "a1", teamId: "A", seedLeft: 0, buyLeft: 0, shieldUsed: false },
      { userId: "b1", teamId: "B", seedLeft: 0, buyLeft: 0, shieldUsed: false },
    ];
    const out = scoreGame(config, [teamA, teamB], wallets);
    const a = out.teams.find((t) => t.teamId === "A")!;
    const b = out.teams.find((t) => t.teamId === "B")!;
    // team A dominates every metric -> its pts.sales should equal full weight
    expect(a.pts.sales).toBeCloseTo(config.weights.sales, 5);
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(2);
    expect(a.total).toBeGreaterThan(b.total);
  });

  it("gives zero pts for a metric when the max across teams is zero", () => {
    const config = defaultConfig();
    const teamA = baseTeam({ teamId: "A", memberIds: ["a1"], sales: [], investments: [] });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], sales: [], investments: [] });
    const wallets: MemberWallet[] = [
      { userId: "a1", teamId: "A", seedLeft: 0, buyLeft: 0, shieldUsed: false },
      { userId: "b1", teamId: "B", seedLeft: 0, buyLeft: 0, shieldUsed: false },
    ];
    const out = scoreGame(config, [teamA, teamB], wallets);
    for (const t of out.teams) {
      expect(t.pts.sales).toBe(0);
      expect(t.pts.capital).toBe(0);
      expect(t.pts.roi).toBe(0);
    }
  });

  it("breaks ties by netSales desc when total is equal", () => {
    const config: EconomyConfig = {
      ...defaultConfig(),
      weights: { sales: 0, quality: 0, capital: 0, roi: 0, teaser: 0, community: 0 },
    };
    const teamA = baseTeam({ teamId: "A", memberIds: ["a1"], sales: [{ userId: "x", amount: 50 }] });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], sales: [{ userId: "y", amount: 20 }] });
    const wallets: MemberWallet[] = [
      { userId: "a1", teamId: "A", seedLeft: 0, buyLeft: 0, shieldUsed: false },
      { userId: "b1", teamId: "B", seedLeft: 0, buyLeft: 0, shieldUsed: false },
    ];
    const out = scoreGame(config, [teamA, teamB], wallets);
    // both totals are 0 (all weights zero), tie-break by netSales desc
    expect(out.teams[0].teamId).toBe("A");
    expect(out.teams[0].rank).toBe(1);
    expect(out.teams[1].teamId).toBe("B");
    expect(out.teams[1].rank).toBe(2);
  });

  it("floors total at zero when penalty exceeds points", () => {
    const config = defaultConfig();
    const team = baseTeam({ teamId: "A", memberIds: ["a1"] });
    const wallets: MemberWallet[] = [
      { userId: "a1", teamId: "A", seedLeft: 100, buyLeft: 100, shieldUsed: false },
    ];
    const out = scoreGame(config, [team], wallets);
    expect(out.teams[0].total).toBe(0);
  });
});

describe("validateInvestment", () => {
  it("rejects amounts exceeding wallet balance", () => {
    const res = validateInvestment({ amount: 50, alreadyOnTarget: 0, walletLeft: 30, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: false, error: "موجودی کیف بذر کافی نیست" });
  });

  it("rejects amounts exceeding max per target", () => {
    const res = validateInvestment({ amount: 20, alreadyOnTarget: 25, walletLeft: 100, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: false, error: "سقف سرمایه‌گذاری روی هر ایده ۴۰ سکه است" });
  });

  it("accepts a valid investment", () => {
    const res = validateInvestment({ amount: 20, alreadyOnTarget: 10, walletLeft: 50, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: true });
  });

  it("rejects non-positive amounts", () => {
    expect(validateInvestment({ amount: 0, alreadyOnTarget: 0, walletLeft: 50, maxPerTarget: 40, isOwnTeam: false }).ok).toBe(false);
  });
});

describe("validatePurchase", () => {
  it("rejects buying from your own team", () => {
    const res = validatePurchase({ amount: 10, alreadyOnTarget: 0, walletLeft: 50, maxPerTarget: 40, isOwnTeam: true });
    expect(res).toEqual({ ok: false, error: "نمی‌توانی از تیم خودت بخری" });
  });

  it("rejects amounts exceeding buy wallet balance", () => {
    const res = validatePurchase({ amount: 50, alreadyOnTarget: 0, walletLeft: 30, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: false, error: "موجودی کیف خرید کافی نیست" });
  });

  it("accepts a valid purchase", () => {
    const res = validatePurchase({ amount: 10, alreadyOnTarget: 5, walletLeft: 50, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: true });
  });
});

describe("auction helpers", () => {
  it("nextMinBid returns startPrice when no current bid", () => {
    expect(nextMinBid(null, 20, 2)).toBe(20);
  });

  it("nextMinBid returns currentHighest + increment", () => {
    expect(nextMinBid(30, 20, 2)).toBe(32);
  });

  it("shouldExtendAuction is true within the anti-snipe window", () => {
    const now = 1_000_000;
    const endsAt = now + 15_000; // 15s left
    expect(shouldExtendAuction(now, endsAt, 30)).toBe(true);
  });

  it("shouldExtendAuction is false outside the anti-snipe window", () => {
    const now = 1_000_000;
    const endsAt = now + 45_000; // 45s left
    expect(shouldExtendAuction(now, endsAt, 30)).toBe(false);
  });

  it("nextMinBid allows the first bid to equal the start price", () => {
    expect(nextMinBid(null, 20, 5)).toBe(20);
    expect(nextMinBid(20, 20, 5)).toBe(25);
  });

  it("shouldExtendAuction is true exactly at the window boundary", () => {
    const now = 1_000_000;
    expect(shouldExtendAuction(now, now + 30_000, 30)).toBe(true);
    expect(shouldExtendAuction(now, now + 30_001, 30)).toBe(false);
  });

  it("shouldExtendAuction is false at exactly zero remaining time", () => {
    const now = 1_000_000;
    expect(shouldExtendAuction(now, now, 30)).toBe(false);
  });

  it("shouldExtendAuction is false after the auction already ended", () => {
    const now = 1_000_000;
    const endsAt = now - 1_000; // already ended
    expect(shouldExtendAuction(now, endsAt, 30)).toBe(false);
  });
});

describe("defaultConfig", () => {
  it("builds config from constants", () => {
    const config = defaultConfig();
    expect(config.seedWallet).toBe(100);
    expect(config.buyWallet).toBe(100);
    expect(config.maxPerTarget).toBe(40);
    expect(config.weights.sales).toBe(350);
  });
});

// ---------- قراردادهایی که تسویهٔ نهایی (settleGame) به آن‌ها تکیه می‌کند ----------
describe("settlement contract", () => {
  it("exposes one dividend line per external investor per team", () => {
    const out = scoreGame(defaultConfig(), [
      baseTeam({
        teamId: "tA",
        revenueShare: 50,
        investments: [
          { userId: "b1", amount: 40, selfFunded: false },
          { userId: "b1", amount: 20, selfFunded: false },
          { userId: "a2", amount: 10, selfFunded: true },
        ],
        sales: [{ userId: "b1", amount: 50 }],
      }),
    ], []);

    expect(out.dividends).toHaveLength(1);
    expect(out.dividends[0]).toMatchObject({ userId: "b1", teamId: "tA", invested: 60 });
    // استخر = ۵۰ × ۵۰٪ = ۲۵ و تنها سهام‌دار خارجی همه را می‌گیرد
    expect(out.dividends[0].dividend).toBe(25);
  });

  it("never pays more than the revenue-share pool and matches team dividendsPaid", () => {
    const out = scoreGame(defaultConfig(), [
      baseTeam({
        teamId: "tA",
        revenueShare: 30,
        investments: [
          { userId: "x", amount: 33, selfFunded: false },
          { userId: "y", amount: 67, selfFunded: false },
        ],
        sales: [{ userId: "z", amount: 77 }],
      }),
    ], []);

    const paid = out.dividends.reduce((a, d) => a + d.dividend, 0);
    expect(paid).toBeLessThanOrEqual(77 * 0.3);
    expect(paid).toBe(out.teams[0].dividendsPaid);
    expect(out.teams[0].netSales).toBe(77 - paid);
  });

  it("gives no dividend line when a team only has self-funded capital", () => {
    const out = scoreGame(defaultConfig(), [
      baseTeam({ teamId: "tS", investments: [{ userId: "s", amount: 50, selfFunded: true }], sales: [{ userId: "z", amount: 40 }] }),
    ], []);
    expect(out.dividends).toHaveLength(0);
    expect(out.teams[0].dividendsPaid).toBe(0);
    expect(out.teams[0].externalCapital).toBe(0);
  });

  it("unspent penalty grows if dividends are credited before scoring (why order matters)", () => {
    const config = defaultConfig();
    const beforePay: MemberWallet[] = [{ userId: "b1", teamId: "tB", seedLeft: 0, buyLeft: 10, shieldUsed: false }];
    const afterPay: MemberWallet[] = [{ userId: "b1", teamId: "tB", seedLeft: 0, buyLeft: 10 + 25, shieldUsed: false }];
    expect(unspentPenalty(config, beforePay)).toBeLessThan(unspentPenalty(config, afterPay));
    expect(unspentPenalty(config, beforePay)).toBe(config.penaltyPerCoin * 10);
  });
});
