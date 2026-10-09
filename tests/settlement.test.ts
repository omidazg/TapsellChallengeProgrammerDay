/**
 * تست واحد src/lib/settlement.ts (settleGame) روی یک پایگاه‌دادهٔ SQLite موقت.
 * settleGame در کل پایگاه‌داده محاسبه می‌کند (بدون فیلتر تیم)، پس این فایل از یک
 * سناریوی واحد و ترتیبی استفاده می‌کند تا نتایج قابل پیش‌بینی بمانند.
 *
 * در اقتصاد ساده‌شده تسویه فقط امتیازهای سه‌معیاره را در TeamScore تثبیت می‌کند:
 * سود سهام، جریمهٔ سکهٔ خرج‌نشده یا هیچ جابه‌جایی سکه‌ای در کار نیست.
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

async function makeIdea(teamId: string) {
  return prisma.idea.create({
    data: { teamId, title: "ایده", oneLiner: "x", problem: "x", audience: "x", buildPlan: "x", fundingCap: 0, revenueShare: 0, submittedAt: new Date() },
  });
}

let ids: { A: string; B: string; C: string; outsiders: string[]; aMember: string };
let computed: ScoreOutput;
let walletsBefore: Map<string, number>;
let ledgerCountBefore: number;

describe("settlement.ts: settleGame", () => {
  beforeAll(async () => {
    // تیم A: سه‌نفره، ایده با ۴ حامی بیرونی (هر کدام ۲۵) + حمایت قدیمی یک عضو خود تیم
    const teamA = await prisma.team.create({ data: { name: "تیم الف", slug: "settle-a" } });
    const aMembers = [await makeUser(teamA.id), await makeUser(teamA.id), await makeUser(teamA.id)];
    const ideaA = await makeIdea(teamA.id);
    const outsiders = [await makeUser(null), await makeUser(null), await makeUser(null), await makeUser(null)];
    for (const o of outsiders) await prisma.investment.create({ data: { ideaId: ideaA.id, userId: o.id, amount: 25 } });
    await prisma.investment.create({ data: { ideaId: ideaA.id, userId: aMembers[0].id, amount: 40, selfFunded: true } });
    await prisma.product.create({
      data: { teamId: teamA.id, name: "محصول الف", submittedAt: new Date(), juryWorks: 9, juryValue: 9, juryPitch: 9, aiQuality: 90 },
    });

    // تیم B: شرکت فردی، یک خریدار با ۱۰۰ سکه (تا سقف ۵۰ حساب می‌شود)، بدون داوری هوش مصنوعی، کسر تقلب ۱۰
    const teamB = await prisma.team.create({ data: { name: "تیم ب", slug: "settle-b", solo: true, cheatPenalty: 10, cheatNote: "آزمون" } });
    await makeUser(teamB.id);
    const productB = await prisma.product.create({
      data: { teamId: teamB.id, name: "محصول ب", submittedAt: new Date(), juryWorks: 7, juryValue: 7, juryPitch: 7 },
    });
    await prisma.purchase.create({ data: { productId: productB.id, userId: outsiders[0].id, amount: 100 } });

    // تیم C: دونفره، بدون ایده و محصول
    const teamC = await prisma.team.create({ data: { name: "تیم ج", slug: "settle-c" } });
    await makeUser(teamC.id);
    await makeUser(teamC.id);

    ids = { A: teamA.id, B: teamB.id, C: teamC.id, outsiders: outsiders.map((o) => o.id), aMember: aMembers[0].id };

    computed = await scoring.computeScores();
    walletsBefore = new Map((await prisma.user.findMany({ select: { id: true, buyWallet: true } })).map((u) => [u.id, u.buyWallet]));
    ledgerCountBefore = await prisma.ledgerEntry.count();
  });

  it("پیش از تسویه، زمان تسویه خالی است و جدول TeamScore خالی", async () => {
    expect(await settlement.getSettledAt()).toBeNull();
    expect(await prisma.teamScore.count()).toBe(0);
  });

  it("امتیازهای محاسبه‌شده همان قواعد موتور را دارند", () => {
    const A = computed.teams.find((t) => t.teamId === ids.A)!;
    const B = computed.teams.find((t) => t.teamId === ids.B)!;
    const C = computed.teams.find((t) => t.teamId === ids.C)!;
    // A: حمایت عضو خود تیم حساب نمی‌شود → (۴ × √۲۵)² = ۴۰۰
    expect(A).toMatchObject({ memberCount: 3, juryRaw: 90, juryAdjusted: 90, people: 400, supporters: 4, coinsReceived: 100, ai: 90 });
    expect(A.total).toBe(1000);
    // B: فردی → همان ۷۰ (اندازهٔ تیم در امتیاز اثری ندارد)؛ یک حامی ۱۰۰ سکه تا سقف ۵۰
    expect(B.memberCount).toBe(1);
    expect(B.juryRaw).toBe(70);
    expect(B.juryAdjusted).toBe(70);
    expect(B.people).toBeCloseTo(50, 9);
    expect(B.coinsReceived).toBe(100);
    expect(B.ai).toBeNull();
    expect(B.cheatPenalty).toBe(10);
    expect(B.total).toBeCloseTo((500 * 70) / 90 + (300 * 50) / 400 - 10, 6);
    // C: هیچ داده‌ای
    expect(C).toMatchObject({ memberCount: 2, juryRaw: null, people: 0, ai: null, total: 0 });
    expect(computed.teams.map((t) => t.teamId)).toEqual([ids.A, ids.B, ids.C]);
  });

  it("تسویهٔ اول امتیازها را در TeamScore ثبت می‌کند و هیچ سکه‌ای جابه‌جا نمی‌کند", async () => {
    const first = await settlement.settleGame();
    expect(first.alreadySettled).toBe(false);
    expect(first.teams).toBe(3);
    expect(first).not.toHaveProperty("dividendsPaid");

    const settledAt = await settlement.getSettledAt();
    expect(settledAt?.toISOString()).toBe(first.settledAt.toISOString());

    for (const t of computed.teams) {
      const row = await prisma.teamScore.findUniqueOrThrow({ where: { teamId: t.teamId } });
      expect(row).toMatchObject({
        memberCount: t.memberCount,
        juryRaw: t.juryRaw,
        people: t.people,
        supporters: t.supporters,
        coinsReceived: t.coinsReceived,
        ai: t.ai,
        cheatPenalty: t.cheatPenalty,
        rank: t.rank,
      });
      expect(row.juryAdjusted).toBeCloseTo(t.juryAdjusted, 9);
      expect(row.ptsJury).toBeCloseTo(t.pts.jury, 9);
      expect(row.ptsPeople).toBeCloseTo(t.pts.people, 9);
      expect(row.ptsAi).toBeCloseTo(t.pts.ai, 9);
      expect(row.total).toBeCloseTo(t.total, 9);
      // ستون‌های اقتصاد قدیمی صفر می‌مانند
      expect(row).toMatchObject({ dividendsPaid: 0, netSales: 0, unspentPenalty: 0, ptsPortfolio: 0, ptsTaste: 0 });
    }

    // بدون سود سهام / جریمه: هیچ کیفی تغییر نکرده و هیچ ردیف دفتر کلی ساخته نشده
    const walletsAfter = await prisma.user.findMany({ select: { id: true, buyWallet: true } });
    for (const u of walletsAfter) expect(u.buyWallet).toBe(walletsBefore.get(u.id));
    expect(await prisma.ledgerEntry.count()).toBe(ledgerCountBefore);
    expect(await prisma.ledgerEntry.count({ where: { reason: { in: ["DIVIDEND", "PENALTY"] } } })).toBe(0);
  });

  it("تسویهٔ دوم idempotent است و دادهٔ تازه امتیاز ثبت‌شده را عوض نمی‌کند", async () => {
    const before = await prisma.teamScore.findMany({ orderBy: { teamId: "asc" } });
    const settledAt = await settlement.getSettledAt();

    // خرید تازه پس از تسویه
    const productA = await prisma.product.findUniqueOrThrow({ where: { teamId: ids.A } });
    await prisma.purchase.create({ data: { productId: productA.id, userId: ids.outsiders[1], amount: 30 } });

    const second = await settlement.settleGame();
    expect(second.alreadySettled).toBe(true);
    expect(second.teams).toBe(3);
    expect(second.settledAt.toISOString()).toBe(settledAt!.toISOString());

    const after = await prisma.teamScore.findMany({ orderBy: { teamId: "asc" } });
    expect(after).toEqual(before);
  });

  it("دو فراخوانی هم‌زمان دوبار ثبت نمی‌کنند", async () => {
    const [x, y] = await Promise.all([settlement.settleGame(), settlement.settleGame()]);
    expect(x.alreadySettled).toBe(true);
    expect(y.alreadySettled).toBe(true);
    expect(await prisma.teamScore.count()).toBe(3);
  });

  it("loadSettledOutput همان اعداد ثبت‌شده را به ترتیب رتبه برمی‌گرداند، نه بازمحاسبه", async () => {
    const output = await settlement.loadSettledOutput();
    expect(output.teams.map((t) => t.teamId)).toEqual(computed.teams.map((t) => t.teamId));
    for (const [i, t] of output.teams.entries()) {
      const c = computed.teams[i];
      expect(t.rank).toBe(i + 1);
      expect(t).toMatchObject({
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
      expect(t.pts.people).toBeCloseTo(c.pts.people, 9);
      expect(t.pts.ai).toBeCloseTo(c.pts.ai, 9);
    }
    // نمرهٔ داوری ثبت‌شده همان نمرهٔ خام است؛ تیم فردی هیچ افزایشی ندارد
    expect(output.teams.find((t) => t.teamId === ids.B)!.juryAdjusted).toBe(70);
    expect(output.teams.find((t) => t.teamId === ids.A)!.juryAdjusted).toBe(90);
    expect(output.teams.every((t) => !("boostPct" in t))).toBe(true);

    // خرید پس از تسویه در خروجی ثبت‌شده نیست ولی در بازمحاسبهٔ خام هست
    const fresh = await scoring.computeScores();
    const freshA = fresh.teams.find((t) => t.teamId === ids.A)!;
    const settledA = output.teams.find((t) => t.teamId === ids.A)!;
    expect(freshA.coinsReceived).toBe(130);
    expect(settledA.coinsReceived).toBe(100);
  });
});
