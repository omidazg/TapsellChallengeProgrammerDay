/**
 * تست src/lib/scoring.ts: جمع‌آوری داده از پایگاه‌داده برای موتور امتیاز (computeScores)،
 * خواندن انتخاب داوران (getAwardPicks) و پنج جایزهٔ پایان بازی (computeAwards — هر پروژه حداکثر یک جایزه).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";
import type { ScoreOutput, TeamResult } from "../src/lib/economy/types";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let scoring: typeof import("../src/lib/scoring");
let prizes: typeof import("../src/lib/prizes");

beforeAll(async () => {
  db = createTempDb("scoring-test");
  ({ prisma } = await import("../src/lib/db"));
  scoring = await import("../src/lib/scoring");
  prizes = await import("../src/lib/prizes");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

// ---------------------------------------------------------------------------
// computeAwards (خالص)
// ---------------------------------------------------------------------------

function result(teamId: string, o: Partial<TeamResult> = {}): TeamResult {
  return {
    teamId,
    memberCount: 3,
    juryRaw: null,
    juryAdjusted: 0,
    people: 0,
    supporters: 0,
    coinsReceived: 0,
    ai: null,
    cheatPenalty: 0,
    pts: { jury: 0, people: 0, ai: 0 },
    total: 0,
    ...o,
  };
}

function output(...teams: TeamResult[]): ScoreOutput {
  return { teams: [...teams].sort((a, b) => b.total - a.total) };
}

const names = new Map([
  ["A", "تیم الف"],
  ["B", "تیم ب"],
  ["C", "تیم ج"],
  ["D", "تیم د"],
  ["E", "تیم ه"],
]);
const NO_PICKS = { ai: null, live: null };

describe("prizes.ts: پنج جایزه", () => {
  it("ترتیب، درصدها (جمع ۱۰۰) و نحوهٔ انتخاب", () => {
    expect(prizes.PRIZES.map((p) => p.key)).toEqual(["champion", "jury", "ai", "people", "live"]);
    expect(prizes.PRIZES.map((p) => p.sharePct)).toEqual([35, 20, 15, 15, 15]);
    expect(prizes.PRIZES.reduce((a, p) => a + p.sharePct, 0)).toBe(100);
    expect(prizes.PRIZES.filter((p) => p.how === "pick").map((p) => p.key)).toEqual(["ai", "live"]);
  });

  it("صندوق و مبلغ هر جایزه", () => {
    const pool = prizes.prizePoolFrom(100_000_000); // ۱۰۰ میلیون تومان فروش سکه
    expect(pool).toEqual({ baseMillion: 2000, extraMillion: 100, totalMillion: 2100 });
    expect(prizes.prizeAmountMillion(pool, 35)).toBeCloseTo(735, 9);
    expect(prizes.prizePoolFrom(-5).totalMillion).toBe(2000);
    expect(prizes.formatMillion(700)).toBe("700");
    expect(prizes.formatMillion(700.54)).toBe("700.5");
  });
});

describe("scoring.ts: computeAwards", () => {
  it("پنج جایزه به پنج پروژهٔ متفاوت، به ترتیب PRIZES", () => {
    const out = output(
      result("A", { total: 900, juryAdjusted: 70, people: 300 }),
      result("B", { total: 700, juryAdjusted: 95, people: 100 }),
      result("C", { total: 500, juryAdjusted: 40, people: 900 }),
      result("D", { total: 300 }),
      result("E", { total: 200 })
    );
    const awards = scoring.computeAwards(out, { teamNames: names, picks: { ai: "D", live: "E" } });
    expect(awards.map((a) => [a.key, a.teamId])).toEqual([
      ["champion", "A"],
      ["jury", "B"],
      ["ai", "D"],
      ["people", "C"],
      ["live", "E"],
    ]);
    expect(awards[0]).toMatchObject({ label: "بنیان‌گذار برتر", emoji: "🏆", sharePct: 35, teamName: "تیم الف", value: 900 });
    expect(awards[1].value).toBe(95);
    expect(awards[3].value).toBe(900);
    expect(awards[2].value).toBe(300); // جایزهٔ انتخابی: امتیاز کل تیم
  });

  it("هر پروژه حداکثر یک جایزه: جایزهٔ خودکار به نفر بعدی همان معیار می‌رسد", () => {
    const out = output(
      result("A", { total: 1000, juryAdjusted: 100, people: 500 }),
      result("B", { total: 600, juryAdjusted: 80, people: 50 }),
      result("C", { total: 400, juryAdjusted: 10, people: 200 })
    );
    const awards = scoring.computeAwards(out, { teamNames: names, picks: NO_PICKS });
    expect(awards.map((a) => [a.key, a.teamId])).toEqual([
      ["champion", "A"],
      ["jury", "B"],
      ["people", "C"],
    ]);
    expect(new Set(awards.map((a) => a.teamId)).size).toBe(awards.length);
  });

  it("انتخاب داوران برای تیمی که قبلاً جایزه گرفته اهدا نمی‌شود", () => {
    const out = output(result("A", { total: 1000, juryAdjusted: 90, people: 10 }), result("B", { total: 500, juryAdjusted: 50, people: 5 }));
    const awards = scoring.computeAwards(out, { teamNames: names, picks: { ai: "A", live: "B" } });
    // A قهرمان، B انتخاب داوران (معیار jury) → هر دو انتخاب داوران از قبل جایزه دارند
    expect(awards.map((a) => a.key)).toEqual(["champion", "jury"]);
  });

  it("جایزهٔ انتخابی (ai) پیش از «انتخاب مردم» داده می‌شود و مردم به نفر بعدی می‌رسد", () => {
    const out = output(
      result("A", { total: 1000, juryAdjusted: 100, people: 50 }),
      result("B", { total: 800, juryAdjusted: 90, people: 40 }),
      result("C", { total: 600, juryAdjusted: 20, people: 400 }),
      result("D", { total: 300, juryAdjusted: 10, people: 300 })
    );
    const awards = scoring.computeAwards(out, { teamNames: names, picks: { ai: "C", live: null } });
    expect(awards.map((a) => [a.key, a.teamId])).toEqual([
      ["champion", "A"],
      ["jury", "B"],
      ["ai", "C"],
      ["people", "D"],
    ]);
  });

  it("بدون انتخاب داوران یا با شناسهٔ ناموجود، جایزهٔ انتخابی اهدا نمی‌شود", () => {
    const out = output(result("A", { total: 100, juryAdjusted: 10, people: 1 }));
    expect(scoring.computeAwards(out, { teamNames: names, picks: NO_PICKS }).map((a) => a.key)).toEqual(["champion"]);
    expect(
      scoring.computeAwards(out, { teamNames: names, picks: { ai: "no-such-team", live: "no-such-team" } }).map((a) => a.key)
    ).toEqual(["champion"]);
  });

  it("معیار صفر جایزه نمی‌گیرد (مثلاً هنوز داوری نشده یا حمایتی نبوده)", () => {
    const out = output(result("A", { total: 0 }), result("B", { total: 0 }));
    expect(scoring.computeAwards(out, { teamNames: names, picks: NO_PICKS })).toEqual([]);

    const onlyAi = output(result("A", { total: 200, ai: 100 }), result("B", { total: 100, ai: 50 }));
    expect(scoring.computeAwards(onlyAi, { teamNames: names, picks: NO_PICKS }).map((a) => a.key)).toEqual(["champion"]);
  });

  it("نام تیمِ ناشناخته رشتهٔ خالی است", () => {
    const awards = scoring.computeAwards(output(result("X", { total: 10 })), { teamNames: new Map(), picks: NO_PICKS });
    expect(awards[0].teamName).toBe("");
  });
});

describe("scoring.ts: computeAwards — شرایط احراز و شکستن تساوی", () => {
  it("تیم دارای کسر تقلب «انتخاب داوران» و «انتخاب مردم» را نمی‌برد؛ جایزه به تیم واجد شرایط بعدی می‌رسد", () => {
    const out = output(
      result("A", { total: 900, juryAdjusted: 50, people: 100 }),
      result("B", { total: 800, juryAdjusted: 99, people: 900, cheatPenalty: 10 }),
      result("C", { total: 500, juryAdjusted: 80, people: 50 }),
      result("D", { total: 300, juryAdjusted: 10, people: 400 })
    );
    const awards = scoring.computeAwards(out, { teamNames: names, picks: NO_PICKS });
    expect(awards.map((a) => [a.key, a.teamId])).toEqual([
      ["champion", "A"],
      ["jury", "C"],
      ["people", "D"],
    ]);
  });

  it("کسر تقلب مانع قهرمانی (امتیاز کل، که کسر را دارد) و جوایز انتخابی نیست", () => {
    const out = output(
      result("A", { total: 900, juryAdjusted: 50, people: 100, cheatPenalty: 5 }),
      result("B", { total: 100, juryAdjusted: 10, people: 10, cheatPenalty: 5 })
    );
    const awards = scoring.computeAwards(out, { teamNames: names, picks: { ai: "B", live: null } });
    expect(awards.map((a) => [a.key, a.teamId])).toEqual([
      ["champion", "A"],
      ["ai", "B"],
    ]);
  });

  it("تیم بدون عضو هیچ جایزه‌ای نمی‌برد (خودکار یا انتخابی)", () => {
    const out = output(
      result("A", { total: 900, juryAdjusted: 90, people: 900, memberCount: 0 }),
      result("B", { total: 500, juryAdjusted: 40, people: 40 }),
      result("C", { total: 300, juryAdjusted: 30, people: 30 }),
      result("D", { total: 100, juryAdjusted: 10, people: 10, memberCount: 0 })
    );
    const awards = scoring.computeAwards(out, { teamNames: names, picks: { ai: "D", live: "A" } });
    expect(awards.map((a) => [a.key, a.teamId])).toEqual([
      ["champion", "B"],
      ["jury", "C"],
    ]);
    expect(awards.some((a) => a.teamId === "A" || a.teamId === "D")).toBe(false);
  });

  it("تساوی معیار با ترتیب رتبه شکسته می‌شود، مستقل از ترتیب ورودی", () => {
    // B و C در نمرهٔ داوری برابرند؛ رتبهٔ C بهتر است (rank از موتور)
    const teams = [
      result("A", { total: 900, juryAdjusted: 95, people: 500, rank: 1 }),
      result("C", { total: 700, juryAdjusted: 60, people: 10, rank: 2 }),
      result("B", { total: 600, juryAdjusted: 60, people: 10, rank: 3 }),
    ];
    const awards = scoring.computeAwards({ teams }, { teamNames: names, picks: NO_PICKS });
    expect(awards.find((a) => a.key === "jury")?.teamId).toBe("C");
    // بدون rank: جایگاه در جدول (ترتیب رتبه) تساوی را می‌شکند — A قهرمان است، پس «مردم» به E (جلوتر از D در جدول) می‌رسد
    const noRank = [result("A", { total: 900, juryAdjusted: 95, people: 500 }), result("E", { total: 10, people: 7 }), result("D", { total: 10, people: 7 })];
    expect(scoring.computeAwards({ teams: noRank }, { teamNames: names, picks: NO_PICKS }).find((a) => a.key === "people")?.teamId).toBe("E");
  });

  it("prizeEligible", () => {
    expect(scoring.prizeEligible("jury", { memberCount: 2, cheatPenalty: 1 })).toBe(false);
    expect(scoring.prizeEligible("people", { memberCount: 2, cheatPenalty: 1 })).toBe(false);
    expect(scoring.prizeEligible("champion", { memberCount: 2, cheatPenalty: 1 })).toBe(true);
    expect(scoring.prizeEligible("live", { memberCount: 0, cheatPenalty: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeScores / getAwardPicks (با پایگاه‌داده)
// ---------------------------------------------------------------------------

let counter = 0;
async function makeUser(teamId: string | null = null) {
  counter++;
  return prisma.user.create({
    data: { email: `scoring-${counter}@example.test`, passwordHash: "x", nickname: `کاربر ${counter}`, role: "BUILDER", power: "", teamId },
  });
}

async function makeIdea(teamId: string) {
  return prisma.idea.create({
    data: { teamId, title: "ایده", oneLiner: "x", problem: "x", audience: "x", buildPlan: "x", fundingCap: 0, revenueShare: 0, submittedAt: new Date() },
  });
}

describe("scoring.ts: computeScores (داده‌ها از پایگاه‌داده)", () => {
  let ids: { A: string; B: string; C: string };

  beforeAll(async () => {
    const teamA = await prisma.team.create({ data: { name: "امتیاز الف", slug: "score-a", cheatPenalty: 25, cheatNote: "حمایت متقابل" } });
    const a1 = await makeUser(teamA.id);
    const a2 = await makeUser(teamA.id);
    await makeUser(teamA.id);
    const teamB = await prisma.team.create({ data: { name: "امتیاز ب", slug: "score-b", solo: true } });
    await makeUser(teamB.id);
    const teamC = await prisma.team.create({ data: { name: "امتیاز ج", slug: "score-c" } });
    await makeUser(teamC.id);
    await makeUser(teamC.id);
    const [o1, o2, o3] = [await makeUser(), await makeUser(), await makeUser()];

    // A: حمایت ایده + خرید محصول از یک نفر جمع می‌شود؛ حمایت اعضای خود تیم (قدیمی) کنار می‌رود
    const ideaA = await makeIdea(teamA.id);
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: o1.id, amount: 30 } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: o2.id, amount: 20 } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: a1.id, amount: 40, selfFunded: true } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: a2.id, amount: 10 } });
    const productA = await prisma.product.create({
      data: { teamId: teamA.id, name: "محصول الف", submittedAt: new Date(), juryWorks: 6, juryValue: 8, juryPitch: 10, aiQuality: 70 },
    });
    await prisma.purchase.create({ data: { productId: productA.id, userId: o1.id, amount: 30 } });
    await prisma.purchase.create({ data: { productId: productA.id, userId: o3.id, amount: 25 } }); // مثلاً برد حراج

    // B (فردی): عضو تیم A از B خریده — برای B حساب می‌شود؛ هنوز داوری انسانی نشده
    const productB = await prisma.product.create({ data: { teamId: teamB.id, name: "محصول ب", submittedAt: new Date(), aiQuality: 100 } });
    await prisma.purchase.create({ data: { productId: productB.id, userId: a1.id, amount: 16 } });

    // C: فقط ایده دارد
    const ideaC = await makeIdea(teamC.id);
    await prisma.investment.create({ data: { ideaId: ideaC.id, userId: o2.id, amount: 9 } });

    ids = { A: teamA.id, B: teamB.id, C: teamC.id };
  });

  const find = (out: ScoreOutput, id: string) => out.teams.find((t) => t.teamId === id)!;

  it("حمایت از ایده و خرید محصول (از جمله برد حراج) هر دو حمایت مردمی‌اند، با سقف و بدون اعضای تیم", async () => {
    const out = await scoring.computeScores();
    const A = find(out, ids.A);
    // o1: ۳۰+۳۰=۶۰ → سقف ۵۰؛ o2: ۲۰؛ o3: ۲۵
    expect(A.supporters).toBe(3);
    expect(A.coinsReceived).toBe(105); // سکهٔ دریافتی کامل (بدون سقف)
    expect(A.people).toBeCloseTo((Math.sqrt(50) + Math.sqrt(20) + 5) ** 2, 9);
    expect(A.memberCount).toBe(3);
    expect(A.juryRaw).toBe(80);
    expect(A.juryAdjusted).toBe(80);
    expect(A.ai).toBe(70);
    expect(A.cheatPenalty).toBe(25);
    expect(A.total).toBeCloseTo(A.pts.jury + A.pts.people + A.pts.ai - 25, 9);

    const B = find(out, ids.B);
    expect(B).toMatchObject({ memberCount: 1, juryRaw: null, juryAdjusted: 0, people: 16, supporters: 1, coinsReceived: 16, ai: 100 });
    expect(B.pts.ai).toBe(200);

    const C = find(out, ids.C);
    expect(C).toMatchObject({ memberCount: 2, juryRaw: null, ai: null, people: 9, supporters: 1, coinsReceived: 9 });

    expect(A.pts.jury).toBe(500);
    expect(A.pts.people).toBe(300);
    expect(out.teams.map((t) => t.rank)).toEqual([1, 2, 3]);
  });

  it("سقف حمایت از جدول تنظیمات خوانده می‌شود؛ کلید قدیمی solo_boost_pct بی‌اثر است", async () => {
    await prisma.setting.createMany({
      data: [
        { key: "support_cap", value: "100" },
        { key: "solo_boost_pct", value: "40" },
      ],
    });
    try {
      const config = await scoring.configFromSettings();
      expect(config).toEqual({ supportCap: 100, weights: { jury: 500, people: 300, ai: 200 } });
      const out = await scoring.computeScores();
      expect(find(out, ids.A).people).toBeCloseTo((Math.sqrt(60) + Math.sqrt(20) + 5) ** 2, 9);
    } finally {
      await prisma.setting.deleteMany({ where: { key: { in: ["support_cap", "solo_boost_pct"] } } });
    }
  });

  it("getAwardPicks انتخاب داوران را از تنظیمات می‌خواند (خالی = null)", async () => {
    expect(await scoring.getAwardPicks()).toEqual({ ai: null, live: null });
    await prisma.setting.create({ data: { key: scoring.AWARD_PICK_KEYS.ai, value: ids.B } });
    await prisma.setting.create({ data: { key: scoring.AWARD_PICK_KEYS.live, value: "" } });
    expect(await scoring.getAwardPicks()).toEqual({ ai: ids.B, live: null });
    expect(scoring.AWARD_PICK_KEYS).toEqual({ ai: "award_ai_team_id", live: "award_live_team_id" });
  });
});

describe("scoring.ts: انتخاب «بهترین محصول لایو» فقط برای محصول LIVE و ترتیب قطعی computeScores", () => {
  it("getAwardPicks انتخاب لایو را اگر محصول تیم LIVE نباشد نادیده می‌گیرد؛ getRawAwardPicks همان مقدار ذخیره‌شده است", async () => {
    const team = await prisma.team.create({ data: { name: "لایو تست", slug: "live-pick-test" } });
    await makeUser(team.id);
    const product = await prisma.product.create({ data: { teamId: team.id, name: "لایو", submittedAt: new Date(), liveStatus: "REQUESTED" } });
    await prisma.setting.upsert({
      where: { key: scoring.AWARD_PICK_KEYS.live },
      update: { value: team.id },
      create: { key: scoring.AWARD_PICK_KEYS.live, value: team.id },
    });
    expect((await scoring.getAwardPicks()).live).toBeNull();
    expect((await scoring.getRawAwardPicks()).live).toBe(team.id);
    await prisma.product.update({ where: { id: product.id }, data: { liveStatus: "LIVE" } });
    expect((await scoring.getAwardPicks()).live).toBe(team.id);
    await prisma.setting.update({ where: { key: scoring.AWARD_PICK_KEYS.live }, data: { value: "" } });
  });

  it("computeScores در تساوی کامل، تیم با محصول زودتر ثبت‌شده را جلوتر می‌گذارد (و بی‌محصول را آخر)", async () => {
    const mk = async (slug: string, submittedAt: Date | null) => {
      const t = await prisma.team.create({ data: { name: `تساوی ${slug}`, slug } });
      if (submittedAt) await prisma.product.create({ data: { teamId: t.id, name: slug, submittedAt } });
      return t.id;
    };
    const late = await mk("tie-late", new Date("2026-01-02T00:00:00Z"));
    const none = await mk("tie-none", null);
    const early = await mk("tie-early", new Date("2026-01-01T00:00:00Z"));
    const out = await scoring.computeScores();
    const order = out.teams.map((t) => t.teamId).filter((id) => [late, none, early].includes(id));
    expect(order).toEqual([early, late, none]);
  });
});
