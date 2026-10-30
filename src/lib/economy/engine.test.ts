import { describe, expect, it } from "vitest";
import { DEFAULTS, SCORE_WEIGHTS } from "@/lib/constants";
import { DEFAULT_JURY_CRITERIA, DEFAULT_WEIGHTS, NO_BAZAAR_WEIGHTS, entryCategory, parseCriteria, parseWeights, type TrackWeights } from "@/lib/tracks";
import {
  compareRank,
  defaultConfig,
  juryRawScore,
  logRatio,
  nextMinBid,
  peopleSupport,
  scoreGame,
  shouldExtendAuction,
  validateInvestment,
  validatePurchase,
} from "./engine";
import { entryKey, type EconomyConfig, type MarketStats, type TeamInput, type TeamResult } from "./types";

/** تیم سه‌نفرهٔ پیش‌فرض در محور عمومی بدون هیچ داده‌ای (نه داوری، نه حمایت، نه هوش مصنوعی، نه آمار) */
function team(overrides: Partial<TeamInput> & { teamId: string }): TeamInput {
  const { teamId } = overrides;
  return {
    trackId: "general",
    category: "",
    productId: `p-${teamId}`,
    productName: `محصول ${teamId}`,
    memberIds: [`${teamId}-m1`, `${teamId}-m2`, `${teamId}-m3`],
    supports: [],
    juryRaw: null,
    aiQuality: null,
    stats: null,
    cheatPenalty: 0,
    ...overrides,
  };
}

function stats(o: Partial<MarketStats> = {}): MarketStats {
  return { activeInstalls: 0, revenueToman: 0, rating: null, commentCount: 0, flagged: false, ...o };
}

/** n حامی متفاوت که هر کدام `amount` سکه داده‌اند */
function supporters(prefix: string, n: number, amount: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `${prefix}${i}`, amount }));
}

function byId(teams: TeamResult[], teamId: string, trackId = "general"): TeamResult {
  const t = teams.find((x) => x.teamId === teamId && x.trackId === trackId);
  if (!t) throw new Error(`entry ${teamId}:${trackId} not in output`);
  return t;
}

/** وزن ساده برای تست‌های تساوی: کل بازار فقط حمایت است و عددها گرد می‌مانند (۵۰۰/۳۰۰/۲۰۰) */
const ROUND_WEIGHTS: TrackWeights = {
  ai: 20,
  market: 30,
  jury: 50,
  marketSub: { support: 100, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 },
};
const roundConfig = (): EconomyConfig => ({ ...defaultConfig(), trackWeights: { general: ROUND_WEIGHTS } });

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------

describe("defaultConfig و وزن‌های پیش‌فرض", () => {
  it("از DEFAULTS ساخته می‌شود و وزن هر محور از خود محور می‌آید", () => {
    expect(defaultConfig()).toEqual({
      supportCap: DEFAULTS.supportCap,
      trackWeights: {},
      ratingMinComments: DEFAULTS.ratingMinComments,
    });
    expect(defaultConfig().supportCap).toBe(50);
  });

  it("پیش‌فرض ۳۰٪ هوش مصنوعی، ۳۰٪ بازار (یک‌پنجم آن حمایت)، ۴۰٪ داوری است و با SCORE_WEIGHTS یکی است", () => {
    expect(DEFAULT_WEIGHTS).toMatchObject({ ai: 30, market: 30, jury: 40 });
    expect(DEFAULT_WEIGHTS.marketSub.support).toBe(20);
    expect(sum(DEFAULT_WEIGHTS.marketSub)).toBe(100);
    expect(SCORE_WEIGHTS).toEqual({ jury: DEFAULT_WEIGHTS.jury * 10, market: DEFAULT_WEIGHTS.market * 10, ai: DEFAULT_WEIGHTS.ai * 10 });
  });

  it("محور بدون بازار: آمار بازار بین هوش مصنوعی و داوری پخش می‌شود و فقط سهم حمایت می‌ماند", () => {
    expect(NO_BAZAAR_WEIGHTS.ai + NO_BAZAAR_WEIGHTS.market + NO_BAZAAR_WEIGHTS.jury).toBe(100);
    expect(NO_BAZAAR_WEIGHTS.market).toBe((DEFAULT_WEIGHTS.market * DEFAULT_WEIGHTS.marketSub.support) / 100);
    expect(NO_BAZAAR_WEIGHTS.marketSub).toEqual({ support: 100, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 });
  });
});

describe("parseWeights / parseCriteria / entryCategory", () => {
  it("وزن معتبر خوانده می‌شود و کمبودها با پیش‌فرض پر می‌شوند", () => {
    expect(parseWeights(JSON.stringify(NO_BAZAAR_WEIGHTS))).toEqual(NO_BAZAAR_WEIGHTS);
    const partial = parseWeights('{"ai": 10, "marketSub": {"support": 50}}');
    expect(partial.ai).toBe(10);
    expect(partial.jury).toBe(DEFAULT_WEIGHTS.jury);
    expect(partial.marketSub.support).toBe(50);
    expect(partial.marketSub.revenue).toBe(DEFAULT_WEIGHTS.marketSub.revenue);
  });

  it("JSON خراب، null، مقدار منفی یا غیرعددی به پیش‌فرض برمی‌گردد", () => {
    expect(parseWeights("{not json")).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights(null)).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights('{"ai": -5, "jury": "زیاد"}')).toEqual(DEFAULT_WEIGHTS);
    expect(parseWeights("{}", NO_BAZAAR_WEIGHTS)).toEqual(NO_BAZAAR_WEIGHTS);
  });

  it("معیارهای داوری: معتبرها نگه داشته می‌شوند و نبود یا خرابی آن‌ها پیش‌فرض است", () => {
    expect(parseCriteria('[{"key":"a","label":"الف"},{"key":"","label":"خالی"},{"label":"بی‌کلید"}]')).toEqual([{ key: "a", label: "الف" }]);
    expect(parseCriteria("[]")).toEqual(DEFAULT_JURY_CRITERIA);
    expect(parseCriteria("{bad")).toEqual(DEFAULT_JURY_CRITERIA);
    expect(parseCriteria(null)).toEqual(DEFAULT_JURY_CRITERIA);
  });

  it("دستهٔ ثبت: محور MIXED از انتخاب تیم، بقیه از خود محور", () => {
    expect(entryCategory("TECH", "NON_TECH")).toBe("TECH");
    expect(entryCategory("NON_TECH", "")).toBe("NON_TECH");
    expect(entryCategory("MIXED", "TECH")).toBe("TECH");
    expect(entryCategory("MIXED", "NON_TECH")).toBe("NON_TECH");
    expect(entryCategory("MIXED", "")).toBe("");
    expect(entryCategory("MIXED", undefined)).toBe("");
  });
});

