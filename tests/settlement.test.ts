/**
 * تست واحد src/lib/settlement.ts (settleGame) روی یک پایگاه‌دادهٔ SQLite موقت.
 * settleGame در کل پایگاه‌داده محاسبه می‌کند (بدون فیلتر تیم)، پس این فایل از یک
 * سناریوی واحد و ترتیبی استفاده می‌کند تا نتایج قابل پیش‌بینی بمانند.
 *
 * تسویه فقط امتیازهای هر ثبت (تیم در یک محور) را در TeamScore تثبیت می‌کند و هیچ سکه‌ای جابه‌جا نمی‌کند.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";
import type { ScoreOutput } from "../src/lib/economy/types";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let settlement: typeof import("../src/lib/settlement");
let scoring: typeof import("../src/lib/scoring");

beforeAll(async () => {
  db = createTempDb("settlement-test");
  ({ prisma } = await import("../src/lib/db"));
  settlement = await import("../src/lib/settlement");
  scoring = await import("../src/lib/scoring");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeUser(teamId: string | null, buyWallet = 200) {
  counter++;
  return prisma.user.create({
    data: {
      email: `settle-${counter}@example.test`,
      passwordHash: "x",
      nickname: `کاربر ${counter}`,
      role: "BUILDER",
      power: "",
      seedWallet: 0,
      buyWallet,
      teamId,
    },
  });
}

async function makeIdea(teamId: string, trackId = "general") {
  return prisma.idea.create({
    data: { teamId, trackId, title: "ایده", oneLiner: "x", problem: "x", audience: "x", buildPlan: "x", fundingCap: 0, revenueShare: 0, submittedAt: new Date() },
  });
}

/** نمرهٔ یک داور با مقدار یکسان برای همهٔ معیارهای پیش‌فرض */
async function juryScore(productId: string, judgeId: string, n: number) {
  await prisma.juryScore.create({ data: { productId, judgeId, scores: JSON.stringify({ works: n, value: n, pitch: n }) } });
}

let ids: { A: string; B: string; C: string; outsiders: string[]; aMember: string; productA: string; productAContent: string };
let computed: ScoreOutput;
let walletsBefore: Map<string, number>;
let ledgerCountBefore: number;

const score = (teamId: string, trackId = "general") => prisma.teamScore.findUnique({ where: { teamId_trackId: { teamId, trackId } } });

