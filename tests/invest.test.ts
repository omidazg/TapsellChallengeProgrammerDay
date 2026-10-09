/**
 * تست واحد src/lib/invest.ts (investCore — حمایت از ایده با سکه) روی یک پایگاه‌دادهٔ SQLite موقت.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let invest: typeof import("../src/lib/invest");

async function setPhaseRow(value: string) {
  await prisma.setting.upsert({ where: { key: "phase" }, update: { value }, create: { key: "phase", value } });
}

beforeAll(async () => {
  db = createTempDb("invest-test");
  ({ prisma } = await import("../src/lib/db"));
  invest = await import("../src/lib/invest");
  await setPhaseRow("SEED_ROUND");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeTeamWithIdea(opts: { submitted?: boolean } = {}) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم حمایت ${counter}`, slug: `invest-team-${counter}` } });
  const idea = await prisma.idea.create({
    data: {
      teamId: team.id,
      title: `ایده ${counter}`,
      oneLiner: "x",
      problem: "x",
      audience: "x",
      buildPlan: "x",
      fundingCap: 0,
      revenueShare: 0,
      submittedAt: opts.submitted === false ? null : new Date(),
    },
  });
  return { team, idea };
}

/** حامی با کیف سکه؛ teamId اختیاری است (کاربر بی‌تیم هم می‌تواند حمایت کند). */
async function makeSupporter(buyWallet = 100, teamId: string | null = null) {
  counter++;
  return prisma.user.create({
    data: {
      email: `supporter-${counter}@example.test`,
      passwordHash: "x",
      nickname: `حامی ${counter}`,
      role: "DEALMAKER",
      power: "",
      seedWallet: 0,
      buyWallet,
      teamId,
    },
  });
}

async function walletOf(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).buyWallet;
}

describe("invest.ts: investCore — جریان اصلی", () => {
  it("حمایت را ثبت، کیف سکه را کم و یک ردیف دفتر کل INVEST ثبت می‌کند", async () => {
    const { team, idea } = await makeTeamWithIdea();
    const { team: ownTeam } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100, ownTeam.id);

    const res = await invest.investCore(prisma, supporter.id, idea.id, 10);
    expect(res).toMatchObject({ ok: true, selfFunded: false });
    if (!res.ok) return;

    expect(await walletOf(supporter.id)).toBe(90);

    const row = await prisma.investment.findUniqueOrThrow({ where: { id: res.investmentId } });
    expect(row).toMatchObject({ ideaId: idea.id, userId: supporter.id, amount: 10, selfFunded: false });

    const ledger = await prisma.ledgerEntry.findMany({ where: { refId: res.investmentId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ userId: supporter.id, teamId: team.id, wallet: "BUY", delta: -10, reason: "INVEST" });
  });

  it("خزانهٔ تیم و کیف بذر قدیمی دست نمی‌خورند (یک کیف سکه)", async () => {
    const { team, idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100);
    const res = await invest.investCore(prisma, supporter.id, idea.id, 25);
    expect(res.ok).toBe(true);
    const teamAfter = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(teamAfter.treasury).toBe(0);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: supporter.id } });
    expect(after.seedWallet).toBe(0);
    expect(after.buyWallet).toBe(75);
    expect(await prisma.ledgerEntry.count({ where: { refId: res.ok ? res.investmentId : "", wallet: { not: "BUY" } } })).toBe(0);
  });

  it("کاربر بی‌تیم هم می‌تواند حمایت کند", async () => {
    const { idea } = await makeTeamWithIdea();
    const teamless = await makeSupporter(50, null);
    const res = await invest.investCore(prisma, teamless.id, idea.id, 20);
    expect(res.ok).toBe(true);
    expect(await walletOf(teamless.id)).toBe(30);
  });

  it("حمایت از ایدهٔ تیم خود ممنوع است و کیف دست نمی‌خورد", async () => {
    const { team, idea } = await makeTeamWithIdea();
    const member = await makeSupporter(100, team.id);
    const res = await invest.investCore(prisma, member.id, idea.id, 10);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("تیم خودت");
    expect(await walletOf(member.id)).toBe(100);
    expect(await prisma.investment.count({ where: { userId: member.id } })).toBe(0);
  });

  it("سقفی برای هر ایده نیست و چند حمایت پیاپی از یک ایده مجاز است", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(300);
    const r1 = await invest.investCore(prisma, supporter.id, idea.id, 150);
    const r2 = await invest.investCore(prisma, supporter.id, idea.id, 100);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(await invest.investedByUserOnIdea(supporter.id, idea.id)).toBe(250);
    expect(await invest.totalInvestedByUser(supporter.id)).toBe(250);
    expect(await walletOf(supporter.id)).toBe(50);
  });
});