describe("juryRawScore (میانگین معیارهای هر داور، سپس میانگین داورها × ۱۰)", () => {
  const KEYS = ["works", "value", "pitch"];

  it("میانگین معیارهای یک داور را به ۰..۱۰۰ می‌برد", () => {
    expect(juryRawScore([{ works: 8, value: 6, pitch: 10 }], KEYS)).toBe(80);
    expect(juryRawScore([{ works: 10, value: 10, pitch: 10 }], KEYS)).toBe(100);
  });

  it("چند داور مستقل میانگین می‌شوند، با وزن برابر برای هر داور", () => {
    // داور اول میانگین ۹، داور دوم میانگین ۵ → ۷۰
    expect(juryRawScore([{ works: 9, value: 9, pitch: 9 }, { works: 5, value: 5, pitch: 5 }], KEYS)).toBe(70);
    // داوری که فقط به یک معیار نمره داده هم یک رأی کامل دارد: (۱۰ + ۴) / ۲ × ۱۰
    expect(juryRawScore([{ works: 10 }, { works: 4, value: 4, pitch: 4 }], KEYS)).toBe(70);
  });

  it("داوری نشده (بدون داور، یا داور بدون نمره) null است، نه صفر", () => {
    expect(juryRawScore([], KEYS)).toBeNull();
    expect(juryRawScore([{}], KEYS)).toBeNull();
    expect(juryRawScore([{ works: null, value: "خوب" }], KEYS)).toBeNull();
  });

  it("داور بدون نمره در مخرج میانگین نمی‌آید", () => {
    expect(juryRawScore([{}, { works: 6, value: 6, pitch: 6 }], KEYS)).toBe(60);
  });

  it("نمرهٔ صفر «داده‌شده» است و صفر برمی‌گرداند", () => {
    expect(juryRawScore([{ works: 0, value: 0, pitch: 0 }], KEYS)).toBe(0);
  });

  it("فقط معیارهای نمره‌گرفته در میانگین حساب می‌شوند", () => {
    expect(juryRawScore([{ works: 7, pitch: 9 }], KEYS)).toBe(80);
  });

  it("معیاری که در فهرست معیارهای محور نیست نادیده گرفته می‌شود (معیارها برای هر محور جدا هستند)", () => {
    expect(juryRawScore([{ works: 10, old: 0 }], ["works"])).toBe(100);
    expect(juryRawScore([{ old: 10 }], ["story", "craft"])).toBeNull();
    expect(juryRawScore([{ story: 8, craft: 6, works: 0 }], ["story", "craft"])).toBe(70);
  });

  it("نمرهٔ بیرون از بازهٔ ۰..۱۰ بریده می‌شود", () => {
    expect(juryRawScore([{ works: 15, value: 10, pitch: 10 }], KEYS)).toBe(100);
    expect(juryRawScore([{ works: -5, value: 0, pitch: 0 }], KEYS)).toBe(0);
  });
});

describe("peopleSupport (حمایت مردمی درجه‌دو)", () => {
  it("(Σ √min(سکهٔ هر نفر، سقف))²", () => {
    // ۴ نفر × ۲۵ سکه → (۴ × ۵)² = ۴۰۰
    const r = peopleSupport(supporters("s", 4, 25), 50);
    expect(r.score).toBe(400);
    expect(r.supporters).toBe(4);
    expect(r.coins).toBe(100);
  });

  it("شعار بازی: ۱۰ نفر × ۱۰ سکه، ۱۰ برابرِ یک نفر با ۱۰۰ سکه می‌ارزد", () => {
    const many = peopleSupport(supporters("s", 10, 10), 1000);
    const one = peopleSupport([{ userId: "rich", amount: 100 }], 1000);
    expect(many.score).toBeCloseTo(1000, 9);
    expect(one.score).toBeCloseTo(100, 9);
    expect(many.score / one.score).toBeCloseTo(10, 9);
    // هر دو یک مقدار سکه گرفته‌اند
    expect(many.coins).toBe(one.coins);
  });

  it("اثر هر نفر تا سقف بریده می‌شود ولی سکهٔ دریافتی کامل شمرده می‌شود", () => {
    const r = peopleSupport([{ userId: "whale", amount: 200 }], 50);
    expect(r.score).toBeCloseTo(50, 9);
    expect(r.coins).toBe(200);
    expect(r.supporters).toBe(1);
  });

  it("سکه‌های یک نفر پیش از جذر و سقف جمع می‌شوند (تکه‌تکه دادن امتیاز بیشتری نمی‌سازد)", () => {
    const split = peopleSupport(
      [
        { userId: "a", amount: 30 },
        { userId: "a", amount: 30 },
      ],
      50
    );
    // ۶۰ → سقف ۵۰ → امتیاز ۵۰ (نه (√۳۰+√۳۰)² = ۱۲۰)
    expect(split.score).toBeCloseTo(50, 9);
    expect(split.supporters).toBe(1);
    expect(split.coins).toBe(60);

    const under = peopleSupport(
      [
        { userId: "a", amount: 9 },
        { userId: "a", amount: 16 },
      ],
      50
    );
    expect(under.score).toBeCloseTo(25, 9); // √۲۵ = ۵ → ۲۵
  });

  it("سکهٔ اعضای خود تیم کنار گذاشته می‌شود (نه امتیاز، نه حامی، نه سکه)", () => {
    const r = peopleSupport(
      [
        { userId: "member", amount: 40 },
        { userId: "outsider", amount: 16 },
      ],
      50,
      new Set(["member"])
    );
    expect(r.score).toBeCloseTo(16, 9);
    expect(r.supporters).toBe(1);
    expect(r.coins).toBe(16);
  });

  it("مبلغ صفر/منفی نادیده گرفته می‌شود و فهرست خالی صفر است", () => {
    expect(peopleSupport([], 50)).toEqual({ score: 0, supporters: 0, coins: 0 });
    expect(
      peopleSupport(
        [
          { userId: "a", amount: 0 },
          { userId: "b", amount: -10 },
        ],
        50
      )
    ).toEqual({ score: 0, supporters: 0, coins: 0 });
  });

  it("سقف منفی/صفر امتیاز صفر می‌دهد (بدون NaN)", () => {
    const r = peopleSupport([{ userId: "a", amount: 10 }], -5);
    expect(r.score).toBe(0);
    expect(Number.isNaN(r.score)).toBe(false);
  });
});

