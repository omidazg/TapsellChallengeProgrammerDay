import { describe, expect, it } from "vitest";
import {
  bargainDiscountFor,
  computeDividends,
  defaultConfig,
  effectivePurchaseCap,
  maxSpendable,
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

/** کیف‌پول امتیازدهی با مقادیر پیش‌فرض بی‌اثر (چیزی خرج‌نشده و خرج‌شدنی هم نیست). */
function wallet(overrides: Partial<MemberWallet> & { userId: string; teamId: string | null }): MemberWallet {
  return {
    seedLeft: 0,
    buyLeft: 0,
    seedSpendable: 0,
    buySpendable: 0,
    hasShield: false,
    ...overrides,
  };
}

const NO_SHIELD = new Set<string>();

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
    const lines = computeDividends(team, 0.5, NO_SHIELD);
    expect(lines).toEqual([
      { userId: "a", teamId: "t1", invested: 30, dividend: 1, portfolioCredit: 1 },
      { userId: "b", teamId: "t1", invested: 70, dividend: 4, portfolioCredit: 4 },
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
    const lines = computeDividends(team, 0.5, NO_SHIELD);
    // externalCapital = 20 only (self-funded excluded from denominator)
    // pool = 100 * 0.5 = 50; ext dividend = floor(50 * 20/20) = 50
    expect(lines).toEqual([{ userId: "ext", teamId: "t1", invested: 20, dividend: 50, portfolioCredit: 50 }]);
  });

  it("returns no dividends when externalCapital is zero", () => {
    const team = baseTeam({
      investments: [{ userId: "owner", amount: 40, selfFunded: true }],
      sales: [{ userId: "x", amount: 100 }],
    });
    expect(computeDividends(team, 0.5, NO_SHIELD)).toEqual([]);
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
    const lines = computeDividends(team, 0.5, NO_SHIELD);
    expect(lines).toEqual([
      { userId: "a", teamId: "t1", invested: 30, dividend: 1, portfolioCredit: 1 },
      { userId: "b", teamId: "t1", invested: 70, dividend: 4, portfolioCredit: 4 },
    ]);
  });

  it("returns no dividends when there are no investments at all", () => {
    const team = baseTeam({ sales: [{ userId: "x", amount: 100 }] });
    expect(computeDividends(team, 0.5, NO_SHIELD)).toEqual([]);
  });

  describe("shield floor on portfolioCredit", () => {
    it("raises portfolioCredit to floor(invested * shieldFloor) when dividend is lower", () => {
      const team = baseTeam({
        revenueShare: 10, // پول کوچک، سود واقعی کم می‌شود
        investments: [{ userId: "shielded", amount: 100, selfFunded: false }],
        sales: [{ userId: "x", amount: 10 }], // pool = 1, dividend = floor(1*100/100) = 1
      });
      const shielded = new Set(["shielded"]);
      const lines = computeDividends(team, 0.5, shielded);
      expect(lines[0].dividend).toBe(1); // سکهٔ واقعی پرداختی تغییر نکرده
      expect(lines[0].portfolioCredit).toBe(50); // floor(100 * 0.5) > dividend
    });

    it("keeps portfolioCredit = dividend when dividend already exceeds the shield floor", () => {
      const team = baseTeam({
        revenueShare: 100,
        investments: [{ userId: "shielded", amount: 40, selfFunded: false }],
        sales: [{ userId: "x", amount: 100 }], // pool=100, dividend = floor(100*40/40) = 100
      });
      const shielded = new Set(["shielded"]);
      const lines = computeDividends(team, 0.5, shielded);
      expect(lines[0].dividend).toBe(100);
      expect(lines[0].portfolioCredit).toBe(100); // max(100, floor(40*0.5)=20) = 100
    });

    it("does not affect investors without the shield", () => {
      const team = baseTeam({
        revenueShare: 10,
        investments: [{ userId: "plain", amount: 100, selfFunded: false }],
        sales: [{ userId: "x", amount: 10 }],
      });
      const lines = computeDividends(team, 0.5, NO_SHIELD);
      expect(lines[0].dividend).toBe(1);
      expect(lines[0].portfolioCredit).toBe(1); // بدون سپر، برابر dividend می‌ماند
    });
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
    const wallets: MemberWallet[] = team.memberIds.map((userId) => wallet({ userId, teamId: "t1" }));
    const out = scoreGame(config, [team], wallets);
    const res = out.teams[0];
    // pool = 50*0.2=10, dividend = floor(10 * 100/100)=10
    expect(res.dividendsPaid).toBe(10);
    expect(res.grossSales).toBe(50);
    expect(res.netSales).toBe(40);
  });

  it("computes investorRoi as dividendsPaid/(externalCapital + roiSmoothing)", () => {
    const config: EconomyConfig = { ...defaultConfig(), roiSmoothing: 20 };
    const teamWithCapital = baseTeam({
      teamId: "t1",
      revenueShare: 50,
      investments: [{ userId: "a", amount: 40, selfFunded: false }],
      sales: [{ userId: "x", amount: 40 }],
    });
    const teamNoCapital = baseTeam({ teamId: "t2", memberIds: ["v1"], sales: [] });
    const wallets: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1" }),
      wallet({ userId: "u2", teamId: "t1" }),
      wallet({ userId: "u3", teamId: "t1" }),
      wallet({ userId: "v1", teamId: "t2" }),
    ];
    const out = scoreGame(config, [teamWithCapital, teamNoCapital], wallets);
    const t1 = out.teams.find((t) => t.teamId === "t1")!;
    const t2 = out.teams.find((t) => t.teamId === "t2")!;
    // dividend = floor(40*0.5 * 40/40) = 20; roi = 20/(40+20) = 1/3
    expect(t1.investorRoi).toBeCloseTo(20 / 60, 10);
    // بدون سرمایه: dividendsPaid=0, externalCapital=0 → 0/(0+20)=0 (نه undefined/NaN)
    expect(t2.investorRoi).toBe(0);
  });

  it("smooths ROI down for small external capital (roiSmoothing acts as a floor on the denominator)", () => {
    const smallSmoothing: EconomyConfig = { ...defaultConfig(), roiSmoothing: 1 };
    const bigSmoothing: EconomyConfig = { ...defaultConfig(), roiSmoothing: 1000 };
    const team = baseTeam({
      revenueShare: 100,
      investments: [{ userId: "a", amount: 5, selfFunded: false }],
      sales: [{ userId: "x", amount: 5 }],
    });
    const wallets: MemberWallet[] = team.memberIds.map((userId) => wallet({ userId, teamId: "t1" }));
    const roiSmall = scoreGame(smallSmoothing, [team], wallets).teams[0].investorRoi;
    const roiBig = scoreGame(bigSmoothing, [team], wallets).teams[0].investorRoi;
    // dividend = floor(5*1*5/5) = 5؛ هموارسازی بزرگ‌تر → ROI کوچک‌تر
    expect(roiSmall).toBeGreaterThan(roiBig);
    expect(roiSmall).toBeCloseTo(5 / (5 + 1), 10);
    expect(roiBig).toBeCloseTo(5 / (5 + 1000), 10);
  });
});

