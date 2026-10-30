/**
 * تست src/lib/scoring.ts و src/lib/prizes.ts: جمع‌آوری داده از پایگاه‌داده برای موتور امتیاز (computeScores)،
 * نمایش زنده بدون داوری (computeScoresCached) و جوایز (computeAwards: هر ثبت یک جایزهٔ رتبه و حداکثر یک جایزهٔ ویژه).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";
import type { ScoreOutput, TeamResult } from "../src/lib/economy/types";
import type { PrizeRow } from "../src/lib/prizes";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let scoring: typeof import("../src/lib/scoring");
let prizes: typeof import("../src/lib/prizes");
let cache: typeof import("../src/lib/ttl-cache");

beforeAll(async () => {
  db = createTempDb("scoring-test");
  ({ prisma } = await import("../src/lib/db"));
  scoring = await import("../src/lib/scoring");
  prizes = await import("../src/lib/prizes");
  cache = await import("../src/lib/ttl-cache");
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
    trackId: "general",
    category: "TECH",
    productId: `p-${teamId}`,
    productName: `محصول ${teamId}`,
    memberCount: 3,
    juryRaw: 80,
    juryAdjusted: 80,
    people: 0,
    supporters: 0,
    coinsReceived: 0,
    ai: null,
    cheatPenalty: 0,
    pts: { jury: 0, market: 0, ai: 0 },
    marketDetail: { support: 0, activeInstalls: 0, revenue: 0, rating: 0, comments: 0 },
    total: 100,
    ...o,
  };
}

function output(...teams: TeamResult[]): ScoreOutput {
  return { teams: [...teams].sort((a, b) => b.total - a.total) };
}

function prize(id: string, o: Partial<PrizeRow> = {}): PrizeRow {
  return { id, trackId: "general", category: "", kind: "RANK", rank: 1, label: id, emoji: "🏆", amountToman: null, winnerProductId: null, order: 0, ...o };
}

const names = new Map([
  ["A", "تیم الف"],
  ["B", "تیم ب"],
  ["C", "تیم ج"],
]);

/** minEntries=1 یعنی دروازهٔ «شرکت‌کنندهٔ کم» غیرفعال است */
const extra = (list: PrizeRow[], o: { minEntries?: number; minJury?: number } = {}) => ({
  prizes: list,
  teamNames: names,
  minEntries: o.minEntries ?? 1,
  minJury: o.minJury ?? 50,
});

const pairs = (a: { prizeId: string; teamId: string }[]) => a.map((x) => [x.prizeId, x.teamId]);

describe("prizes.ts: جوایز پیش‌فرض و نمایش مبلغ", () => {
  it("فقط نفر اول هر محور؛ محور عمومی دو دستهٔ فنی و غیرفنی دارد", () => {
    expect(prizes.DEFAULT_PRIZES.every((p) => p.kind === "RANK" && p.rank === 1)).toBe(true);
    expect(prizes.DEFAULT_PRIZES.map((p) => [p.trackId, p.category])).toEqual([
      ["general", "TECH"],
      ["general", "NON_TECH"],
      ["content", ""],
      ["os", ""],
    ]);
  });

  it("مهاجرت همان جوایز پیش‌فرض را می‌کارد؛ مبلغ‌ها تا تصمیم ادمین خالی‌اند", async () => {
    const rows = await scoring.listPrizes();
    expect(rows.map((p) => [p.trackId, p.category, p.kind, p.rank])).toEqual(prizes.DEFAULT_PRIZES.map((p) => [p.trackId, p.category, p.kind, p.rank]));
    expect(rows.every((p) => p.amountToman === null)).toBe(true);
  });

  it("مبلغ ثابت نمایش داده می‌شود و مبلغ نهایی‌نشده «به‌زودی» است", () => {
    expect(prizes.formatPrizeAmount(null)).toBe("به‌زودی اعلام می‌شود");
    expect(prizes.formatPrizeAmount(50_000_000)).toBe("۵۰٬۰۰۰٬۰۰۰ تومان");
    expect(prizes.formatPrizeAmount(0)).toContain("تومان");
  });
});

