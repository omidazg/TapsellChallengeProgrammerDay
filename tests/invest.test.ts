/**
 * تست واحد src/lib/invest.ts (investCore) روی یک پایگاه‌دادهٔ SQLite موقت.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let invest: typeof import("../src/lib/invest");

beforeAll(async () => {
  db = createTempDb("invest-test");
  ({ prisma } = await import("../src/lib/db"));
  invest = await import("../src/lib/invest");
  await prisma.setting.upsert({ where: { key: "phase" }, update: { value: "SEED_ROUND" }, create: { key: "phase", value: "SEED_ROUND" } });
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeTeamWithIdea(fundingCap = 200) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم سرمایه ${counter}`, slug: `invest-team-${counter}` } });
  const idea = await prisma.idea.create({
    data: {
      teamId: team.id,
      title: `ایده ${counter}`,
      oneLiner: "x",
      problem: "x",
      audience: "x",
      buildPlan: "x",
      fundingCap,
      revenueShare: 30,
      submittedAt: new Date(),
    },
  });
  return { team, idea };
}

async function makeInvestor(seedWallet = 100, teamId?: string) {
  counter++;
  // investCore نیازمند عضویت در یک تیم است (حتی برای سرمایه‌گذاری روی تیم دیگر)؛
  // اگر teamId مشخص نشده، یک تیم مستقل کوچک برای این کاربر می‌سازیم.
  const ownTeamId = teamId ?? (await prisma.team.create({ data: { name: `تیم سرمایه‌گذار ${counter}`, slug: `investor-team-${counter}` } })).id;
  return prisma.user.create({
    data: {
      email: `investor-${counter}@example.test`,
      passwordHash: "x",
      nickname: `سرمایه‌گذار ${counter}`,
      role: "DEALMAKER",
      power: "HYPE",
      seedWallet,
      teamId: ownTeamId,
    },
  });
}

describe("invest.ts: investCore — basic flow", () => {
  it("records an investment, debits the wallet and credits team treasury + ledger", async () => {
    const { team, idea } = await makeTeamWithIdea();
    const investor = await makeInvestor(100);

    const res = await invest.investCore(prisma, investor.id, idea.id, 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const after = await prisma.user.findUniqueOrThrow({ where: { id: investor.id } });
    expect(after.seedWallet).toBe(90);

    const teamAfter = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(teamAfter.treasury).toBe(10);

    const ledger = await prisma.ledgerEntry.findFirst({ where: { refId: res.investmentId, wallet: "SEED" } });
    expect(ledger?.delta).toBe(-10);
    expect(ledger?.reason).toBe("INVEST");
    expect(res.selfFunded).toBe(false);
  });

  it("flags self-funded investment on your own team", async () => {
    const { team, idea } = await makeTeamWithIdea();
    const owner = await makeInvestor(100, team.id);
    const res = await invest.investCore(prisma, owner.id, idea.id, 10);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.selfFunded).toBe(true);
  });
});

describe("invest.ts: investCore — limits", () => {
  it("rejects amounts exceeding the max-per-target cap (40)", async () => {
    const { idea } = await makeTeamWithIdea();
    const investor = await makeInvestor(100);
    const r1 = await invest.investCore(prisma, investor.id, idea.id, 25);
    expect(r1.ok).toBe(true);
    const r2 = await invest.investCore(prisma, investor.id, idea.id, 20); // 25+20=45 > 40
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain("سقف سرمایه‌گذاری");
  });

  it("rejects amounts exceeding the seed wallet balance", async () => {
    const { idea } = await makeTeamWithIdea();
    const investor = await makeInvestor(5);
    const res = await invest.investCore(prisma, investor.id, idea.id, 20);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("موجودی کیف بذر");
  });

  it("rejects non-positive amounts", async () => {
    const { idea } = await makeTeamWithIdea();
    const investor = await makeInvestor(100);
    const res = await invest.investCore(prisma, investor.id, idea.id, 0);
    expect(res.ok).toBe(false);
  });

  it("rejects exceeding the idea's funding cap even under the per-target cap", async () => {
    const { idea } = await makeTeamWithIdea(15); // سقف جذب کوچک
    const investor = await makeInvestor(100);
    const res = await invest.investCore(prisma, investor.id, idea.id, 20);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("سقف جذب سرمایهٔ این ایده پر شده است");
  });

  it("rejects investing when the user has no team", async () => {
    const { idea } = await makeTeamWithIdea();
    counter++;
    const noTeamUser = await prisma.user.create({
      data: { email: `noteam-${counter}@example.test`, passwordHash: "x", nickname: "بی‌تیم", role: "DEALMAKER", power: "HYPE", seedWallet: 100 },
    });
    const res = await invest.investCore(prisma, noTeamUser.id, idea.id, 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("ابتدا باید عضو یک تیم باشی");
  });

  it("rejects investing outside the SEED_ROUND phase", async () => {
    await prisma.setting.upsert({ where: { key: "phase" }, update: { value: "BUILD" }, create: { key: "phase", value: "BUILD" } });
    const { idea } = await makeTeamWithIdea();
    const investor = await makeInvestor(100);
    const res = await invest.investCore(prisma, investor.id, idea.id, 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("دور سرمایه‌گذاری");
    await prisma.setting.upsert({ where: { key: "phase" }, update: { value: "SEED_ROUND" }, create: { key: "phase", value: "SEED_ROUND" } });
  });
});

describe("invest.ts: investCore — atomicity", () => {
  it("leaves the wallet unchanged when a rejected call happens after a successful one", async () => {
    const { idea } = await makeTeamWithIdea(20);
    const investor = await makeInvestor(100);
    await invest.investCore(prisma, investor.id, idea.id, 20); // fills funding cap exactly
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: investor.id } })).seedWallet;
    const rejected = await invest.investCore(prisma, investor.id, idea.id, 5); // exceeds cap
    expect(rejected.ok).toBe(false);
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: investor.id } })).seedWallet;
    expect(after).toBe(before);
  });
});