describe("unspentPenalty (فقط روی سکهٔ خرج‌شدنی)", () => {
  const config: EconomyConfig = { ...defaultConfig(), penaltyPerCoin: 1.5 };

  it("penalizes min(left, spendable) per wallet, summed for seed+buy", () => {
    const wallets: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 10, buySpendable: 100, seedSpendable: 100, buyLeft: 20 }),
    ];
    // min(10,100)+min(20,100) = 30, penalty = 1.5*30 = 45
    expect(unspentPenalty(config, wallets)).toBe(45);
  });

  it("does not penalize coins that could not have been spent (spendable caps the penalty)", () => {
    const wallets: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 50, seedSpendable: 10, buyLeft: 50, buySpendable: 5 }),
    ];
    // min(50,10)+min(50,5) = 15, penalty = 1.5*15 = 22.5
    expect(unspentPenalty(config, wallets)).toBe(22.5);
  });

  it("penalty is zero when seedSpendable is zero even with a full seed wallet", () => {
    const wallets: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 100, seedSpendable: 0, buyLeft: 0, buySpendable: 0 }),
    ];
    expect(unspentPenalty(config, wallets)).toBe(0);
  });

  it("penalty is zero when buySpendable is zero even with a full buy wallet", () => {
    const wallets: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 0, seedSpendable: 0, buyLeft: 100, buySpendable: 0 }),
    ];
    expect(unspentPenalty(config, wallets)).toBe(0);
  });

  it("no longer exempts a flat 10 coins for shield (hasShield no longer affects penalty)", () => {
    const withShield: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 10, seedSpendable: 10, buyLeft: 20, buySpendable: 20, hasShield: true }),
    ];
    const withoutShield: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 10, seedSpendable: 10, buyLeft: 20, buySpendable: 20, hasShield: false }),
    ];
    expect(unspentPenalty(config, withShield)).toBe(unspentPenalty(config, withoutShield));
    expect(unspentPenalty(config, withShield)).toBe(1.5 * 30);
  });

  it("sums penalty across multiple members", () => {
    const wallets: MemberWallet[] = [
      wallet({ userId: "u1", teamId: "t1", seedLeft: 10, seedSpendable: 10, buyLeft: 0, buySpendable: 0 }),
      wallet({ userId: "u2", teamId: "t1", seedLeft: 5, seedSpendable: 5, buyLeft: 5, buySpendable: 5 }),
    ];
    // u1: 10, u2: 10 → total coins=20, penalty = 30
    expect(unspentPenalty(config, wallets)).toBe(30);
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
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" }), wallet({ userId: "b1", teamId: "B" })];
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
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" }), wallet({ userId: "b1", teamId: "B" })];
    const out = scoreGame(config, [teamA, teamB], wallets);
    for (const t of out.teams) {
      expect(t.pts.sales).toBe(0);
      expect(t.pts.capital).toBe(0);
      expect(t.pts.roi).toBe(0);
      expect(t.pts.portfolio).toBe(0);
      expect(t.pts.taste).toBe(0);
    }
  });

  it("breaks ties by netSales desc when total is equal", () => {
    const config: EconomyConfig = {
      ...defaultConfig(),
      weights: { sales: 0, quality: 0, capital: 0, roi: 0, teaser: 0, community: 0, portfolio: 0, taste: 0 },
    };
    const teamA = baseTeam({ teamId: "A", memberIds: ["a1"], sales: [{ userId: "x", amount: 50 }] });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], sales: [{ userId: "y", amount: 20 }] });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" }), wallet({ userId: "b1", teamId: "B" })];
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
      wallet({ userId: "a1", teamId: "A", seedLeft: 100, seedSpendable: 100, buyLeft: 100, buySpendable: 100 }),
    ];
    const out = scoreGame(config, [team], wallets);
    expect(out.teams[0].total).toBe(0);
  });
});