describe("computeAwards: جایزهٔ رتبه", () => {
  it("نفر اول هر محور برنده می‌شود و اطلاعات جایزه و برنده در خروجی است", () => {
    const out = output(
      result("A", { total: 900, trackId: "general" }),
      result("B", { total: 700, trackId: "content", category: "NON_TECH" }),
      result("C", { total: 500, trackId: "content", category: "NON_TECH" })
    );
    const awards = prizes.computeAwards(out, extra([prize("gen", { amountToman: 1000 }), prize("con", { trackId: "content" })]));
    expect(pairs(awards)).toEqual([
      ["gen", "A"],
      ["con", "B"],
    ]);
    expect(awards[0]).toMatchObject({ teamName: "تیم الف", productId: "p-A", productName: "محصول A", value: 900, amountToman: 1000, kind: "RANK", rank: 1 });
  });

  it("فیلتر دسته: محور عمومی برای فنی و غیرفنی نفر اول جدا دارد، حتی وقتی دستهٔ دیگر امتیاز بالاتری دارد", () => {
    const out = output(
      result("A", { total: 900, category: "TECH" }),
      result("B", { total: 800, category: "TECH" }),
      result("C", { total: 100, category: "NON_TECH" })
    );
    const awards = prizes.computeAwards(out, extra([prize("tech", { category: "TECH" }), prize("non", { category: "NON_TECH" })]));
    expect(pairs(awards)).toEqual([
      ["tech", "A"],
      ["non", "C"],
    ]);
  });

  it("هر ثبت حداکثر یک جایزهٔ رتبه می‌برد: جایزهٔ رتبهٔ دوم به نفر بعدی می‌رسد، حتی اگر ترتیب تعریف برعکس باشد", () => {
    const out = output(result("A", { total: 900 }), result("B", { total: 800 }), result("C", { total: 700 }));
    const awards = prizes.computeAwards(
      out,
      extra([prize("second", { rank: 2, order: 1 }), prize("first", { rank: 1, order: 2 }), prize("third", { rank: 3, order: 3 })])
    );
    expect(pairs(awards)).toEqual([
      ["first", "A"],
      ["second", "B"],
      ["third", "C"],
    ]);
  });

  it("یک تیم می‌تواند با دو ثبت در دو محور دو جایزهٔ رتبه ببرد (هر ثبت جداست)", () => {
    const out = output(result("A", { total: 900 }), result("A", { total: 800, trackId: "content", productId: "p2" }));
    const awards = prizes.computeAwards(out, extra([prize("gen"), prize("con", { trackId: "content" })]));
    expect(pairs(awards)).toEqual([
      ["gen", "A"],
      ["con", "A"],
    ]);
  });

  it("ثبت بدون عضو، بدون محصول یا با امتیاز صفر جایزه نمی‌برد و جایزه به نفر واجد شرایط بعدی می‌رسد", () => {
    const out = output(
      result("A", { total: 900, memberCount: 0 }),
      result("B", { total: 800, productId: null }),
      result("C", { total: 700 })
    );
    expect(pairs(prizes.computeAwards(out, extra([prize("gen")])))).toEqual([["gen", "C"]]);
    expect(prizes.computeAwards(output(result("A", { total: 0 })), extra([prize("gen")]))).toEqual([]);
  });

  it("کسر تقلب مانع جایزه نیست (در امتیاز کل اعمال شده است)", () => {
    expect(pairs(prizes.computeAwards(output(result("A", { total: 500, cheatPenalty: 100 })), extra([prize("gen")])))).toEqual([["gen", "A"]]);
  });

  it("محور بدون ثبت جایزه‌ای ندارد و نام تیم ناشناخته رشتهٔ خالی است", () => {
    expect(prizes.computeAwards(output(result("A")), extra([prize("os", { trackId: "os" })]))).toEqual([]);
    const awards = prizes.computeAwards(output(result("X", { total: 10 })), extra([prize("gen")]));
    expect(awards[0].teamName).toBe("");
  });
});