describe("validateInvestment (حمایت از ایده)", () => {
  it("حمایت معتبر با موجودی کافی", () => {
    expect(validateInvestment({ amount: 10, walletLeft: 100, isOwnTeam: false })).toEqual({ ok: true });
  });
  it("دقیقاً به اندازهٔ موجودی مجاز است", () => {
    expect(validateInvestment({ amount: 100, walletLeft: 100, isOwnTeam: false }).ok).toBe(true);
  });
  it("سقفی روی مبلغ هر هدف نیست", () => {
    expect(validateInvestment({ amount: 999, walletLeft: 1000, isOwnTeam: false }).ok).toBe(true);
  });
  it("حمایت از تیم خود ممنوع است (حتی با موجودی کافی)", () => {
    const r = validateInvestment({ amount: 10, walletLeft: 100, isOwnTeam: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("تیم خودت");
  });
  it("مبلغ صفر یا منفی رد می‌شود", () => {
    expect(validateInvestment({ amount: 0, walletLeft: 100, isOwnTeam: false }).ok).toBe(false);
    expect(validateInvestment({ amount: -5, walletLeft: 100, isOwnTeam: false }).ok).toBe(false);
  });
  it("بیش از موجودی رد می‌شود", () => {
    const r = validateInvestment({ amount: 101, walletLeft: 100, isOwnTeam: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("سکهٔ کافی");
  });
});

describe("validatePurchase (خرید محصول)", () => {
  it("خرید معتبر", () => {
    expect(validatePurchase({ amount: 20, walletLeft: 20, isOwnTeam: false })).toEqual({ ok: true });
  });
  it("خرید از تیم خود ممنوع است", () => {
    const r = validatePurchase({ amount: 20, walletLeft: 100, isOwnTeam: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("تیم خودت");
  });
  it("موجودی ناکافی و مبلغ نامثبت رد می‌شود", () => {
    expect(validatePurchase({ amount: 21, walletLeft: 20, isOwnTeam: false }).ok).toBe(false);
    expect(validatePurchase({ amount: 0, walletLeft: 20, isOwnTeam: false }).ok).toBe(false);
  });
});

describe("auction helpers", () => {
  it("nextMinBid: نخستین پیشنهاد برابر قیمت پایه، سپس بالاترین + گام", () => {
    expect(nextMinBid(null, 20, 2)).toBe(20);
    expect(nextMinBid(null, 20, 5)).toBe(20);
    expect(nextMinBid(30, 20, 2)).toBe(32);
    expect(nextMinBid(20, 20, 5)).toBe(25);
  });

  it("shouldExtendAuction: فقط درون پنجرهٔ ضد-اسنایپ و پیش از پایان", () => {
    const now = 1_000_000;
    expect(shouldExtendAuction(now, now + 10_000, 30)).toBe(true);
    expect(shouldExtendAuction(now, now + 30_000, 30)).toBe(true); // مرز پنجره
    expect(shouldExtendAuction(now, now + 30_001, 30)).toBe(false);
    expect(shouldExtendAuction(now, now + 120_000, 30)).toBe(false);
    expect(shouldExtendAuction(now, now, 30)).toBe(false); // زمان باقی‌مانده صفر
    expect(shouldExtendAuction(now, now - 1_000, 30)).toBe(false); // تمام‌شده
  });
});

describe("logRatio", () => {
  it("بهترین مقدار یک و نبود مقدار صفر است", () => {
    expect(logRatio(5000, 5000)).toBe(1);
    expect(logRatio(0, 5000)).toBe(0);
    expect(logRatio(10, 0)).toBe(0);
    expect(logRatio(-3, 100)).toBe(0);
  });

  it("لگاریتمی است: یک‌صدم بهترین هنوز حدود نصف نسبت را می‌گیرد", () => {
    expect(logRatio(99, 9999)).toBeCloseTo(0.5, 9);
    expect(logRatio(10, 1000)).toBeGreaterThan(10 / 1000);
  });
});

// ---------------------------------------------------------------------------

describe("scoreGame: نرمال‌سازی نسبت به بهترین ثبت محور (۴۰۰/۳۰۰/۳۰۰)", () => {
  const out = scoreGame(defaultConfig(), [
    team({ teamId: "B", juryRaw: 40, supports: [{ userId: "rich", amount: 100 }], aiQuality: 45 }),
    team({ teamId: "A", juryRaw: 80, supports: supporters("s", 4, 25), aiQuality: 90 }),
  ]);
  const A = byId(out.teams, "A");
  const B = byId(out.teams, "B");

  it("بهترین ثبت داوری و هوش مصنوعی را کامل می‌گیرد؛ بدون آمار بازار فقط سهم حمایت از بخش بازار می‌ماند", () => {
    expect(A.juryRaw).toBe(80);
    expect(A.people).toBe(400);
    expect(A.ai).toBe(90);
    expect(A.pts.jury).toBe(400);
    expect(A.pts.ai).toBe(300);
    expect(A.pts.market).toBe(60); // ۲۰٪ از ۳۰۰
    expect(A.marketDetail).toEqual({ support: 60, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 });
    expect(A.total).toBe(760);
  });

  it("بقیه به نسبت بهترین سنجیده می‌شوند", () => {
    // داوری ۴۰/۸۰ → ۲۰۰؛ حمایت ۵۰/۴۰۰ × ۶۰ → ۷٫۵ (یک نفر ۱۰۰ سکه تا سقف ۵۰)؛ هوش مصنوعی ۴۵/۹۰ → ۱۵۰
    expect(B.people).toBeCloseTo(50, 9);
    expect(B.pts.jury).toBeCloseTo(200, 9);
    expect(B.pts.market).toBeCloseTo(7.5, 9);
    expect(B.pts.ai).toBeCloseTo(150, 9);
    expect(B.total).toBeCloseTo(357.5, 9);
  });

  it("حامی‌ها و سکهٔ دریافتی گزارش می‌شوند", () => {
    expect(A.supporters).toBe(4);
    expect(A.coinsReceived).toBe(100);
    expect(B.supporters).toBe(1);
    expect(B.coinsReceived).toBe(100);
  });

  it("خروجی بر اساس total مرتب و رتبه‌گذاری می‌شود", () => {
    expect(out.teams.map((t) => t.teamId)).toEqual(["A", "B"]);
    expect(out.teams.map((t) => t.rank)).toEqual([1, 2]);
    expect(out.teams.map((t) => t.overallRank)).toEqual([1, 2]);
  });

  it("سقف حمایت پیکربندی روی امتیاز مردمی اثر دارد", () => {
    const cfg: EconomyConfig = { ...defaultConfig(), supportCap: 10 };
    const capped = scoreGame(cfg, [team({ teamId: "A", supports: [{ userId: "x", amount: 100 }] })]);
    expect(byId(capped.teams, "A").people).toBeCloseTo(10, 9);
  });

  it("ثبت کامل در همهٔ زیرشاخص‌ها دقیقاً ۱۰۰۰ می‌گیرد", () => {
    const full = scoreGame(defaultConfig(), [
      team({
        teamId: "A",
        juryRaw: 90,
        aiQuality: 90,
        supports: supporters("s", 3, 10),
        stats: stats({ activeInstalls: 100, revenueToman: 5000, rating: 5, commentCount: 40 }),
      }),
    ]);
    const d = byId(full.teams, "A").marketDetail;
    expect(d.support).toBeCloseTo(60, 9);
    expect(d.activeInstalls).toBeCloseTo(99, 9);
    expect(d.revenue).toBeCloseTo(72, 9);
    expect(d.rating).toBeCloseTo(42, 9);
    expect(d.comments).toBeCloseTo(27, 9);
    expect(byId(full.teams, "A").total).toBeCloseTo(1000, 9);
  });
});

describe("scoreGame: وزن‌های هر محور", () => {
  const config: EconomyConfig = { ...defaultConfig(), trackWeights: { general: DEFAULT_WEIGHTS, content: NO_BAZAAR_WEIGHTS, custom: ROUND_WEIGHTS } };

  it("محور بدون بازار: ۴۲۰ هوش مصنوعی، ۵۲۰ داوری و ۶۰ حمایت", () => {
    const out = scoreGame(config, [team({ teamId: "A", trackId: "content", juryRaw: 70, aiQuality: 70, supports: supporters("s", 2, 10) })]);
    const A = byId(out.teams, "A", "content");
    expect(A.pts.jury).toBeCloseTo(520, 9);
    expect(A.pts.market).toBeCloseTo(60, 9);
    expect(A.pts.ai).toBeCloseTo(420, 9);
    expect(A.total).toBeCloseTo(1000, 9);
  });

  it("محور بدون بازار: آمار بازار هیچ اثری ندارد، حتی اگر ثبت شده باشد", () => {
    const withStats = scoreGame(config, [
      team({ teamId: "A", trackId: "content", aiQuality: 50, stats: stats({ activeInstalls: 1000, revenueToman: 1000, rating: 5, commentCount: 100 }) }),
    ]);
    const A = byId(withStats.teams, "A", "content");
    expect(A.marketDetail).toEqual({ support: 0, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 });
    expect(A.pts.market).toBe(0);
  });

  it("وزن‌های سفارشی محور رعایت می‌شوند", () => {
    const out = scoreGame(config, [
      team({ teamId: "A", trackId: "custom", juryRaw: 80, supports: supporters("s", 4, 25), aiQuality: 90 }),
      team({ teamId: "B", trackId: "custom", juryRaw: 40, aiQuality: 45 }),
    ]);
    expect(byId(out.teams, "A", "custom").total).toBe(1000);
    expect(byId(out.teams, "B", "custom").pts).toEqual({ jury: 250, market: 0, ai: 100 });
  });

  it("محور بدون وزن تعریف‌شده از پیش‌فرض استفاده می‌کند", () => {
    const out = scoreGame(defaultConfig(), [team({ teamId: "A", trackId: "new-track", juryRaw: 50 })]);
    expect(byId(out.teams, "A", "new-track").pts.jury).toBe(DEFAULT_WEIGHTS.jury * 10);
  });
});

describe("scoreGame: زیرشاخص‌های بازار نسبت به بهترین محور، با مقیاس لگاریتمی", () => {
  const out = scoreGame(defaultConfig(), [
    team({ teamId: "top", stats: stats({ activeInstalls: 9999, revenueToman: 999_999, commentCount: 999 }) }),
    team({ teamId: "mid", stats: stats({ activeInstalls: 99, revenueToman: 999, commentCount: 31 }) }),
    team({ teamId: "none", stats: null }),
  ]);

  it("بهترین هر زیرشاخص سهم کامل را می‌گیرد", () => {
    const d = byId(out.teams, "top").marketDetail;
    expect(d.activeInstalls).toBeCloseTo(99, 9);
    expect(d.revenue).toBeCloseTo(72, 9);
    expect(d.comments).toBeCloseTo(27, 9);
  });

  it("بقیه با نسبت لگاریتمی، نه خطی", () => {
    const d = byId(out.teams, "mid").marketDetail;
    expect(d.activeInstalls).toBeCloseTo(99 * 0.5, 9); // log(100)/log(10000)
    expect(d.revenue).toBeCloseTo(72 * 0.5, 9); // log(1000)/log(1000000)
    expect(d.comments).toBeCloseTo((27 * Math.log(32)) / Math.log(1000), 9);
    // نسبت خطی نصب‌ها ۰٫۰۱ بود
    expect(d.activeInstalls).toBeGreaterThan(99 * 0.01);
  });

  it("بدون آمار صفر می‌گیرد", () => {
    expect(byId(out.teams, "none").pts.market).toBe(0);
  });

  it("امتیاز ستاره‌ای نسبت به ۵ است، نه نسبت به بهترین محور، و فقط با حداقل تعداد نظر", () => {
    const min = DEFAULTS.ratingMinComments;
    const r = scoreGame(defaultConfig(), [
      team({ teamId: "enough", stats: stats({ rating: 4, commentCount: min }) }),
      team({ teamId: "few", stats: stats({ rating: 5, commentCount: min - 1 }) }),
      team({ teamId: "unrated", stats: stats({ rating: null, commentCount: 500 }) }),
      team({ teamId: "over", stats: stats({ rating: 9, commentCount: 500 }) }),
    ]);
    expect(byId(r.teams, "enough").marketDetail.rating).toBeCloseTo(42 * 0.8, 9);
    expect(byId(r.teams, "few").marketDetail.rating).toBe(0);
    expect(byId(r.teams, "unrated").marketDetail.rating).toBe(0);
    expect(byId(r.teams, "over").marketDetail.rating).toBeCloseTo(42, 9);
  });

  it("حداقل تعداد نظر برای امتیاز ستاره‌ای از پیکربندی می‌آید", () => {
    const r = scoreGame({ ...defaultConfig(), ratingMinComments: 1 }, [team({ teamId: "A", stats: stats({ rating: 5, commentCount: 1 }) })]);
    expect(byId(r.teams, "A").marketDetail.rating).toBeCloseTo(42, 9);
  });

  it("نسبت هر محور جداست: بهترین یک محور رقیب محور دیگر را پایین نمی‌آورد", () => {
    const r = scoreGame(defaultConfig(), [
      team({ teamId: "A", trackId: "t1", stats: stats({ activeInstalls: 1_000_000 }) }),
      team({ teamId: "B", trackId: "t2", stats: stats({ activeInstalls: 10 }) }),
    ]);
    expect(byId(r.teams, "B", "t2").marketDetail.activeInstalls).toBeCloseTo(99, 9);
  });

  it("آمار پرچم‌خورده حساب نمی‌شود و در بیشینهٔ محور هم نمی‌آید تا پرچم برداشته شود", () => {
    const fake = stats({ activeInstalls: 1_000_000, revenueToman: 1_000_000, rating: 5, commentCount: 1000, flagged: true });
    const r = scoreGame(defaultConfig(), [
      team({ teamId: "fake", stats: fake, aiQuality: 50 }),
      team({ teamId: "real", stats: stats({ activeInstalls: 10, revenueToman: 10, rating: 4, commentCount: 10 }) }),
    ]);
    expect(byId(r.teams, "fake").pts.market).toBe(0);
    expect(byId(r.teams, "fake").pts.ai).toBe(300); // بقیهٔ امتیاز دست‌نخورده
    expect(byId(r.teams, "real").marketDetail.activeInstalls).toBeCloseTo(99, 9);

    const unflagged = scoreGame(defaultConfig(), [
      team({ teamId: "fake", stats: { ...fake, flagged: false } }),
      team({ teamId: "real", stats: stats({ activeInstalls: 10 }) }),
    ]);
    expect(byId(unflagged.teams, "fake").marketDetail.activeInstalls).toBeCloseTo(99, 9);
    expect(byId(unflagged.teams, "real").marketDetail.activeInstalls).toBeLessThan(99 / 2);
  });
});

describe("scoreGame: هر ثبت جدا (چند محور با محصول‌های جدا)", () => {
  const config: EconomyConfig = { ...defaultConfig(), trackWeights: { general: DEFAULT_WEIGHTS, content: NO_BAZAAR_WEIGHTS } };
  const out = scoreGame(config, [
    team({ teamId: "A", trackId: "general", productId: "p1", juryRaw: 50 }),
    team({ teamId: "A", trackId: "content", productId: "p2", juryRaw: 20 }),
    team({ teamId: "B", trackId: "general", productId: "p3", juryRaw: 100 }),
    team({ teamId: "C", trackId: "content", productId: "p4", juryRaw: 10 }),
  ]);

  it("یک تیم می‌تواند در چند محور باشد و هر ثبت کلید جدا دارد", () => {
    expect(new Set(out.teams.map(entryKey)).size).toBe(4);
    expect(byId(out.teams, "A", "general").productId).toBe("p1");
    expect(byId(out.teams, "A", "content").productId).toBe("p2");
  });

  it("نرمال‌سازی فقط با همان محور انجام می‌شود", () => {
    expect(byId(out.teams, "A", "general").pts.jury).toBeCloseTo(200, 9); // ۵۰/۱۰۰ × ۴۰۰
    expect(byId(out.teams, "A", "content").pts.jury).toBeCloseTo(520, 9); // بهترین محتوا
    expect(byId(out.teams, "C", "content").pts.jury).toBeCloseTo(260, 9);
  });

  it("rank درون محور و overallRank در نمای کلی است", () => {
    expect(byId(out.teams, "B", "general").rank).toBe(1);
    expect(byId(out.teams, "A", "general").rank).toBe(2);
    expect(byId(out.teams, "A", "content").rank).toBe(1);
    expect(byId(out.teams, "C", "content").rank).toBe(2);
    // کلی: A/content ۵۲۰ ، B/general ۴۰۰ ، C/content ۲۶۰ ، A/general ۲۰۰
    expect(out.teams.map((t) => [t.teamId, t.trackId, t.overallRank])).toEqual([
      ["A", "content", 1],
      ["B", "general", 2],
      ["C", "content", 3],
      ["A", "general", 4],
    ]);
  });

  it("حمایت هر ثبت جداست و سکهٔ اعضای تیم در هیچ‌کدام حساب نمی‌شود", () => {
    const r = scoreGame(config, [
      team({ teamId: "A", memberIds: ["a1"], trackId: "general", supports: [{ userId: "x", amount: 25 }, { userId: "a1", amount: 25 }] }),
      team({ teamId: "A", memberIds: ["a1"], trackId: "content", supports: [{ userId: "y", amount: 4 }] }),
    ]);
    expect(byId(r.teams, "A", "general").people).toBeCloseTo(25, 9);
    expect(byId(r.teams, "A", "general").supporters).toBe(1);
    expect(byId(r.teams, "A", "content").people).toBeCloseTo(4, 9);
  });

  it("دسته و نام محصول به خروجی می‌رسد", () => {
    const r = scoreGame(config, [team({ teamId: "A", category: "TECH", productName: "اپ" })]);
    expect(byId(r.teams, "A")).toMatchObject({ category: "TECH", productName: "اپ" });
  });
});

describe("scoreGame: تعداد اعضای تیم در امتیاز اثری ندارد", () => {
  it("دو تیم با داوری، حمایت مردمی و هوش مصنوعی یکسان اما ۱ و ۳ عضو، امتیاز کاملاً یکسان می‌گیرند", () => {
    // حامیان بیرونی‌اند (عضو هیچ‌کدام از دو تیم نیستند) تا ورودی واقعاً یکسان باشد
    const same = { juryRaw: 70, supports: supporters("fan", 4, 10), aiQuality: 70 };
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "solo", memberIds: ["s1"], ...same }),
      team({ teamId: "trio", memberIds: ["t1", "t2", "t3"], ...same }),
      // تیم مرجع با عددهای بالاتر تا نسبت‌ها کمتر از یک باشند و نرمال‌سازی واقعاً آزموده شود
      team({ teamId: "ref", memberIds: ["r1", "r2"], juryRaw: 100, supports: supporters("big", 9, 10), aiQuality: 90 }),
    ]);
    const solo = byId(out.teams, "solo");
    const trio = byId(out.teams, "trio");
    expect(solo.memberCount).toBe(1);
    expect(trio.memberCount).toBe(3);

    expect(solo.juryRaw).toBe(trio.juryRaw);
    expect(solo.juryAdjusted).toBe(trio.juryAdjusted);
    expect(solo.people).toBe(trio.people);
    expect(solo.ai).toBe(trio.ai);
    expect(solo.pts).toEqual(trio.pts);
    expect(solo.total).toBe(trio.total);
    expect(solo.total).toBeGreaterThan(0);
    expect(solo.total).toBeLessThan(byId(out.teams, "ref").total);
  });

  it("نمرهٔ داوری همان نمرهٔ خام است؛ تیم فردی یا دونفره هیچ افزایشی نمی‌گیرد", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "solo", memberIds: ["s1"], juryRaw: 80 }),
      team({ teamId: "duo", memberIds: ["d1", "d2"], juryRaw: 80 }),
      team({ teamId: "trio", juryRaw: 90 }),
    ]);
    const solo = byId(out.teams, "solo");
    const duo = byId(out.teams, "duo");
    const trio = byId(out.teams, "trio");

    expect(solo.juryAdjusted).toBe(80);
    expect(duo.juryAdjusted).toBe(80);
    expect(trio.juryAdjusted).toBe(90);
    expect(trio.pts.jury).toBeCloseTo(400, 9);
    expect(solo.pts.jury).toBeCloseTo((400 * 80) / 90, 9);
    expect(duo.pts.jury).toBe(solo.pts.jury);
    expect(out.teams[0].teamId).toBe("trio");
  });
});