describe("portfolio (پرتفوی سرمایه‌گذاری اعضا در تیم‌های دیگر)", () => {
  it("credits the investor's own team, not the team that raised the capital", () => {
    const config = defaultConfig();
    // b1 (عضو تیم B) روی ایدهٔ A سرمایه‌گذاری می‌کند
    const teamA = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      revenueShare: 50,
      investments: [{ userId: "b1", amount: 40, selfFunded: false }],
      sales: [{ userId: "x", amount: 100 }], // pool=50, dividend=floor(50*40/40)=50
    });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], investments: [], sales: [] });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" }), wallet({ userId: "b1", teamId: "B" })];
    const out = scoreGame(config, [teamA, teamB], wallets);
    const a = out.teams.find((t) => t.teamId === "A")!;
    const b = out.teams.find((t) => t.teamId === "B")!;
    expect(a.portfolio).toBe(0); // تیمی که سرمایه گرفته، پرتفوی نمی‌گیرد
    expect(b.portfolio).toBe(50); // تیم سرمایه‌گذار پرتفوی می‌گیرد
  });

  it("uses portfolioCredit (shield floor), not the raw dividend, for shielded investors", () => {
    const config = defaultConfig();
    const teamA = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      revenueShare: 10,
      investments: [{ userId: "b1", amount: 100, selfFunded: false }],
      sales: [{ userId: "x", amount: 10 }], // pool=1, dividend=1
    });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], investments: [], sales: [] });
    const wallets: MemberWallet[] = [
      wallet({ userId: "a1", teamId: "A" }),
      wallet({ userId: "b1", teamId: "B", hasShield: true }),
    ];
    const out = scoreGame(config, [teamA, teamB], wallets);
    const b = out.teams.find((t) => t.teamId === "B")!;
    // portfolioCredit = max(1, floor(100*0.5)) = 50 (نه dividend خام = ۱)
    expect(b.portfolio).toBe(50);
  });

  it("investing in your own team never contributes to portfolio (selfFunded is excluded upstream)", () => {
    const config = defaultConfig();
    const teamA = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      revenueShare: 50,
      investments: [{ userId: "a1", amount: 40, selfFunded: true }],
      sales: [{ userId: "x", amount: 100 }],
    });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" })];
    const out = scoreGame(config, [teamA], wallets);
    expect(out.teams[0].portfolio).toBe(0);
  });
});

