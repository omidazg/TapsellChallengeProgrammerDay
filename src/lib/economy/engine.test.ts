import { describe, expect, it } from "vitest";
import { DEFAULTS, SCORE_WEIGHTS } from "@/lib/constants";
import {
  defaultConfig,
  juryRawScore,
  nextMinBid,
  peopleSupport,
  scoreGame,
  shouldExtendAuction,
  validateInvestment,
  validatePurchase,
} from "./engine";
import type { EconomyConfig, JuryScores, TeamInput, TeamResult } from "./types";

/** تیم سه‌نفرهٔ پیش‌فرض بدون هیچ داده‌ای (نه داوری، نه حمایت، نه هوش مصنوعی) */
function team(overrides: Partial<TeamInput> & { teamId: string }): TeamInput {
  const { teamId } = overrides;
  return {
    memberIds: [`${teamId}-m1`, `${teamId}-m2`, `${teamId}-m3`],
    supports: [],
    jury: null,
    aiQuality: null,
    cheatPenalty: 0,
    ...overrides,
  };
}

/** داوری با نمرهٔ یکسان برای هر سه پرسش */
function jury(works: number | null, value: number | null = works, pitch: number | null = works): JuryScores {
  return { works, value, pitch };
}

/** n حامی متفاوت که هر کدام `amount` سکه داده‌اند */
function supporters(prefix: string, n: number, amount: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `${prefix}${i}`, amount }));
}

function byId(teams: TeamResult[], teamId: string): TeamResult {
  const t = teams.find((x) => x.teamId === teamId);
  if (!t) throw new Error(`team ${teamId} not in output`);
  return t;
}

// ---------------------------------------------------------------------------

describe("defaultConfig", () => {
  it("از DEFAULTS و SCORE_WEIGHTS ساخته می‌شود و جمع وزن‌ها ۱۰۰۰ است", () => {
    const c = defaultConfig();
    expect(c).toEqual({
      supportCap: DEFAULTS.supportCap,
      weights: { jury: 500, people: 300, ai: 200 },
    });
    expect(c.weights.jury + c.weights.people + c.weights.ai).toBe(1000);
    expect(c.supportCap).toBe(50);
  });

  it("کپی تازه برمی‌گرداند؛ تغییر آن SCORE_WEIGHTS را خراب نمی‌کند", () => {
    const c = defaultConfig();
    c.weights.jury = 1;
    expect(SCORE_WEIGHTS.jury).toBe(500);
    expect(defaultConfig().weights.jury).toBe(500);
  });
});