describe("scoreGame: حمایت مردمی و اعضای تیم", () => {
  it("سکهٔ اعضای خود تیم حساب نمی‌شود ولی عضو یک تیم می‌تواند تیم دیگری را حمایت کند", () => {
    const out = scoreGame(defaultConfig(), [
      team({
        teamId: "A",
        memberIds: ["a1", "a2"],
        supports: [
          { userId: "a1", amount: 50 }, // عضو خود تیم — کنار گذاشته می‌شود
          { userId: "b1", amount: 16 },
        ],
      }),
      team({ teamId: "B", memberIds: ["b1"], supports: [{ userId: "a1", amount: 25 }] }),
    ]);
    const A = byId(out.teams, "A");
    const B = byId(out.teams, "B");
    expect(A.people).toBeCloseTo(16, 9);
    expect(A.supporters).toBe(1);
    expect(A.coinsReceived).toBe(16);
    expect(B.people).toBeCloseTo(25, 9);
    expect(B.supporters).toBe(1);
    // بهترین حمایت B است
    expect(B.marketDetail.support).toBeCloseTo(60, 9);
    expect(A.marketDetail.support).toBeCloseTo((60 * 16) / 25, 9);
  });

  it("پروژه‌ای که فقط اعضای خودش از آن حمایت کرده‌اند امتیاز مردمی ندارد", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "A", memberIds: ["a1"], supports: [{ userId: "a1", amount: 100 }] }),
    ]);
    expect(out.teams[0]).toMatchObject({ people: 0, supporters: 0, coinsReceived: 0 });
    expect(out.teams[0].marketDetail.support).toBe(0);
  });
});