describe("settlement.ts: settleGame", () => {
  beforeAll(async () => {
    // تیم A: سه‌نفره، ایده با ۴ حامی بیرونی (هر کدام ۲۵) + حمایت قدیمی یک عضو خود تیم
    const teamA = await prisma.team.create({ data: { name: "تیم الف", slug: "settle-a" } });
    const aMembers = [await makeUser(teamA.id), await makeUser(teamA.id), await makeUser(teamA.id)];
    const ideaA = await makeIdea(teamA.id);
    const outsiders = [await makeUser(null), await makeUser(null), await makeUser(null), await makeUser(null)];
    const judge = await makeUser(null);
    for (const o of outsiders) await prisma.investment.create({ data: { ideaId: ideaA.id, userId: o.id, amount: 25 } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: aMembers[0].id, amount: 40, selfFunded: true } });
    const productA = await prisma.product.create({
      data: { teamId: teamA.id, slug: "settle-a-general", name: "محصول الف", category: "TECH", submittedAt: new Date(), aiQuality: 90 },
    });
    await juryScore(productA.id, judge.id, 9);

    // همان تیم در محور محتوا با محصول جدا
    const productAContent = await prisma.product.create({
      data: { teamId: teamA.id, slug: "settle-a-content", trackId: "content", name: "محتوای الف", submittedAt: new Date(), aiQuality: 50 },
    });

    // تیم B: شرکت فردی، یک خریدار با ۱۰۰ سکه (تا سقف ۵۰ حساب می‌شود)، بدون داوری هوش مصنوعی، کسر تقلب ۱۰
    const teamB = await prisma.team.create({ data: { name: "تیم ب", slug: "settle-b", solo: true, cheatPenalty: 10, cheatNote: "آزمون" } });
    await makeUser(teamB.id);
    const productB = await prisma.product.create({
      data: { teamId: teamB.id, slug: "settle-b-general", name: "محصول ب", submittedAt: new Date() },
    });
    await juryScore(productB.id, judge.id, 7);
    await prisma.purchase.create({ data: { productId: productB.id, userId: outsiders[0].id, amount: 100 } });

    // تیم C: دونفره، بدون ایده و محصول (ثبتی ندارد)
    const teamC = await prisma.team.create({ data: { name: "تیم ج", slug: "settle-c" } });
    await makeUser(teamC.id);
    await makeUser(teamC.id);

    ids = {
      A: teamA.id,
      B: teamB.id,
      C: teamC.id,
      outsiders: outsiders.map((o) => o.id),
      aMember: aMembers[0].id,
      productA: productA.id,
      productAContent: productAContent.id,
    };

    computed = await scoring.computeScores();
    walletsBefore = new Map((await prisma.user.findMany({ select: { id: true, buyWallet: true } })).map((u) => [u.id, u.buyWallet]));
    ledgerCountBefore = await prisma.ledgerEntry.count();
  });

  it("پیش از تسویه، زمان تسویه خالی است و جدول TeamScore خالی", async () => {
    expect(await settlement.getSettledAt()).toBeNull();
    expect(await prisma.teamScore.count()).toBe(0);
  });

  it("امتیازهای محاسبه‌شده همان قواعد موتور را دارند", () => {
    const entry = (teamId: string, trackId = "general") => computed.teams.find((t) => t.teamId === teamId && t.trackId === trackId)!;
    const A = entry(ids.A);
    const B = entry(ids.B);
    // A: حمایت عضو خود تیم حساب نمی‌شود → (۴ × √۲۵)² = ۴۰۰
    expect(A).toMatchObject({ memberCount: 3, juryRaw: 90, juryAdjusted: 90, people: 400, supporters: 4, coinsReceived: 100, ai: 90, category: "TECH" });
    expect(A.total).toBeCloseTo(400 + 60 + 300, 9);
    // B: فردی → همان ۷۰ (اندازهٔ تیم در امتیاز اثری ندارد)؛ یک حامی ۱۰۰ سکه تا سقف ۵۰
    expect(B.memberCount).toBe(1);
    expect(B.juryRaw).toBeCloseTo(70, 9);
    expect(B.people).toBeCloseTo(50, 9);
    expect(B.coinsReceived).toBe(100);
    expect(B.ai).toBeNull();
    expect(B.cheatPenalty).toBe(10);
    expect(B.total).toBeCloseTo((400 * 70) / 90 + (60 * 50) / 400 - 10, 6);
    // ثبت محتوا: تنها ثبت محور، بدون داوری
    expect(entry(ids.A, "content")).toMatchObject({ juryRaw: null, ai: 50, rank: 1 });
    expect(entry(ids.A, "content").total).toBeCloseTo(420, 9);
    // C: ثبتی ندارد
    expect(computed.teams.some((t) => t.teamId === ids.C)).toBe(false);
    expect(computed.teams.map((t) => t.overallRank)).toEqual([1, 2, 3]);
  });

  it("تسویهٔ اول امتیاز هر ثبت را در TeamScore ثبت می‌کند و هیچ سکه‌ای جابه‌جا نمی‌کند", async () => {
    const first = await settlement.settleGame();
    expect(first.alreadySettled).toBe(false);
    expect(first.teams).toBe(3);
    expect(first).not.toHaveProperty("dividendsPaid");

    const settledAt = await settlement.getSettledAt();
    expect(settledAt?.toISOString()).toBe(first.settledAt.toISOString());

    for (const t of computed.teams) {
      const row = await score(t.teamId, t.trackId);
      expect(row).not.toBeNull();
      expect(row).toMatchObject({
        trackId: t.trackId,
        productId: t.productId,
        category: t.category,
        memberCount: t.memberCount,
        juryRaw: t.juryRaw,
        people: t.people,
        supporters: t.supporters,
        coinsReceived: t.coinsReceived,
        ai: t.ai,
        cheatPenalty: t.cheatPenalty,
        rank: t.rank,
        overallRank: t.overallRank,
      });
      expect(row!.juryAdjusted).toBeCloseTo(t.juryAdjusted, 9);
      expect(row!.ptsJury).toBeCloseTo(t.pts.jury, 9);
      expect(row!.ptsMarket).toBeCloseTo(t.pts.market, 9);
      expect(row!.ptsAi).toBeCloseTo(t.pts.ai, 9);
      expect(row!.total).toBeCloseTo(t.total, 9);
      expect(JSON.parse(row!.marketDetail)).toEqual(t.marketDetail);
      // ستون‌های اقتصاد قدیمی صفر می‌مانند
      expect(row).toMatchObject({ dividendsPaid: 0, netSales: 0, unspentPenalty: 0, ptsPortfolio: 0, ptsTaste: 0, ptsPeople: 0 });
    }
    expect(await score(ids.C)).toBeNull();

    // بدون سود سهام / جریمه: هیچ کیفی تغییر نکرده و هیچ ردیف دفتر کلی ساخته نشده
    const walletsAfter = await prisma.user.findMany({ select: { id: true, buyWallet: true } });
    for (const u of walletsAfter) expect(u.buyWallet).toBe(walletsBefore.get(u.id));
    expect(await prisma.ledgerEntry.count()).toBe(ledgerCountBefore);
    expect(await prisma.ledgerEntry.count({ where: { reason: { in: ["DIVIDEND", "PENALTY"] } } })).toBe(0);
  });

  it("تسویهٔ دوم idempotent است و دادهٔ تازه امتیاز ثبت‌شده را عوض نمی‌کند", async () => {
    const before = await prisma.teamScore.findMany({ orderBy: [{ teamId: "asc" }, { trackId: "asc" }] });
    const settledAt = await settlement.getSettledAt();

    // خرید تازه پس از تسویه
    await prisma.purchase.create({ data: { productId: ids.productA, userId: ids.outsiders[1], amount: 30 } });

    const second = await settlement.settleGame();
    expect(second.alreadySettled).toBe(true);
    expect(second.teams).toBe(3);
    expect(second.settledAt.toISOString()).toBe(settledAt!.toISOString());

    const after = await prisma.teamScore.findMany({ orderBy: [{ teamId: "asc" }, { trackId: "asc" }] });
    expect(after).toEqual(before);
  });

  it("دو فراخوانی هم‌زمان دوبار ثبت نمی‌کنند", async () => {
    const [x, y] = await Promise.all([settlement.settleGame(), settlement.settleGame()]);
    expect(x.alreadySettled).toBe(true);
    expect(y.alreadySettled).toBe(true);
    expect(await prisma.teamScore.count()).toBe(3);
  });

  it("loadSettledOutput همان اعداد ثبت‌شده را به ترتیب رتبهٔ کلی برمی‌گرداند، نه بازمحاسبه", async () => {
    const output = await settlement.loadSettledOutput();
    expect(output.teams.map(scoring.entryKey)).toEqual(computed.teams.map(scoring.entryKey));
    for (const [i, t] of output.teams.entries()) {
      const c = computed.teams[i];
      expect(t.overallRank).toBe(i + 1);
      expect(t.rank).toBe(c.rank);
      expect(t).toMatchObject({
        trackId: c.trackId,
        category: c.category,
        productId: c.productId,
        productName: c.productName,
        memberCount: c.memberCount,
        juryRaw: c.juryRaw,
        people: c.people,
        supporters: c.supporters,
        coinsReceived: c.coinsReceived,
        ai: c.ai,
        cheatPenalty: c.cheatPenalty,
      });
      expect(t.total).toBeCloseTo(c.total, 9);
      expect(t.pts.jury).toBeCloseTo(c.pts.jury, 9);
      expect(t.pts.market).toBeCloseTo(c.pts.market, 9);
      expect(t.pts.ai).toBeCloseTo(c.pts.ai, 9);
      expect(t.marketDetail).toEqual(c.marketDetail);
    }
    const inGeneral = output.teams.filter((t) => t.trackId === "general");
    // نمرهٔ داوری ثبت‌شده همان نمرهٔ خام است؛ تیم فردی هیچ افزایشی ندارد
    expect(inGeneral.find((t) => t.teamId === ids.B)!.juryAdjusted).toBeCloseTo(70, 9);
    expect(inGeneral.find((t) => t.teamId === ids.A)!.juryAdjusted).toBeCloseTo(90, 9);
    expect(output.teams.every((t) => !("boostPct" in t))).toBe(true);

    // خرید پس از تسویه در خروجی ثبت‌شده نیست ولی در بازمحاسبهٔ خام هست
    const fresh = await scoring.computeScores();
    const freshA = fresh.teams.find((t) => t.teamId === ids.A && t.trackId === "general")!;
    const settledA = inGeneral.find((t) => t.teamId === ids.A)!;
    expect(freshA.coinsReceived).toBe(130);
    expect(settledA.coinsReceived).toBe(100);
  });

  it("بازتسویه نمرهٔ دیرهنگام داور را جایگزین می‌کند و ردیف محور مخفی‌شده را برمی‌دارد", async () => {
    const judge = await makeUser(null);
    await juryScore(ids.productAContent, judge.id, 8);
    await settlement.resettleGame();
    expect((await score(ids.A, "content"))!.juryRaw).toBeCloseTo(80, 9);
    expect((await score(ids.A, "content"))!.ptsJury).toBeCloseTo(520, 9);

    await prisma.track.update({ where: { id: "content" }, data: { status: "hidden" } });
    try {
      await settlement.resettleGame();
      expect(await score(ids.A, "content")).toBeNull();
      expect(await score(ids.A)).not.toBeNull();
      expect(await prisma.teamScore.count()).toBe(2);
    } finally {
      await prisma.track.update({ where: { id: "content" }, data: { status: "open" } });
    }
  });
});