describe("juryRawScore (داوری انسانی: میانگین × ۱۰)", () => {
  it("میانگین سه پرسش ۰..۱۰ را به ۰..۱۰۰ می‌برد", () => {
    expect(juryRawScore({ works: 8, value: 6, pitch: 10 })).toBe(80);
    expect(juryRawScore(jury(10))).toBe(100);
    expect(juryRawScore(jury(5))).toBe(50);
  });

  it("داوری نشده (null یا هر سه پرسش خالی) null است، نه صفر", () => {
    expect(juryRawScore(null)).toBeNull();
    expect(juryRawScore(jury(null))).toBeNull();
  });

  it("نمرهٔ صفر «داده‌شده» است و صفر برمی‌گرداند", () => {
    expect(juryRawScore(jury(0))).toBe(0);
  });

  it("فقط پرسش‌های نمره‌گرفته در میانگین حساب می‌شوند", () => {
    expect(juryRawScore({ works: 7, value: null, pitch: 9 })).toBe(80);
    expect(juryRawScore({ works: null, value: 4, pitch: null })).toBe(40);
  });

  it("نمرهٔ بیرون از بازهٔ ۰..۱۰ بریده می‌شود", () => {
    expect(juryRawScore({ works: 15, value: 10, pitch: 10 })).toBe(100);
    expect(juryRawScore({ works: -5, value: 0, pitch: 0 })).toBe(0);
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

// ---------------------------------------------------------------------------

describe("scoreGame: نرمال‌سازی نسبت به بهترین پروژه (۵۰۰/۳۰۰/۲۰۰)", () => {
  const out = scoreGame(defaultConfig(), [
    team({ teamId: "B", jury: jury(4), supports: [{ userId: "rich", amount: 100 }], aiQuality: 45 }),
    team({ teamId: "A", jury: jury(8), supports: supporters("s", 4, 25), aiQuality: 90 }),
  ]);
  const A = byId(out.teams, "A");
  const B = byId(out.teams, "B");

  it("بهترین پروژه در هر سه معیار دقیقاً ۱۰۰۰ می‌گیرد", () => {
    expect(A.juryRaw).toBe(80);
    expect(A.people).toBe(400);
    expect(A.ai).toBe(90);
    expect(A.pts).toEqual({ jury: 500, people: 300, ai: 200 });
    expect(A.total).toBe(1000);
  });

  it("بقیه به نسبت بهترین سنجیده می‌شوند", () => {
    // داوری ۴۰/۸۰ → ۲۵۰؛ مردم ۵۰/۴۰۰ → ۳۷٫۵ (یک نفر ۱۰۰ سکه تا سقف ۵۰)؛ هوش مصنوعی ۴۵/۹۰ → ۱۰۰
    expect(B.juryRaw).toBe(40);
    expect(B.people).toBeCloseTo(50, 9);
    expect(B.pts.jury).toBeCloseTo(250, 9);
    expect(B.pts.people).toBeCloseTo(37.5, 9);
    expect(B.pts.ai).toBeCloseTo(100, 9);
    expect(B.total).toBeCloseTo(387.5, 9);
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
  });

  it("وزن‌های سفارشی پیکربندی رعایت می‌شوند", () => {
    const cfg: EconomyConfig = { ...defaultConfig(), weights: { jury: 100, people: 100, ai: 100 } };
    const custom = scoreGame(cfg, [
      team({ teamId: "A", jury: jury(8), supports: supporters("s", 4, 25), aiQuality: 90 }),
      team({ teamId: "B", jury: jury(4), aiQuality: 45 }),
    ]);
    expect(byId(custom.teams, "A").total).toBe(300);
    expect(byId(custom.teams, "B").pts).toEqual({ jury: 50, people: 0, ai: 50 });
  });

  it("سقف حمایت پیکربندی روی امتیاز مردمی اثر دارد", () => {
    const cfg: EconomyConfig = { ...defaultConfig(), supportCap: 10 };
    const capped = scoreGame(cfg, [team({ teamId: "A", supports: [{ userId: "x", amount: 100 }] })]);
    expect(byId(capped.teams, "A").people).toBeCloseTo(10, 9);
  });
});

describe("scoreGame: تعداد اعضای تیم در امتیاز اثری ندارد", () => {
  it("دو تیم با داوری، حمایت مردمی و هوش مصنوعی یکسان اما ۱ و ۳ عضو، امتیاز کاملاً یکسان می‌گیرند", () => {
    // حامیان بیرونی‌اند (عضو هیچ‌کدام از دو تیم نیستند) تا ورودی واقعاً یکسان باشد
    const same = { jury: jury(8, 7, 6), supports: supporters("fan", 4, 10), aiQuality: 70 };
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "solo", memberIds: ["s1"], ...same }),
      team({ teamId: "trio", memberIds: ["t1", "t2", "t3"], ...same }),
      // تیم مرجع با عددهای بالاتر تا نسبت‌ها کمتر از یک باشند و نرمال‌سازی واقعاً آزموده شود
      team({ teamId: "ref", memberIds: ["r1", "r2"], jury: jury(10), supports: supporters("big", 9, 10), aiQuality: 90 }),
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
      team({ teamId: "solo", memberIds: ["s1"], jury: jury(8) }),
      team({ teamId: "duo", memberIds: ["d1", "d2"], jury: jury(8) }),
      team({ teamId: "trio", jury: jury(9) }),
    ]);
    const solo = byId(out.teams, "solo");
    const duo = byId(out.teams, "duo");
    const trio = byId(out.teams, "trio");

    expect(solo.juryAdjusted).toBe(80);
    expect(duo.juryAdjusted).toBe(80);
    expect(trio.juryAdjusted).toBe(90);
    expect(trio.pts.jury).toBeCloseTo(500, 9);
    expect(solo.pts.jury).toBeCloseTo((500 * 80) / 90, 9);
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
    // بهترین «مردم» B است
    expect(B.pts.people).toBeCloseTo(300, 9);
    expect(A.pts.people).toBeCloseTo((300 * 16) / 25, 9);
  });

  it("پروژه‌ای که فقط اعضای خودش از آن حمایت کرده‌اند امتیاز مردمی ندارد", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "A", memberIds: ["a1"], supports: [{ userId: "a1", amount: 100 }] }),
    ]);
    expect(out.teams[0]).toMatchObject({ people: 0, supporters: 0, coinsReceived: 0 });
    expect(out.teams[0].pts.people).toBe(0);
  });
});