describe("computeAwards: حداقل شرکت‌کننده و حداقل نمرهٔ داوری", () => {
  const list = [prize("gen")];

  it("با شرکت‌کنندهٔ کم و نمرهٔ داوری پایین جایزه داده نمی‌شود", () => {
    const out = output(result("A", { total: 500, juryRaw: 49 }), result("B", { total: 400, juryRaw: 10 }));
    expect(prizes.computeAwards(out, extra(list, { minEntries: 3, minJury: 50 }))).toEqual([]);
  });

  it("داوری‌نشده (null) هم نمرهٔ حداقل را ندارد", () => {
    const out = output(result("A", { total: 500, juryRaw: null }));
    expect(prizes.computeAwards(out, extra(list, { minEntries: 3, minJury: 50 }))).toEqual([]);
  });

  it("دقیقاً برابر حداقل نمره کافی است", () => {
    const out = output(result("A", { total: 500, juryRaw: 50 }));
    expect(pairs(prizes.computeAwards(out, extra(list, { minEntries: 3, minJury: 50 })))).toEqual([["gen", "A"]]);
  });

  it("در محور کم‌جمعیت جایزه به اولین ثبتی می‌رسد که حداقل نمره را دارد", () => {
    const out = output(result("A", { total: 500, juryRaw: 20 }), result("B", { total: 400, juryRaw: 60 }));
    expect(pairs(prizes.computeAwards(out, extra(list, { minEntries: 3, minJury: 50 })))).toEqual([["gen", "B"]]);
  });

  it("با تعداد ثبت برابر حداقل، دروازهٔ نمره اعمال نمی‌شود", () => {
    const out = output(result("A", { total: 500, juryRaw: 1 }), result("B", { total: 400, juryRaw: 1 }), result("C", { total: 300, juryRaw: 1 }));
    expect(pairs(prizes.computeAwards(out, extra(list, { minEntries: 3, minJury: 50 })))).toEqual([["gen", "A"]]);
  });

  it("تعداد ثبت برای هر جایزه با فیلتر دسته شمرده می‌شود", () => {
    const out = output(
      result("A", { total: 900, juryRaw: 1, category: "TECH" }),
      result("B", { total: 800, juryRaw: 1, category: "TECH" }),
      result("C", { total: 700, juryRaw: 1, category: "NON_TECH" })
    );
    const awards = prizes.computeAwards(out, extra([prize("tech", { category: "TECH" }), prize("non", { category: "NON_TECH" })], { minEntries: 2, minJury: 50 }));
    expect(pairs(awards)).toEqual([["tech", "A"]]);
  });
});