describe("scoreGame: داوری/هوش مصنوعیِ انجام‌نشده (null)", () => {
  it("داوری نشده: juryRaw null، نمرهٔ داوری مؤثر و امتیاز صفر", () => {
    const out = scoreGame(defaultConfig(), [team({ teamId: "A", juryRaw: 50 }), team({ teamId: "B", juryRaw: null })]);
    const B = byId(out.teams, "B");
    expect(B.juryRaw).toBeNull();
    expect(B.juryAdjusted).toBe(0);
    expect(B.pts.jury).toBe(0);
    expect(byId(out.teams, "A").pts.jury).toBe(400);
  });

  it("هوش مصنوعی ارزیابی نشده: ai null و امتیاز صفر؛ مقدار بیرون از ۰..۱۰۰ بریده می‌شود", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "A", aiQuality: 150 }),
      team({ teamId: "B", aiQuality: null }),
      team({ teamId: "C", aiQuality: -20 }),
      team({ teamId: "D", aiQuality: 50 }),
    ]);
    expect(byId(out.teams, "A").ai).toBe(100);
    expect(byId(out.teams, "A").pts.ai).toBe(300);
    expect(byId(out.teams, "B").ai).toBeNull();
    expect(byId(out.teams, "B").pts.ai).toBe(0);
    expect(byId(out.teams, "C").ai).toBe(0);
    expect(byId(out.teams, "C").pts.ai).toBe(0);
    expect(byId(out.teams, "D").pts.ai).toBe(150);
  });

  it("وقتی هیچ پروژه‌ای هیچ نمره‌ای ندارد همه صفر است (بدون NaN/تقسیم بر صفر)", () => {
    const out = scoreGame(defaultConfig(), [team({ teamId: "A" }), team({ teamId: "B" })]);
    for (const t of out.teams) {
      expect(t.pts).toEqual({ jury: 0, market: 0, ai: 0 });
      expect(t.total).toBe(0);
      expect(Number.isNaN(t.total)).toBe(false);
    }
  });

  it("بدون تیم، خروجی خالی", () => {
    expect(scoreGame(defaultConfig(), [])).toEqual({ teams: [] });
  });
});