describe("scoreGame: داوری/هوش مصنوعیِ انجام‌نشده (null)", () => {
  it("داوری نشده: juryRaw null، نمرهٔ داوری مؤثر و امتیاز صفر", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "A", jury: jury(5) }),
      team({ teamId: "B", jury: null }),
      team({ teamId: "C", jury: jury(null) }),
    ]);
    for (const id of ["B", "C"]) {
      const t = byId(out.teams, id);
      expect(t.juryRaw).toBeNull();
      expect(t.juryAdjusted).toBe(0);
      expect(t.pts.jury).toBe(0);
    }
    expect(byId(out.teams, "A").pts.jury).toBe(500);
  });

  it("هوش مصنوعی ارزیابی نشده: ai null و امتیاز صفر؛ مقدار بیرون از ۰..۱۰۰ بریده می‌شود", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "A", aiQuality: 150 }),
      team({ teamId: "B", aiQuality: null }),
      team({ teamId: "C", aiQuality: -20 }),
      team({ teamId: "D", aiQuality: 50 }),
    ]);
    expect(byId(out.teams, "A").ai).toBe(100);
    expect(byId(out.teams, "A").pts.ai).toBe(200);
    expect(byId(out.teams, "B").ai).toBeNull();
    expect(byId(out.teams, "B").pts.ai).toBe(0);
    expect(byId(out.teams, "C").ai).toBe(0);
    expect(byId(out.teams, "C").pts.ai).toBe(0);
    expect(byId(out.teams, "D").pts.ai).toBe(100);
  });

  it("وقتی هیچ پروژه‌ای هیچ نمره‌ای ندارد همه صفر است (بدون NaN/تقسیم بر صفر)", () => {
    const out = scoreGame(defaultConfig(), [team({ teamId: "A" }), team({ teamId: "B" })]);
    for (const t of out.teams) {
      expect(t.pts).toEqual({ jury: 0, people: 0, ai: 0 });
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
    team({ teamId: "A", jury: jury(8), supports: supporters("s", 4, 25), aiQuality: 90 }), // ۱۰۰۰
    team({ teamId: "B", jury: jury(4), supports: [{ userId: "rich", amount: 100 }], aiQuality: 45 }), // ۳۸۷٫۵
  ];

  it("از امتیاز کل کم می‌شود و در خروجی گزارش می‌شود", () => {
    const teams = base();
    teams[0].cheatPenalty = 150;
    const out = scoreGame(defaultConfig(), teams);
    const A = byId(out.teams, "A");
    expect(A.cheatPenalty).toBe(150);
    expect(A.pts).toEqual({ jury: 500, people: 300, ai: 200 }); // امتیاز معیارها دست‌نخورده
    expect(A.total).toBe(850);
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
    teams[0].cheatPenalty = 700; // ۱۰۰۰ − ۷۰۰ = ۳۰۰ < ۳۸۷٫۵
    const out = scoreGame(defaultConfig(), teams);
    expect(out.teams.map((t) => t.teamId)).toEqual(["B", "A"]);
    expect(byId(out.teams, "A").total).toBe(300);
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
    expect(byId(out.teams, "B").total).toBeCloseTo(387.5, 9);
  });
});

describe("scoreGame: رتبه‌بندی و تساوی", () => {
  it("در تساوی امتیاز کل، حمایت مردمی بیشتر جلوتر است", () => {
    const out = scoreGame(defaultConfig(), [
      team({ teamId: "X", jury: jury(10) }), // ۵۰۰ + ۰ + ۰
      team({ teamId: "Y", supports: [{ userId: "p", amount: 25 }], aiQuality: 80 }), // ۰ + ۳۰۰ + ۲۰۰
    ]);
    expect(byId(out.teams, "X").total).toBe(500);
    expect(byId(out.teams, "Y").total).toBe(500);
    expect(out.teams.map((t) => t.teamId)).toEqual(["Y", "X"]);
    expect(out.teams.map((t) => t.rank)).toEqual([1, 2]);
  });

  it("در تساوی کل و مردم، نمرهٔ داوری بالاتر جلوتر است", () => {
    const out = scoreGame(defaultConfig(), [
      // ۲۵۰ + ۳۰۰ = ۵۵۰
      team({ teamId: "Y", jury: jury(5), supports: [{ userId: "p", amount: 25 }] }),
      // ۵۰۰ + ۳۰۰ − ۲۵۰ = ۵۵۰
      team({ teamId: "X", jury: jury(10), supports: [{ userId: "q", amount: 25 }], cheatPenalty: 250 }),
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
      team({ teamId: "A", jury: jury(8), supports: supporters("s", 3, 10), aiQuality: 70, cheatPenalty: 5 }),
      team({ teamId: "B", memberIds: ["b"], jury: jury(6) }),
    ];
    const snapshot = structuredClone(input);
    scoreGame(defaultConfig(), input);
    expect(input).toEqual(snapshot);
  });
});