describe("taste (خرید اعضا از محصولات باکیفیت تیم‌های دیگر)", () => {
  it("credits the buyer's team with amount * seller quality / 100", () => {
    const config = defaultConfig();
    // b1 (عضو B) از محصول A با کیفیت ۸۰ به مبلغ ۵۰ می‌خرد
    const teamA = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      sales: [{ userId: "b1", amount: 50 }],
      juryQuality: 80,
    });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], sales: [] });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" }), wallet({ userId: "b1", teamId: "B" })];
    const out = scoreGame(config, [teamA, teamB], wallets);
    const b = out.teams.find((t) => t.teamId === "B")!;
    const a = out.teams.find((t) => t.teamId === "A")!;
    expect(b.taste).toBeCloseTo((50 * 80) / 100, 10); // = 40
    expect(a.taste).toBe(0); // فروشنده خودش سلیقه نمی‌گیرد
  });

  it("a purchase from your own team's product does not count toward taste", () => {
    const config = defaultConfig();
    const teamA = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      sales: [{ userId: "a1", amount: 50 }], // خرید از تیم خودش (در عمل validatePurchase این را رد می‌کند)
      juryQuality: 80,
    });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" })];
    const out = scoreGame(config, [teamA], wallets);
    expect(out.teams[0].taste).toBe(0);
  });

  it("falls back to aiQuality when there is no jury quality", () => {
    const config = defaultConfig();
    const teamA = baseTeam({ teamId: "A", memberIds: ["a1"], sales: [{ userId: "b1", amount: 20 }], juryQuality: null, aiQuality: 50 });
    const teamB = baseTeam({ teamId: "B", memberIds: ["b1"], sales: [] });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" }), wallet({ userId: "b1", teamId: "B" })];
    const out = scoreGame(config, [teamA, teamB], wallets);
    const b = out.teams.find((t) => t.teamId === "B")!;
    expect(b.taste).toBeCloseTo((20 * 50) / 100, 10); // = 10
  });
});

describe("community points", () => {
  it("uses config.community.uniqueBuyer/heart instead of hardcoded values", () => {
    const config: EconomyConfig = { ...defaultConfig(), community: { uniqueBuyer: 15, heart: 5 } };
    const team = baseTeam({
      teamId: "A",
      memberIds: ["a1"],
      sales: [
        { userId: "x", amount: 10 },
        { userId: "y", amount: 10 },
      ], // 2 unique buyers
      hearts: 4,
    });
    const wallets: MemberWallet[] = [wallet({ userId: "a1", teamId: "A" })];
    const out = scoreGame(config, [team], wallets);
    // community metric = 2*15 + 4*5 = 50; only team, so it captures full weight
    expect(out.teams[0].pts.community).toBeCloseTo(config.weights.community, 10);
  });
});

describe("defaultConfig", () => {
  it("builds config from constants, including the new fields", () => {
    const config = defaultConfig();
    expect(config.seedWallet).toBe(100);
    expect(config.buyWallet).toBe(100);
    expect(config.maxPerTarget).toBe(40);
    expect(config.roiSmoothing).toBe(20);
    expect(config.shieldFloor).toBe(0.5);
    expect(config.community).toEqual({ uniqueBuyer: 15, heart: 5 });
    expect(config.weights.portfolio).toBe(100);
    expect(config.weights.taste).toBe(50);
  });

  it("weights sum to 1000", () => {
    const { weights } = defaultConfig();
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(total).toBe(1000);
  });
});