describe("scoreGame: کسر امتیاز تقلب", () => {
  const base = () => [
    team({ teamId: "A", juryRaw: 80, supports: supporters("s", 4, 25), aiQuality: 90 }), // ۷۶۰
    team({ teamId: "B", juryRaw: 40, supports: [{ userId: "rich", amount: 100 }], aiQuality: 45 }), // ۳۵۷٫۵
  ];

  it("از امتیاز کل کم می‌شود و در خروجی گزارش می‌شود", () => {
    const teams = base();
    teams[0].cheatPenalty = 150;
    const out = scoreGame(defaultConfig(), teams);
    const A = byId(out.teams, "A");
    expect(A.cheatPenalty).toBe(150);
    expect(A.pts).toEqual({ jury: 400, market: 60, ai: 300 }); // امتیاز معیارها دست‌نخورده
    expect(A.total).toBe(610);
  });

  it("روی نرمال‌سازی دیگران اثری ندارد", () => {
    const clean = scoreGame(defaultConfig(), base());
    const teams = base();
    teams[0].cheatPenalty = 500;
    const penalised = scoreGame(defaultConfig(), teams);
    expect(byId(penalised.teams, "B").pts).toEqual(byId(clean.teams, "B").pts);
    expect(byId(penalised.teams, "B").total).toBe(byId(clean.teams, "B").total);
  });

  it("می‌تواند رتبه را عوض کند", () => {
    const teams = base();
    teams[0].cheatPenalty = 500; // ۷۶۰ − ۵۰۰ = ۲۶۰ < ۳۵۷٫۵
    const out = scoreGame(defaultConfig(), teams);
    expect(out.teams.map((t) => t.teamId)).toEqual(["B", "A"]);
    expect(byId(out.teams, "A").total).toBe(260);
    expect(byId(out.teams, "B").rank).toBe(1);
  });

  it("امتیاز کل هرگز منفی نمی‌شود", () => {
    const teams = base();
    teams[1].cheatPenalty = 5000;
    const out = scoreGame(defaultConfig(), teams);
    expect(byId(out.teams, "B").total).toBe(0);
  });

  it("کسر منفی پاداش نمی‌شود (صفر در نظر گرفته می‌شود)", () => {
    const teams = base();
    teams[1].cheatPenalty = -100;
    const out = scoreGame(defaultConfig(), teams);
    expect(byId(out.teams, "B").cheatPenalty).toBe(0);
    expect(byId(out.teams, "B").total).toBeCloseTo(357.5, 9);
  });
});