describe("computeAwards: جایزهٔ ویژه", () => {
  it("یک ثبت می‌تواند هم جایزهٔ رتبه و هم یک جایزهٔ ویژه ببرد", () => {
    const out = output(result("A", { total: 900 }), result("B", { total: 800 }));
    const awards = prizes.computeAwards(out, extra([prize("gen"), prize("demo", { kind: "SPECIAL", winnerProductId: "p-A", label: "بهترین دمو" })]));
    expect(pairs(awards).sort()).toEqual([
      ["demo", "A"],
      ["gen", "A"],
    ]);
  });

  it("هر ثبت حداکثر یک جایزهٔ ویژه می‌برد؛ جایزهٔ ویژهٔ دوم همان ثبت اهدا نمی‌شود", () => {
    const out = output(result("A", { total: 900 }), result("B", { total: 800 }));
    const awards = prizes.computeAwards(
      out,
      extra([
        prize("s1", { kind: "SPECIAL", winnerProductId: "p-A", order: 1 }),
        prize("s2", { kind: "SPECIAL", winnerProductId: "p-A", order: 2 }),
        prize("s3", { kind: "SPECIAL", winnerProductId: "p-B", order: 3 }),
      ])
    );
    expect(pairs(awards)).toEqual([
      ["s1", "A"],
      ["s3", "B"],
    ]);
  });

  it("جایزهٔ ویژه بدون برندهٔ انتخاب‌شده یا با محصول ناموجود اهدا نمی‌شود", () => {
    const out = output(result("A", { total: 900 }));
    expect(prizes.computeAwards(out, extra([prize("s1", { kind: "SPECIAL" }), prize("s2", { kind: "SPECIAL", winnerProductId: "no-such" })]))).toEqual([]);
  });

  it("ثبت بی‌عضو یا با امتیاز صفر جایزهٔ ویژه هم نمی‌برد", () => {
    const out = output(result("A", { total: 900, memberCount: 0 }), result("B", { total: 0 }));
    const awards = prizes.computeAwards(
      out,
      extra([prize("s1", { kind: "SPECIAL", winnerProductId: "p-A" }), prize("s2", { kind: "SPECIAL", winnerProductId: "p-B" })])
    );
    expect(awards).toEqual([]);
  });

  it("جایزهٔ ویژه جای جایزهٔ رتبه را نمی‌گیرد و نفر اول همچنان رتبه را می‌برد", () => {
    const out = output(result("A", { total: 900 }), result("B", { total: 800 }));
    const awards = prizes.computeAwards(out, extra([prize("s1", { kind: "SPECIAL", winnerProductId: "p-B", rank: 1, order: 0 }), prize("gen", { order: 1 })]));
    expect(pairs(awards).sort()).toEqual([
      ["gen", "A"],
      ["s1", "B"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// computeScores (با پایگاه‌داده)
// ---------------------------------------------------------------------------

let counter = 0;
async function makeUser(teamId: string | null = null) {
  counter++;
  return prisma.user.create({
    data: { email: `scoring-${counter}@example.test`, passwordHash: "x", nickname: `کاربر ${counter}`, role: "BUILDER", power: "", teamId },
  });
}

async function makeIdea(teamId: string, trackId = "general") {
  return prisma.idea.create({
    data: { teamId, trackId, title: "ایده", oneLiner: "x", problem: "x", audience: "x", buildPlan: "x", fundingCap: 0, revenueShare: 0, submittedAt: new Date() },
  });
}

async function makeProduct(teamId: string, slug: string, data: Record<string, unknown> = {}) {
  return prisma.product.create({ data: { teamId, slug, name: `محصول ${slug}`, submittedAt: new Date(), ...data } });
}

describe("scoring.ts: computeScores (داده‌ها از پایگاه‌داده)", () => {
  let ids: { A: string; B: string; C: string; D: string };
  let productA: { id: string };
  let productAContent: { id: string };
  let judge2Id: string;

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
    // تیم بدون ایده و محصول ثبتی ندارد و در خروجی نمی‌آید
    const teamD = await prisma.team.create({ data: { name: "امتیاز د", slug: "score-d" } });
    await makeUser(teamD.id);
    const [o1, o2, o3] = [await makeUser(), await makeUser(), await makeUser()];
    const [judge1, judge2] = [await makeUser(), await makeUser()];
    judge2Id = judge2.id;

    // A/general: حمایت ایده + خرید محصول از یک نفر جمع می‌شود؛ حمایت اعضای خود تیم (قدیمی) کنار می‌رود
    const ideaA = await makeIdea(teamA.id);
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: o1.id, amount: 30 } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: o2.id, amount: 20 } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: a1.id, amount: 40, selfFunded: true } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: a2.id, amount: 10 } });
    productA = await makeProduct(teamA.id, "score-a-general", { aiQuality: 70, category: "TECH" });
    await prisma.purchase.create({ data: { productId: productA.id, userId: o1.id, amount: 30 } });
    await prisma.purchase.create({ data: { productId: productA.id, userId: o3.id, amount: 25 } }); // مثلاً برد حراج
    // دو داور مستقل: میانگین ۸ و میانگین ۶ → ۷۰
    await prisma.juryScore.create({ data: { productId: productA.id, judgeId: judge1.id, scores: JSON.stringify({ works: 6, value: 8, pitch: 10 }) } });
    await prisma.juryScore.create({ data: { productId: productA.id, judgeId: judge2.id, scores: JSON.stringify({ works: 6, value: 6, pitch: 6 }) } });
    await prisma.bazaarStat.create({ data: { productId: productA.id, activeInstalls: 100, revenueToman: 1000, rating: 4, commentCount: 20 } });

    // A/content: همان تیم با محصول جدا در محور دوم
    productAContent = await makeProduct(teamA.id, "score-a-content", { trackId: "content", aiQuality: 40, aiFinal: 80 });
    await prisma.juryScore.create({ data: { productId: productAContent.id, judgeId: judge1.id, scores: JSON.stringify({ works: 5, value: 5, pitch: 5 }) } });

    // B (فردی): عضو تیم A از B خریده — برای B حساب می‌شود؛ هنوز داوری انسانی نشده
    const productB = await makeProduct(teamB.id, "score-b-general", { aiQuality: 100, category: "NON_TECH" });
    await prisma.purchase.create({ data: { productId: productB.id, userId: a1.id, amount: 16 } });

    // C: فقط ایده دارد
    const ideaC = await makeIdea(teamC.id);
    await prisma.investment.create({ data: { ideaId: ideaC.id, userId: o2.id, amount: 9 } });

    ids = { A: teamA.id, B: teamB.id, C: teamC.id, D: teamD.id };
  });

  const find = (out: ScoreOutput, id: string, trackId = "general") => out.teams.find((t) => t.teamId === id && t.trackId === trackId)!;

  it("هر ترکیب تیم و محور یک ثبت است؛ تیم بدون ایده و محصول ثبتی ندارد", async () => {
    const out = await scoring.computeScores();
    expect(out.teams.map(scoring.entryKey).sort()).toEqual(
      [`${ids.A}:general`, `${ids.A}:content`, `${ids.B}:general`, `${ids.C}:general`].sort()
    );
    expect(out.teams.some((t) => t.teamId === ids.D)).toBe(false);
  });

  it("حمایت از ایده و خرید محصول (از جمله برد حراج) هر دو حمایت مردمی‌اند، با سقف و بدون اعضای تیم", async () => {
    const out = await scoring.computeScores();
    const A = find(out, ids.A);
    // o1: ۳۰+۳۰=۶۰ → سقف ۵۰؛ o2: ۲۰؛ o3: ۲۵
    expect(A.supporters).toBe(3);
    expect(A.coinsReceived).toBe(105); // سکهٔ دریافتی کامل (بدون سقف)
    expect(A.people).toBeCloseTo((Math.sqrt(50) + Math.sqrt(20) + 5) ** 2, 9);
    expect(A.memberCount).toBe(3);
    expect(A.cheatPenalty).toBe(25);
    expect(A.category).toBe("TECH");
    expect(A.productId).toBe(productA.id);
    expect(A.total).toBeCloseTo(A.pts.jury + A.pts.market + A.pts.ai - 25, 9);

    const B = find(out, ids.B);
    expect(B).toMatchObject({ memberCount: 1, juryRaw: null, juryAdjusted: 0, people: 16, supporters: 1, coinsReceived: 16, ai: 100, category: "NON_TECH" });

    const C = find(out, ids.C);
    expect(C).toMatchObject({ memberCount: 2, juryRaw: null, ai: null, people: 9, supporters: 1, coinsReceived: 9, productId: null, productName: "ایده" });
  });

  it("نمرهٔ داوری میانگین داورهای مستقل است، با معیارهای پیش‌فرض محور", async () => {
    const A = find(await scoring.computeScores(), ids.A);
    expect(A.juryRaw).toBeCloseTo(70, 9);
    expect(A.juryAdjusted).toBeCloseTo(70, 9);
    expect(A.pts.jury).toBeCloseTo(400, 9); // تنها ثبت داوری‌شدهٔ محور عمومی
  });

  it("معیارهای سفارشی محور: نمرهٔ معیار قدیمی حساب نمی‌شود", async () => {
    await prisma.track.update({ where: { id: "general" }, data: { juryCriteria: JSON.stringify([{ key: "works", label: "کار می‌کند؟" }]) } });
    try {
      const A = find(await scoring.computeScores(), ids.A);
      expect(A.juryRaw).toBeCloseTo(60, 9); // (۶ + ۶) / ۲ × ۱۰
    } finally {
      await prisma.track.update({ where: { id: "general" }, data: { juryCriteria: "[]" } });
    }
  });

  it("نمرهٔ هوش مصنوعی: ارزیابی نهایی جای بازخورد موقت را می‌گیرد", async () => {
    const out = await scoring.computeScores();
    expect(find(out, ids.A, "content").ai).toBe(80);
    expect(find(out, ids.A).ai).toBe(70);
    expect(find(out, ids.A).pts.ai).toBeCloseTo(210, 9); // ۷۰/۱۰۰ × ۳۰۰
    expect(find(out, ids.B).pts.ai).toBeCloseTo(300, 9);
  });

  it("وزن هر محور از خود محور خوانده می‌شود؛ محور محتوا بخش آمار بازار ندارد", async () => {
    const out = await scoring.computeScores();
    const content = find(out, ids.A, "content");
    expect(content.pts.jury).toBeCloseTo(520, 9);
    expect(content.pts.ai).toBeCloseTo(420, 9);
    expect(content.pts.market).toBe(0);
    expect(content.rank).toBe(1);

    const A = find(out, ids.A);
    // تنها ثبت دارای آمار در محور عمومی است؛ همهٔ زیرشاخص‌های لگاریتمی کامل می‌شوند
    expect(A.marketDetail.activeInstalls).toBeCloseTo(99, 9);
    expect(A.marketDetail.revenue).toBeCloseTo(72, 9);
    expect(A.marketDetail.comments).toBeCloseTo(27, 9);
    expect(A.marketDetail.rating).toBeCloseTo(42 * 0.8, 9);
    expect(A.marketDetail.support).toBeCloseTo(60, 9);
    expect(out.teams.filter((t) => t.trackId === "general").map((t) => t.rank)).toEqual([1, 2, 3]);
    expect(out.teams.map((t) => t.overallRank)).toEqual([1, 2, 3, 4]);
  });

  it("پرچم مشکوک آمار را از امتیاز حذف می‌کند", async () => {
    await prisma.bazaarStat.update({ where: { productId: productA.id }, data: { flagged: true } });
    try {
      const A = find(await scoring.computeScores(), ids.A);
      expect(A.marketDetail).toMatchObject({ activeInstalls: 0, revenue: 0, rating: 0, comments: 0 });
      expect(A.marketDetail.support).toBeCloseTo(60, 9);
    } finally {
      await prisma.bazaarStat.update({ where: { productId: productA.id }, data: { flagged: false } });
    }
  });

  it("محور مخفی در امتیاز نیست و رتبه‌های بقیه به‌هم نمی‌خورد", async () => {
    await prisma.track.update({ where: { id: "content" }, data: { status: "hidden" } });
    try {
      const out = await scoring.computeScores();
      expect(out.teams.some((t) => t.trackId === "content")).toBe(false);
      expect(out.teams.map((t) => t.overallRank)).toEqual([1, 2, 3]);
    } finally {
      await prisma.track.update({ where: { id: "content" }, data: { status: "open" } });
    }
  });

  it("computeScores({includeJury:false}) و نمایش کش‌شده هیچ نمرهٔ داوری‌ای نشان نمی‌دهند", async () => {
    cache.invalidate("scores:");
    for (const out of [await scoring.computeScores({ includeJury: false }), await scoring.computeScoresCached()]) {
      for (const t of out.teams) {
        expect(t.juryRaw).toBeNull();
        expect(t.juryAdjusted).toBe(0);
        expect(t.pts.jury).toBe(0);
      }
      expect(find(out, ids.A).ai).toBe(70);
    }
  });

  it("کش زنده با invalidate پاک می‌شود", async () => {
    cache.invalidate("scores:");
    const first = await scoring.computeScoresCached();
    expect(await scoring.computeScoresCached()).toBe(first);
    cache.invalidate("scores:");
    expect(await scoring.computeScoresCached()).not.toBe(first);
  });

  it("تنظیمات از جدول خوانده می‌شود؛ کلید قدیمی solo_boost_pct بی‌اثر است", async () => {
    await prisma.setting.createMany({
      data: [
        { key: "support_cap", value: "100" },
        { key: "rating_min_comments", value: "1000" },
        { key: "solo_boost_pct", value: "40" },
      ],
    });
    try {
      const config = await scoring.configFromSettings();
      expect(config.supportCap).toBe(100);
      expect(config.ratingMinComments).toBe(1000);
      expect(config).not.toHaveProperty("weights");
      expect(Object.keys(config.trackWeights).sort()).toEqual(["content", "general", "os"]);
      expect(config.trackWeights.general).toMatchObject({ ai: 30, market: 30, jury: 40 });
      expect(config.trackWeights.os).toMatchObject({ ai: 42, market: 6, jury: 52 });
      const out = await scoring.computeScores();
      expect(find(out, ids.A).people).toBeCloseTo((Math.sqrt(60) + Math.sqrt(20) + 5) ** 2, 9);
      expect(find(out, ids.A).marketDetail.rating).toBe(0); // کمتر از حداقل نظر
    } finally {
      await prisma.setting.deleteMany({ where: { key: { in: ["support_cap", "rating_min_comments", "solo_boost_pct"] } } });
    }
  });

  it("awardsFor از جوایز جدول و تنظیمات حداقل‌ها می‌خواند", async () => {
    const out = await scoring.computeScores();
    // جایزهٔ فنی عمومی: تنها ثبت فنی A است (کم‌جمعیت) و نمرهٔ داوری ۷۰ ≥ ۵۰
    // جایزهٔ غیرفنی: تنها B با نمرهٔ داوری null → اهدا نمی‌شود
    // جایزهٔ محتوا: A با نمرهٔ ۵۰ دقیقاً برابر حداقل
    let awards = await scoring.awardsFor(out);
    expect(awards.map((a) => [a.prizeId, a.teamId])).toEqual([
      ["prize-general-tech", ids.A],
      ["prize-content", ids.A],
    ]);
    expect(awards[0].teamName).toBe("امتیاز الف");
    expect(awards[0].productId).toBe(productA.id);

    await prisma.setting.create({ data: { key: "prize_min_entries", value: "1" } });
    try {
      awards = await scoring.awardsFor(out);
      expect(awards.map((a) => a.prizeId)).toContain("prize-general-nontech");
    } finally {
      await prisma.setting.deleteMany({ where: { key: "prize_min_entries" } });
    }

    await prisma.setting.create({ data: { key: "prize_min_jury", value: "60" } });
    try {
      awards = await scoring.awardsFor(out);
      expect(awards.map((a) => a.prizeId)).toEqual(["prize-general-tech"]);
    } finally {
      await prisma.setting.deleteMany({ where: { key: "prize_min_jury" } });
    }
  });

  it("داور دوم با نمرهٔ تازه میانگین را عوض می‌کند (بدون اثر روی نمرهٔ داور دیگر)", async () => {
    await prisma.juryScore.update({
      where: { productId_judgeId: { productId: productA.id, judgeId: judge2Id } },
      data: { scores: JSON.stringify({ works: 10, value: 10, pitch: 10 }) },
    });
    const A = find(await scoring.computeScores(), ids.A);
    expect(A.juryRaw).toBeCloseTo(90, 9);
  });
});

describe("scoring.ts: ترتیب قطعی computeScores", () => {
  it("در تساوی کامل، ثبت با محصول زودتر ثبت‌شده جلوتر است (و بی‌محصول آخر)", async () => {
    const mk = async (slug: string, submittedAt: Date | null) => {
      const t = await prisma.team.create({ data: { name: `تساوی ${slug}`, slug } });
      if (submittedAt) await makeProduct(t.id, `${slug}-os`, { trackId: "tie-track", submittedAt });
      else await makeIdea(t.id, "tie-track");
      return t.id;
    };
    await prisma.track.create({ data: { id: "tie-track", name: "محور تساوی" } });
    const late = await mk("tie-late", new Date("2026-01-02T00:00:00Z"));
    const none = await mk("tie-none", null);
    const early = await mk("tie-early", new Date("2026-01-01T00:00:00Z"));
    const out = await scoring.computeScores();
    const order = out.teams.map((t) => t.teamId).filter((id) => [late, none, early].includes(id));
    expect(order).toEqual([early, late, none]);
    expect(out.teams.filter((t) => t.trackId === "tie-track").map((t) => t.rank)).toEqual([1, 2, 3]);
  });
});