describe("validateInvestment", () => {
  it("rejects self-funding unconditionally, before any other check", () => {
    const res = validateInvestment({ amount: 20, alreadyOnTarget: 0, walletLeft: 100, maxPerTarget: 40, isOwnTeam: true });
    expect(res).toEqual({ ok: false, error: "نمی‌توانی روی ایدهٔ تیم خودت سرمایه‌گذاری کنی" });
  });

  it("rejects self-funding even when amount/wallet/cap would otherwise be invalid too", () => {
    // isOwnTeam باید همیشه اول بررسی شود، حتی وقتی amount هم نامعتبر است
    const res = validateInvestment({ amount: -5, alreadyOnTarget: 0, walletLeft: 100, maxPerTarget: 40, isOwnTeam: true });
    expect(res).toEqual({ ok: false, error: "نمی‌توانی روی ایدهٔ تیم خودت سرمایه‌گذاری کنی" });
  });

  it("rejects amounts exceeding wallet balance", () => {
    const res = validateInvestment({ amount: 50, alreadyOnTarget: 0, walletLeft: 30, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: false, error: "موجودی کیف بذر کافی نیست" });
  });

  it("rejects amounts exceeding max per target", () => {
    const res = validateInvestment({ amount: 20, alreadyOnTarget: 25, walletLeft: 100, maxPerTarget: 40, isOwnTeam: false });
    expect(res).toEqual({ ok: false, error: "سقف سرمایه‌گذاری روی هر ایده ۴۰ سکه است" });
  });

  it("accepts a valid investment on another team's idea", () => {
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

describe("bargainDiscountFor", () => {
  it("is always 0 for price <= 1", () => {
    expect(bargainDiscountFor(1, 0.15)).toBe(0);
    expect(bargainDiscountFor(0, 0.15)).toBe(0);
  });

  it("matches the exact formula for every price from 2 to 9 at the game's default 15% rate", () => {
    for (let price = 2; price <= 9; price++) {
      const expected = Math.min(price - 1, Math.max(1, Math.round(price * 0.15)));
      expect(bargainDiscountFor(price, 0.15)).toBe(expected);
      // در این بازهٔ قیمت (۲..۹) با نرخ ۱۵٪، تخفیف همیشه دقیقاً ۱ سکه است
      expect(bargainDiscountFor(price, 0.15)).toBe(1);
    }
  });

  it("never discounts the full price away (always leaves at least 1 coin for the buyer to pay)", () => {
    for (let price = 1; price <= 50; price++) {
      expect(bargainDiscountFor(price, 0.15)).toBeLessThan(price);
    }
  });

  it("grows past 1 coin once the price is high enough (price=10 -> 2 at 15%)", () => {
    expect(bargainDiscountFor(10, 0.15)).toBe(2);
  });
});

describe("effectivePurchaseCap", () => {
  it("uses maxPerTarget when it is already >= price", () => {
    expect(effectivePurchaseCap(40, 20)).toBe(40);
  });

  it("uses price when maxPerTarget would make the product unbuyable (at least one unit always fits)", () => {
    expect(effectivePurchaseCap(10, 40)).toBe(40);
  });

  it("equals price when maxPerTarget equals price", () => {
    expect(effectivePurchaseCap(20, 20)).toBe(20);
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
    expect(out.dividends[0].portfolioCredit).toBe(25); // بدون سپر، برابر dividend
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
    const beforePay: MemberWallet[] = [wallet({ userId: "b1", teamId: "tB", buyLeft: 10, buySpendable: 10 })];
    const afterPay: MemberWallet[] = [wallet({ userId: "b1", teamId: "tB", buyLeft: 10 + 25, buySpendable: 10 + 25 })];
    expect(unspentPenalty(config, beforePay)).toBeLessThan(unspentPenalty(config, afterPay));
    expect(unspentPenalty(config, beforePay)).toBe(config.penaltyPerCoin * 10);
  });
});

describe("maxSpendable (کیف خرید بخش‌پذیر نیست)", () => {
  it("سکهٔ کمتر از ارزان‌ترین واحد خرج‌شدنی نیست", () => {
    expect(maxSpendable(7, [{ cost: 10, count: 4 }])).toBe(0);
  });
  it("ترکیب واحدها را بهینه پر می‌کند، نه حریصانه", () => {
    // ۱۲+۱۲ = ۲۴ از ۲۵؛ حریصانه (۲۰) فقط ۲۰ می‌داد
    expect(maxSpendable(25, [{ cost: 20, count: 1 }, { cost: 12, count: 2 }])).toBe(24);
  });
  it("به تعداد واحد مجاز هر محصول احترام می‌گذارد", () => {
    expect(maxSpendable(100, [{ cost: 10, count: 3 }])).toBe(30);
  });
  it("هرگز از بودجه بیشتر نمی‌شود", () => {
    expect(maxSpendable(35, [{ cost: 5, count: 100 }])).toBe(35);
    expect(maxSpendable(0, [{ cost: 5, count: 100 }])).toBe(0);
  });
});