describe("scoreGame: رتبه‌بندی و تساوی", () => {
  it("در تساوی امتیاز کل، حمایت مردمی بیشتر جلوتر است", () => {
    const out = scoreGame(roundConfig(), [
      team({ teamId: "X", juryRaw: 100 }), // ۵۰۰ + ۰ + ۰
      team({ teamId: "Y", supports: [{ userId: "p", amount: 25 }], aiQuality: 80 }), // ۰ + ۳۰۰ + ۲۰۰
    ]);
    expect(byId(out.teams, "X").total).toBe(500);
    expect(byId(out.teams, "Y").total).toBe(500);
    expect(out.teams.map((t) => t.teamId)).toEqual(["Y", "X"]);
    expect(out.teams.map((t) => t.rank)).toEqual([1, 2]);
  });

  it("در تساوی کل و مردم، نمرهٔ داوری بالاتر جلوتر است", () => {
    const out = scoreGame(roundConfig(), [
      // ۲۵۰ + ۳۰۰ = ۵۵۰
      team({ teamId: "Y", juryRaw: 50, supports: [{ userId: "p", amount: 25 }] }),
      // ۵۰۰ + ۳۰۰ − ۲۵۰ = ۵۵۰
      team({ teamId: "X", juryRaw: 100, supports: [{ userId: "q", amount: 25 }], cheatPenalty: 250 }),
    ]);
    expect(byId(out.teams, "X").total).toBe(550);
    expect(byId(out.teams, "Y").total).toBe(550);
    expect(out.teams.map((t) => t.teamId)).toEqual(["X", "Y"]);
  });

  it("رتبه‌ها پشت‌سرهم و از ۱ شروع می‌شوند", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "c", aiQuality: 10 }),
      team({ teamId: "a", aiQuality: 90 }),
      team({ teamId: "b", aiQuality: 50 }),
      team({ teamId: "d" }),
    ]);
    expect(out.teams.map((t) => t.teamId)).toEqual(["a", "b", "c", "d"]);
    expect(out.teams.map((t) => t.rank)).toEqual([1, 2, 3, 4]);
  });

  it("ورودی را تغییر نمی‌دهد", () => {
    const input = [
      team({ teamId: "A", juryRaw: 80, supports: supporters("s", 3, 10), aiQuality: 70, cheatPenalty: 5, stats: stats({ activeInstalls: 3 }) }),
      team({ teamId: "B", memberIds: ["b"], juryRaw: 60 }),
    ];
    const snapshot = structuredClone(input);
    scoreGame(defaultConfig(), input);
    expect(input).toEqual(snapshot);
  });
});