describe("invest.ts: investCore — محدودیت‌ها", () => {
  it("بیش از موجودی کیف سکه رد می‌شود و دقیقاً به اندازهٔ موجودی مجاز است", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(20);
    const over = await invest.investCore(prisma, supporter.id, idea.id, 21);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("سکهٔ کافی");
    const exact = await invest.investCore(prisma, supporter.id, idea.id, 20);
    expect(exact.ok).toBe(true);
    expect(await walletOf(supporter.id)).toBe(0);
  });

  it("مبلغ صفر، منفی یا نامعتبر رد می‌شود", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100);
    for (const amount of [0, -5, Number.NaN]) {
      const res = await invest.investCore(prisma, supporter.id, idea.id, amount);
      expect(res.ok).toBe(false);
    }
    expect(await walletOf(supporter.id)).toBe(100);
  });

  it("مبلغ اعشاری گرد می‌شود", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100);
    const res = await invest.investCore(prisma, supporter.id, idea.id, 10.4);
    expect(res.ok).toBe(true);
    expect(await walletOf(supporter.id)).toBe(90);
  });

  it("ایدهٔ ثبت‌نهایی‌نشده یا ناموجود رد می‌شود", async () => {
    const { idea } = await makeTeamWithIdea({ submitted: false });
    const supporter = await makeSupporter(100);
    expect((await invest.investCore(prisma, supporter.id, idea.id, 10)).ok).toBe(false);
    expect((await invest.investCore(prisma, supporter.id, "no-such-idea", 10)).ok).toBe(false);
    expect(await walletOf(supporter.id)).toBe(100);
  });

  it("کاربر ناموجود رد می‌شود", async () => {
    const { idea } = await makeTeamWithIdea();
    const res = await invest.investCore(prisma, "no-such-user", idea.id, 10);
    expect(res.ok).toBe(false);
  });

  it("بیرون از «دور حمایت» رد می‌شود", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100);
    try {
      for (const phase of ["REGISTRATION", "IDEATION", "BUILD", "MARKET", "CLOSED"]) {
        await setPhaseRow(phase);
        const res = await invest.investCore(prisma, supporter.id, idea.id, 10);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("دور حمایت");
      }
    } finally {
      await setPhaseRow("SEED_ROUND");
    }
    expect(await walletOf(supporter.id)).toBe(100);
  });
});

describe("invest.ts: investCore — سکه‌های رزروشدهٔ حراج", () => {
  it("سکه‌ای که برای پیشتازی در حراج زنده رزرو شده خرج‌شدنی نیست", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100);

    // supporter بالاترین پیشنهاد یک حراج زنده است → ۶۰ سکه رزرو
    counter++;
    const otherTeam = await prisma.team.create({ data: { name: `تیم حراج ${counter}`, slug: `invest-auction-${counter}` } });
    const product = await prisma.product.create({ data: { teamId: otherTeam.id, name: "محصول", submittedAt: new Date() } });
    const auction = await prisma.auction.create({
      data: { productId: product.id, startPrice: 20, status: "LIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 60_000) },
    });
    await prisma.bid.create({ data: { auctionId: auction.id, userId: supporter.id, amount: 60 } });

    try {
      const tooMuch = await invest.investCore(prisma, supporter.id, idea.id, 41);
      expect(tooMuch.ok).toBe(false);
      if (!tooMuch.ok) expect(tooMuch.error).toContain("سکهٔ کافی");

      const ok = await invest.investCore(prisma, supporter.id, idea.id, 40);
      expect(ok.ok).toBe(true);
      expect(await walletOf(supporter.id)).toBe(60);

      // وقتی کس دیگری پیشنهاد بالاتر بدهد، رزرو آزاد می‌شود
      const other = await makeSupporter(100);
      await prisma.bid.create({ data: { auctionId: auction.id, userId: other.id, amount: 70 } });
      const afterOutbid = await invest.investCore(prisma, supporter.id, idea.id, 60);
      expect(afterOutbid.ok).toBe(true);
      expect(await walletOf(supporter.id)).toBe(0);
    } finally {
      await prisma.auction.update({ where: { id: auction.id }, data: { status: "ENDED" } });
    }
  });
});

describe("invest.ts: investCore — اتمی بودن", () => {
  it("دو حمایت هم‌زمان کیف را منفی نمی‌کنند", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(100);
    const results = await Promise.all([
      invest.investCore(prisma, supporter.id, idea.id, 60),
      invest.investCore(prisma, supporter.id, idea.id, 60),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await walletOf(supporter.id)).toBe(40);
    expect(await prisma.investment.count({ where: { userId: supporter.id } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { userId: supporter.id, reason: "INVEST" } })).toBe(1);
  });

  it("حمایت ردشده پس از یک حمایت موفق کیف را تغییر نمی‌دهد", async () => {
    const { idea } = await makeTeamWithIdea();
    const supporter = await makeSupporter(50);
    expect((await invest.investCore(prisma, supporter.id, idea.id, 40)).ok).toBe(true);
    const before = await walletOf(supporter.id);
    const rejected = await invest.investCore(prisma, supporter.id, idea.id, 11);
    expect(rejected.ok).toBe(false);
    expect(await walletOf(supporter.id)).toBe(before);
  });
});
