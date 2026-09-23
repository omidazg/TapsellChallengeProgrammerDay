/**
 * تست واحد src/lib/settlement.ts (settleGame) روی یک پایگاه‌دادهٔ SQLite موقت.
 * settleGame در کل پایگاه‌داده محاسبه می‌کند (بدون فیلتر تیم)، پس این فایل از یک
 * سناریوی واحد و ترتیبی استفاده می‌کند تا نتایج قابل پیش‌بینی بمانند.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let settlement: typeof import("../src/lib/settlement");

beforeAll(async () => {
  db = createTempDb("settlement-test");
  ({ prisma } = await import("../src/lib/db"));
  settlement = await import("../src/lib/settlement");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

describe("settlement.ts: settleGame", () => {
  it("pays dividends, records team scores and is idempotent on repeated calls", async () => {
    // --- سناریو: یک تیم با ۵۰٪ سود سرمایه‌گذار، یک سرمایه‌گذار خارجی و یک خریدار ---
    const team = await prisma.team.create({ data: { name: "تیم تسویه", slug: "settlement-team" } });
    const owner = await prisma.user.create({
      data: { email: "settle-owner@example.test", passwordHash: "x", nickname: "بنیان‌گذار", role: "BUILDER", power: "HYPE", teamId: team.id, buyWallet: 0 },
    });
    const investor = await prisma.user.create({
      data: { email: "settle-investor@example.test", passwordHash: "x", nickname: "سرمایه‌گذار", role: "DEALMAKER", power: "HYPE", buyWallet: 0 },
    });
    const buyer = await prisma.user.create({
      data: { email: "settle-buyer@example.test", passwordHash: "x", nickname: "خریدار", role: "STORYTELLER", power: "HYPE", buyWallet: 0 },
    });

    const idea = await prisma.idea.create({
      data: {
        teamId: team.id,
        title: "ایدهٔ تسویه",
        oneLiner: "x",
        problem: "x",
        audience: "x",
        buildPlan: "x",
        fundingCap: 200,
        revenueShare: 50,
        submittedAt: new Date(),
      },
    });
    await prisma.investment.create({ data: { ideaId: idea.id, userId: investor.id, amount: 40, selfFunded: false } });

    const product = await prisma.product.create({ data: { teamId: team.id, name: "محصول تسویه", submittedAt: new Date() } });
    await prisma.purchase.create({ data: { productId: product.id, userId: buyer.id, amount: 50, discount: 0 } });

    expect(await settlement.getSettledAt()).toBeNull();

    // --- تسویهٔ اول ---
    const first = await settlement.settleGame();
    expect(first.alreadySettled).toBe(false);
    // pool = 50 * 0.5 = 25؛ سرمایهٔ خارجی = 40 → dividend = floor(25 * 40/40) = 25
    expect(first.dividendsPaid).toBe(25);
    expect(first.dividendLines).toBe(1);
    expect(first.teams).toBe(1);

    const investorAfter = await prisma.user.findUniqueOrThrow({ where: { id: investor.id } });
    expect(investorAfter.buyWallet).toBe(25);

    const score = await prisma.teamScore.findUniqueOrThrow({ where: { teamId: team.id } });
    expect(score.grossSales).toBe(50);
    expect(score.dividendsPaid).toBe(25);
    expect(score.netSales).toBe(25);
    expect(score.externalCapital).toBe(40);

    // --- تسویهٔ دوم: نباید دوباره پرداخت کند (idempotent) ---
    const second = await settlement.settleGame();
    expect(second.alreadySettled).toBe(true);
    expect(second.dividendsPaid).toBe(first.dividendsPaid);

    const investorAfterSecond = await prisma.user.findUniqueOrThrow({ where: { id: investor.id } });
    expect(investorAfterSecond.buyWallet).toBe(25); // دوباره واریز نشده

    const totalDividendLedger = await prisma.ledgerEntry.count({ where: { reason: "DIVIDEND", wallet: "BUY", userId: investor.id } });
    expect(totalDividendLedger).toBe(1);
  });

  it("loadSettledOutput reads back the same totals from TeamScore/ledger, not a recomputation", async () => {
    const output = await settlement.loadSettledOutput();
    expect(output.teams).toHaveLength(1);
    expect(output.teams[0].dividendsPaid).toBe(25);
    expect(output.dividends).toHaveLength(1);
    expect(output.dividends[0]).toMatchObject({ invested: 40, dividend: 25 });
  });
});