describe("scoreGame: شکستن قطعی تساوی (ثبت زودتر، سپس کلید ثبت)", () => {
  it("در تساوی کل، مردم و داوری، محصولی که زودتر ثبت نهایی شده جلوتر است؛ بدون محصول آخر", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "late", aiQuality: 50, productSubmittedAt: 2_000 }),
      team({ teamId: "none", aiQuality: 50, productSubmittedAt: null }),
      team({ teamId: "early", aiQuality: 50, productSubmittedAt: 1_000 }),
    ]);
    expect(out.teams.map((t) => t.teamId)).toEqual(["early", "late", "none"]);
    expect(out.teams.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it("در تساوی کامل (حتی زمان ثبت)، کلید ثبت صعودی؛ نتیجه مستقل از ترتیب ورودی است", () => {
    const input = [
      team({ teamId: "c", aiQuality: 40, productSubmittedAt: 5 }),
      team({ teamId: "a", aiQuality: 40, productSubmittedAt: 5 }),
      team({ teamId: "b", aiQuality: 40, productSubmittedAt: 5 }),
    ];
    const forward = scoreGame(defaultConfig(), input).teams.map((t) => t.teamId);
    const backward = scoreGame(defaultConfig(), [...input].reverse()).teams.map((t) => t.teamId);
    expect(forward).toEqual(["a", "b", "c"]);
    expect(backward).toEqual(forward);
  });

  it("زمان ثبت هر ثبت جداست: یک تیم با دو محصول در دو محور", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "A", trackId: "t2", aiQuality: 40, productSubmittedAt: 1 }),
      team({ teamId: "A", trackId: "t1", aiQuality: 40, productSubmittedAt: 2 }),
    ]);
    expect(out.teams.map((t) => t.trackId)).toEqual(["t2", "t1"]);
  });

  it("compareRank: ترتیب معیارها کل ← مردم ← داوری ← ثبت ← کلید ثبت", () => {
    const base = { teamId: "x", trackId: "general", total: 10, people: 5, juryAdjusted: 3 };
    expect(compareRank({ ...base, total: 11 }, base)).toBeLessThan(0);
    expect(compareRank({ ...base, people: 6 }, base)).toBeLessThan(0);
    expect(compareRank({ ...base, juryAdjusted: 4 }, base)).toBeLessThan(0);
    const sub = new Map<string, number | null>([
      ["p:general", 1],
      ["q:general", 2],
      ["r:general", null],
    ]);
    expect(compareRank({ ...base, teamId: "p" }, { ...base, teamId: "q" }, sub)).toBeLessThan(0);
    expect(compareRank({ ...base, teamId: "r" }, { ...base, teamId: "q" }, sub)).toBeGreaterThan(0);
    expect(compareRank({ ...base, teamId: "a" }, { ...base, teamId: "b" })).toBeLessThan(0);
    expect(compareRank({ ...base, trackId: "a" }, { ...base, trackId: "b" })).toBeLessThan(0);
    expect(compareRank(base, base)).toBe(0);
  });
});
