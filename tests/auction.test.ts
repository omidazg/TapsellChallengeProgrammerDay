/**
 * تست واحد src/lib/auction.ts روی یک پایگاه‌دادهٔ SQLite موقت:
 *  - placeBid (قیمت پایه، گام، موجودی قابل‌خرج، رزرو، تیم خود)
 *  - صف حراج: enqueueAuction، شروع/تسویهٔ خودکار، زمان‌بند و پایان بازی.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let auction: typeof import("../src/lib/auction");
let phase: typeof import("../src/lib/phase");
let scheduler: typeof import("../src/lib/scheduler");

beforeAll(async () => {
  db = createTempDb("auction-test");
  ({ prisma } = await import("../src/lib/db"));
  auction = await import("../src/lib/auction");
  phase = await import("../src/lib/phase");
  scheduler = await import("../src/lib/scheduler");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeBidder(buyWallet = 100, teamId: string | null = null) {
  counter++;
  return prisma.user.create({
    data: {
      email: `bidder-${counter}@example.test`,
      passwordHash: "x",
      nickname: `مزایده‌گر ${counter}`,
      role: "DEALMAKER",
      power: "",
      buyWallet,
      teamId,
    },
  });
}

async function walletOf(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).buyWallet;
}

/** یک تیم + محصول + حراج SCHEDULED/LIVE می‌سازد و برمی‌گرداند */
async function makeAuction(opts: { status?: "SCHEDULED" | "LIVE" | "ENDED"; startPrice?: number; endsInMs?: number } = {}) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم حراج ${counter}`, slug: `auction-team-${counter}` } });
  const product = await prisma.product.create({
    data: { teamId: team.id, slug: `auction-team-${counter}-general`, name: `محصول ${counter}`, submittedAt: new Date(), specialStart: opts.startPrice ?? 20 },
  });
  const status = opts.status ?? "LIVE";
  const now = new Date();
  const endsAt = status === "LIVE" ? new Date(now.getTime() + (opts.endsInMs ?? 60_000)) : null;
  const row = await prisma.auction.create({
    data: {
      productId: product.id,
      startPrice: opts.startPrice ?? 20,
      status,
      startsAt: status === "LIVE" ? now : null,
      endsAt,
    },
  });
  return { team, product, auction: row };
}

/** تیم با محصول (ثبت‌نهایی‌شده یا نه) و اعضایش، برای صف حراج */
async function makeTeamWithProduct(opts: { members?: number; submitted?: boolean; specialStart?: number; withProduct?: boolean } = {}) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم صف ${counter}`, slug: `queue-team-${counter}` } });
  const members = [];
  for (let i = 0; i < (opts.members ?? 1); i++) members.push(await makeBidder(100, team.id));
  const product =
    opts.withProduct === false
      ? null
      : await prisma.product.create({
          data: {
            teamId: team.id,
            slug: `queue-team-${counter}-general`,
            name: `محصول صف ${counter}`,
            submittedAt: opts.submitted === false ? null : new Date(),
            specialStart: opts.specialStart ?? 20,
          },
        });
  return { team, product, members };
}

describe("auction.ts: placeBid — reserve / min increment", () => {
  it("accepts a first bid exactly at the start price (reserve)", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder();
    const res = await auction.placeBid(a.id, bidder.id, 20);
    expect(res.ok).toBe(true);
  });

  it("rejects a first bid below the start price (reserve)", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder();
    await expect(auction.placeBid(a.id, bidder.id, 19)).rejects.toThrow(/حداقل/);
  });

  it("rejects a bid below current highest + increment", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const b1 = await makeBidder();
    const b2 = await makeBidder();
    await auction.placeBid(a.id, b1.id, 20);
    // increment پیش‌فرض ۲ است؛ حداقل بعدی ۲۲ می‌شود
    await expect(auction.placeBid(a.id, b2.id, 21)).rejects.toThrow(/حداقل/);
    const res = await auction.placeBid(a.id, b2.id, 22);
    expect(res.ok).toBe(true);
    expect(res.outbidUserId).toBe(b1.id);
  });

  it("rejects non-integer or non-positive amounts", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder();
    await expect(auction.placeBid(a.id, bidder.id, 0)).rejects.toThrow(/نامعتبر/);
    await expect(auction.placeBid(a.id, bidder.id, 20.5)).rejects.toThrow(/نامعتبر/);
  });

  it("rejects re-submitting the same leading amount (double click)", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder();
    await auction.placeBid(a.id, bidder.id, 20);
    await expect(auction.placeBid(a.id, bidder.id, 20)).rejects.toThrow(/همین مبلغ/);
  });
});

describe("auction.ts: placeBid — wallet funds", () => {
  it("rejects a bid exceeding the bidder's coin wallet", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const poorBidder = await makeBidder(10);
    await expect(auction.placeBid(a.id, poorBidder.id, 20)).rejects.toThrow(/کافی/);
  });

  it("accepts a bid exactly equal to the wallet balance", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder(20);
    const res = await auction.placeBid(a.id, bidder.id, 20);
    expect(res.ok).toBe(true);
  });

  it("coins reserved by leading another live auction are not spendable", async () => {
    const { auction: first } = await makeAuction({ startPrice: 20 });
    const { auction: second } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder(100);
    await auction.placeBid(first.id, bidder.id, 60);

    await expect(auction.placeBid(second.id, bidder.id, 42)).rejects.toThrow(/کافی/);
    const budget = await auction.getBidBudget(bidder.id, second.id);
    expect(budget).toEqual({ auctionId: second.id, buyWallet: 100, reservedElsewhere: 60, spendable: 40 });
    expect((await auction.placeBid(second.id, bidder.id, 40)).ok).toBe(true);
  });

  it("raising your own lead replaces your own reservation in the same auction", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder(50);
    await auction.placeBid(a.id, bidder.id, 30);
    const res = await auction.placeBid(a.id, bidder.id, 50);
    expect(res.ok).toBe(true);
    expect(res.outbidUserId).toBeNull();
  });

  it("rejects bidding on your own team's special edition", async () => {
    const { auction: a, team } = await makeAuction({ startPrice: 20 });
    const member = await makeBidder(100, team.id);
    await expect(auction.placeBid(a.id, member.id, 20)).rejects.toThrow(/تیم خودت/);
  });
});

describe("auction.ts: placeBid — closed/inactive auctions", () => {
  it("rejects bidding on a SCHEDULED (not yet live) auction", async () => {
    const { auction: a } = await makeAuction({ status: "SCHEDULED" });
    const bidder = await makeBidder();
    await expect(auction.placeBid(a.id, bidder.id, 20)).rejects.toThrow(/زنده نیست/);
  });

  it("rejects bidding on an ENDED auction", async () => {
    const { auction: a } = await makeAuction({ status: "ENDED" });
    const bidder = await makeBidder();
    await expect(auction.placeBid(a.id, bidder.id, 20)).rejects.toThrow(/زنده نیست/);
  });

  it("rejects bidding on a LIVE auction whose end time has already passed", async () => {
    const { auction: a } = await makeAuction({ status: "LIVE", endsInMs: -1_000 });
    const bidder = await makeBidder();
    await expect(auction.placeBid(a.id, bidder.id, 20)).rejects.toThrow(/تمام شده/);
  });

  it("rejects a non-existent auction id", async () => {
    const bidder = await makeBidder();
    await expect(auction.placeBid("no-such-auction-id", bidder.id, 20)).rejects.toThrow(/پیدا نشد/);
  });

  it("extends the auction when a bid lands inside the anti-snipe window", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20, endsInMs: 10_000 });
    const bidder = await makeBidder();
    const res = await auction.placeBid(a.id, bidder.id, 20);
    // پیش‌فرض: پنجرهٔ ۳۰ ثانیه، تمدید ۶۰ ثانیه
    expect(res.endsAt.getTime()).toBe(a.endsAt!.getTime() + 60_000);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.id } })).extensions).toBe(1);
  });
});

describe("auction.ts: nextMinBid / getAuctionState integration", () => {
  it("reflects the new highest bid and nextMin in getAuctionState", async () => {
    const { auction: a, team } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder();
    await auction.placeBid(a.id, bidder.id, 20);
    const state = await auction.getAuctionState(a.id);
    expect(state?.highest?.amount).toBe(20);
    expect(state?.nextMin).toBe(22); // increment پیش‌فرض ۲
    expect(state?.product.teamId).toBe(team.id);
  });
});

// ---------------------------------------------------------------------------
// صف حراج
// ---------------------------------------------------------------------------

const HOUR = 3600_000;

/** صف را خالی می‌کند تا هر تست از حالت مشخصی شروع شود (حراج‌های بخش placeBid هم پاک می‌شوند). */
async function resetQueue() {
  await prisma.bid.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.setting.deleteMany({ where: { key: { in: ["auto_auction", "last_auction_ended_at", "auction_gap_sec", "module_market"] } } });
  await prisma.moduleException.deleteMany();
  await phase.setPhase("LIVE", new Date(Date.now() + 2 * HOUR));
}

describe("auction.ts: enqueueAuction (فرستادن نسخهٔ ویژه به صف؛ حراج بخشی از بازار است)", () => {
  beforeEach(resetQueue);

  it("هر عضو تیم می‌تواند محصول ثبت‌شده را به صف بفرستد", async () => {
    const { product, members } = await makeTeamWithProduct({ members: 2, specialStart: 35 });
    const res = await auction.enqueueAuction(members[1].id, "general"); // عضو دوم، نه سازنده
    expect(res).toMatchObject({ ok: true, position: 1 });
    if (!res.ok) return;
    const row = await prisma.auction.findUniqueOrThrow({ where: { id: res.auctionId } });
    expect(row).toMatchObject({ productId: product!.id, status: "SCHEDULED", order: 0, startPrice: 35 });
  });

  it("ترتیب صف همان ترتیب ثبت است و جایگاه درست گزارش می‌شود", async () => {
    const t1 = await makeTeamWithProduct();
    const t2 = await makeTeamWithProduct();
    const t3 = await makeTeamWithProduct();
    const r1 = await auction.enqueueAuction(t1.members[0].id, "general");
    const r2 = await auction.enqueueAuction(t2.members[0].id, "general");
    expect(r1).toMatchObject({ ok: true, position: 1 });
    expect(r2).toMatchObject({ ok: true, position: 2 });

    // حراج اول زنده و سپس تمام می‌شود؛ جایگاه فقط حراج‌های زنده/در صف را می‌شمارد
    await auction.startNextAuction();
    const r3 = await auction.enqueueAuction(t3.members[0].id, "general");
    expect(r3).toMatchObject({ ok: true, position: 3 });
    await prisma.auction.updateMany({ where: { status: "LIVE" }, data: { status: "ENDED" } });
    const t4 = await makeTeamWithProduct();
    expect(await auction.enqueueAuction(t4.members[0].id, "general")).toMatchObject({ ok: true, position: 3 });

    const queue = await auction.listAuctions();
    expect(queue.map((q) => q.product.teamId)).toEqual([t1.team.id, t2.team.id, t3.team.id, t4.team.id]);
    expect(queue.map((q) => q.order)).toEqual([0, 1, 2, 3]);
  });

  it("هر محصول فقط یک‌بار به صف می‌رود (حتی از طرف عضو دیگر)", async () => {
    const { members } = await makeTeamWithProduct({ members: 2 });
    expect((await auction.enqueueAuction(members[0].id, "general")).ok).toBe(true);
    const dup = await auction.enqueueAuction(members[1].id, "general");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toContain("قبلاً");
    expect(await prisma.auction.count()).toBe(1);
  });

  it("قیمت پایهٔ صفر به یک سکه گرد می‌شود", async () => {
    const { members } = await makeTeamWithProduct({ specialStart: 0 });
    const res = await auction.enqueueAuction(members[0].id, "general");
    expect(res.ok).toBe(true);
    if (res.ok) expect((await prisma.auction.findUniqueOrThrow({ where: { id: res.auctionId } })).startPrice).toBe(1);
  });

  it("حراج جزو بخش بازار است: وقتی بازار باز نیست صف بسته است، مگر استثنای همان تیم", async () => {
    const { team, members } = await makeTeamWithProduct();
    for (const status of ["ro", "closed", "hidden"]) {
      await prisma.setting.upsert({ where: { key: "module_market" }, update: { value: status }, create: { key: "module_market", value: status } });
      const res = await auction.enqueueAuction(members[0].id, "general");
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("فعلاً باز نیست");
    }
    expect(await prisma.auction.count()).toBe(0);

    await prisma.moduleException.create({ data: { moduleKey: "market", teamId: team.id, createdBy: "test" } });
    expect((await auction.enqueueAuction(members[0].id, "general")).ok).toBe(true);
  });

  it("پس از پایان مسابقه صف بسته است", async () => {
    const { members } = await makeTeamWithProduct();
    await phase.setPhase("CLOSED", null);
    expect((await auction.enqueueAuction(members[0].id, "general")).ok).toBe(false);
    expect(await prisma.auction.count()).toBe(0);
  });

  it("هر فاز قدیمی ذخیره‌شده (مثل AUCTION) یعنی مسابقه در جریان است", async () => {
    await prisma.setting.update({ where: { key: "phase" }, data: { value: "AUCTION" } });
    const { members } = await makeTeamWithProduct();
    expect((await auction.enqueueAuction(members[0].id, "general")).ok).toBe(true);
  });

  it("یک تیم می‌تواند محصول هر محورش را جدا به صف بفرستد و محور بی‌محصول رد می‌شود", async () => {
    const { team, members, product } = await makeTeamWithProduct();
    const content = await prisma.product.create({
      data: { teamId: team.id, trackId: "content", slug: `${team.slug}-content`, name: "محتوا", submittedAt: new Date(), specialStart: 12 },
    });
    expect((await auction.enqueueAuction(members[0].id, "os")).ok).toBe(false);
    const first = await auction.enqueueAuction(members[0].id, "general");
    const second = await auction.enqueueAuction(members[0].id, "content");
    expect(first).toMatchObject({ ok: true, position: 1 });
    expect(second).toMatchObject({ ok: true, position: 2 });
    const rows = await prisma.auction.findMany({ orderBy: { order: "asc" } });
    expect(rows.map((r) => r.productId)).toEqual([product!.id, content.id]);
    expect(rows[1].startPrice).toBe(12);
  });

  it("در ۲۰ دقیقهٔ پایانی مسابقه صف بسته است", async () => {
    const { members } = await makeTeamWithProduct();
    await phase.setPhase("LIVE", new Date(Date.now() + 19 * 60_000));
    const late = await auction.enqueueAuction(members[0].id, "general");
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toContain("پایانی");

    await phase.setPhase("LIVE", new Date(Date.now() + 25 * 60_000));
    expect((await auction.enqueueAuction(members[0].id, "general")).ok).toBe(true);
  });

  it("بدون ددلاین نهایی، صف باز است", async () => {
    await phase.setPhase("LIVE", null);
    const { members } = await makeTeamWithProduct();
    expect((await auction.enqueueAuction(members[0].id, "general")).ok).toBe(true);
  });

  it("کاربر بی‌تیم، تیم بدون محصول و محصول ثبت‌نهایی‌نشده رد می‌شوند", async () => {
    const teamless = await makeBidder(100, null);
    expect((await auction.enqueueAuction(teamless.id, "general")).ok).toBe(false);

    const noProduct = await makeTeamWithProduct({ withProduct: false });
    const r1 = await auction.enqueueAuction(noProduct.members[0].id, "general");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toContain("ثبت نهایی");

    const draft = await makeTeamWithProduct({ submitted: false });
    expect((await auction.enqueueAuction(draft.members[0].id, "general")).ok).toBe(false);
    expect(await prisma.auction.count()).toBe(0);
  });
});

describe("auction.ts: اجرای صف (شروع و تسویهٔ خودکار)", () => {
  beforeEach(resetQueue);

  async function queueOf(n: number) {
    const teams = [];
    for (let i = 0; i < n; i++) {
      const t = await makeTeamWithProduct();
      const res = await auction.enqueueAuction(t.members[0].id, "general");
      if (!res.ok) throw new Error(res.error);
      teams.push({ ...t, auctionId: res.auctionId });
    }
    return teams;
  }

  it("startNextAuction حراج اول صف را زنده می‌کند و هم‌زمان فقط یک حراج زنده است", async () => {
    const [a, b] = await queueOf(2);
    const started = await auction.startNextAuction(120);
    expect(started?.id).toBe(a.auctionId);
    expect(started?.status).toBe("LIVE");
    expect(started!.endsAt!.getTime() - started!.startsAt!.getTime()).toBe(120_000);

    expect(await auction.startNextAuction(120)).toBeNull();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");
    expect(await auction.currentOrNextAuctionId()).toBe(a.auctionId);
  });

  it("برندهٔ حراج دقیقاً مبلغ پیشنهادش را می‌پردازد و برد او یک خرید است", async () => {
    const [a, b] = await queueOf(2);
    await auction.startNextAuction();
    const loser = await makeBidder(100);
    const winner = await makeBidder(100);
    await auction.placeBid(a.auctionId, loser.id, 20);
    await auction.placeBid(a.auctionId, winner.id, 30);

    expect(await auction.settleAuction(a.auctionId)).toBe(true);

    const ended = await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } });
    expect(ended).toMatchObject({ status: "ENDED", winnerId: winner.id, finalPrice: 30 });
    expect(await walletOf(winner.id)).toBe(70);
    expect(await walletOf(loser.id)).toBe(100);

    const purchases = await prisma.purchase.findMany({ where: { userId: winner.id } });
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ productId: a.product!.id, amount: 30, discount: 0 });
    const ledger = await prisma.ledgerEntry.findMany({ where: { userId: winner.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ wallet: "BUY", delta: -30, reason: "AUCTION_WIN", refId: a.auctionId });

    // تسویه حراج بعدی را شروع نمی‌کند؛ زمان‌بند پس از auction_gap_sec آن را زنده می‌کند
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");

    // تسویهٔ دوباره idempotent است
    expect(await auction.settleAuction(a.auctionId)).toBe(false);
    expect(await walletOf(winner.id)).toBe(70);
    expect(await prisma.purchase.count({ where: { userId: winner.id } })).toBe(1);
  });

  it("پیشنهاد بی‌پشتوانه کنار می‌رود و پیشنهاد معتبر بعدی برنده می‌شود", async () => {
    const [a] = await queueOf(1);
    await auction.startNextAuction();
    const second = await makeBidder(100);
    const top = await makeBidder(100);
    await auction.placeBid(a.auctionId, second.id, 20);
    await auction.placeBid(a.auctionId, top.id, 40);
    // موجودی top پیش از تسویه جای دیگری خرج شده است
    await prisma.user.update({ where: { id: top.id }, data: { buyWallet: 10 } });

    await auction.settleAuction(a.auctionId);
    const ended = await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } });
    expect(ended).toMatchObject({ winnerId: second.id, finalPrice: 20 });
    expect(await walletOf(top.id)).toBe(10);
    expect(await walletOf(second.id)).toBe(80);
  });

  it("حراج بدون پیشنهاد بدون برنده تمام می‌شود", async () => {
    const [a, b] = await queueOf(2);
    await auction.startNextAuction();
    expect(await auction.settleAuction(a.auctionId)).toBe(true);
    expect(await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).toMatchObject({
      status: "ENDED",
      winnerId: null,
      finalPrice: null,
    });
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");
  });

  it("با auto_auction=0 حراج بعدی خودکار شروع نمی‌شود", async () => {
    await prisma.setting.create({ data: { key: "auto_auction", value: "0" } });
    const [a, b] = await queueOf(2);
    await auction.startNextAuction();
    await auction.settleAuction(a.auctionId);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");
  });

  it("settleIfEnded فقط حراج زنده‌ای را که زمانش گذشته تسویه می‌کند", async () => {
    const [a] = await queueOf(1);
    await auction.startNextAuction();
    expect(await auction.settleIfEnded(a.auctionId)).toBe(false);
    await prisma.auction.update({ where: { id: a.auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    expect(await auction.settleIfEnded(a.auctionId)).toBe(true);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).status).toBe("ENDED");
  });

  it("زمان‌بند حراج بعدی صف را شروع و حراج تمام‌شده را تسویه می‌کند", async () => {
    const [a, b] = await queueOf(2);

    await scheduler.runScheduledTasks();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).status).toBe("LIVE");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");

    const bidder = await makeBidder(100);
    await auction.placeBid(a.auctionId, bidder.id, 25);
    await prisma.auction.update({ where: { id: a.auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });

    await scheduler.runScheduledTasks();
    expect(await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).toMatchObject({
      status: "ENDED",
      winnerId: bidder.id,
      finalPrice: 25,
    });
    expect(await walletOf(bidder.id)).toBe(75);
    // حراج بعدی تا گذشتن auction_gap_sec از پایان قبلی در صف می‌ماند
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");
    await scheduler.runScheduledTasks();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");

    await prisma.setting.update({
      where: { key: "last_auction_ended_at" },
      data: { value: new Date(Date.now() - 61_000).toISOString() },
    });
    await scheduler.runScheduledTasks();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("LIVE");
  });

  it("وقتی بازار باز نیست زمان‌بند حراج تازه‌ای شروع نمی‌کند ولی حراج زندهٔ تمام‌شده را تسویه می‌کند", async () => {
    const [a, b] = await queueOf(2);
    await auction.startNextAuction();
    await prisma.auction.update({ where: { id: a.auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    await prisma.setting.create({ data: { key: "module_market", value: "closed" } });
    await scheduler.runScheduledTasks();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).status).toBe("ENDED");
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("SCHEDULED");
  });

  it("پس از پایان مسابقه زمان‌بند حراجی شروع نمی‌کند", async () => {
    const [a] = await queueOf(1);
    await phase.setPhase("CLOSED", null);
    await scheduler.runScheduledTasks();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).status).toBe("SCHEDULED");
  });

  it("closeAuctionsForGameEnd حراج زنده را تسویه و صفِ اجرانشده را پاک می‌کند", async () => {
    const [a, b, c] = await queueOf(3);
    await auction.startNextAuction();
    const bidder = await makeBidder(100);
    await auction.placeBid(a.auctionId, bidder.id, 22);

    // مثل transitionTo: فاز پیش از بستن حراج‌ها CLOSED می‌شود
    await phase.setPhase("CLOSED", null);
    await auction.closeAuctionsForGameEnd();

    expect(await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).toMatchObject({
      status: "ENDED",
      winnerId: bidder.id,
      finalPrice: 22,
    });
    expect(await prisma.auction.findUnique({ where: { id: b.auctionId } })).toBeNull();
    expect(await prisma.auction.findUnique({ where: { id: c.auctionId } })).toBeNull();
    expect(await prisma.auction.count({ where: { status: "LIVE" } })).toBe(0);
    expect(await prisma.purchase.count({ where: { userId: bidder.id, productId: a.product!.id } })).toBe(1);
  });

  it("ensureAuctions (ابزار برگزارکننده) همهٔ محصولات باقی‌مانده را ته صف می‌گذارد و idempotent است", async () => {
    const [queued] = await queueOf(1);
    const extra = await makeTeamWithProduct();
    await auction.ensureAuctions();

    const pending = await prisma.product.count({ where: { submittedAt: { not: null }, auction: null } });
    expect(pending).toBe(0);
    const first = await prisma.auction.findUniqueOrThrow({ where: { id: queued.auctionId } });
    expect(first.order).toBe(0); // صف موجود دست نمی‌خورد
    const extraAuction = await prisma.auction.findUniqueOrThrow({ where: { productId: extra.product!.id } });
    expect(extraAuction.order).toBeGreaterThan(0);

    const count = await prisma.auction.count();
    await auction.ensureAuctions();
    expect(await prisma.auction.count()).toBe(count);
  });
});

// ---------------------------------------------------------------------------
// برازش مدت با سربار، اعلان صفِ اجرانشده و قفل تسویه پس از پایان بازی
// ---------------------------------------------------------------------------

describe("auction.ts: clampAuctionDuration با سربار هر حراج", () => {
  it("سربار (فاصله + تیک + تمدید) از سهم هر حراج کم می‌شود", () => {
    expect(auction.auctionOverheadSec(60, 30)).toBe(60 + auction.SCHEDULER_TICK_SEC + 30);
    expect(auction.auctionOverheadSec(-5, -5)).toBe(auction.SCHEDULER_TICK_SEC);
    // ۱۰۰۰ × ۰٫۸۵ ÷ ۴ = ۲۱۲٫۵ → بدون سربار ۲۱۲؛ با سربار ۱۲۰ → ۹۲
    expect(auction.clampAuctionDuration(1000, 4, 300)).toBe(212);
    expect(auction.clampAuctionDuration(1000, 4, 300, 120)).toBe(92);
    // هیچ‌وقت کمتر از ۶۰ ثانیه و بیشتر از مدت پیکربندی‌شده نیست
    expect(auction.clampAuctionDuration(100, 4, 300, 120)).toBe(60);
    expect(auction.clampAuctionDuration(100_000, 2, 300, 120)).toBe(300);
  });
});

describe("auction.ts: پایان بازی — سربار، اعلان و قفل تسویه", () => {
  beforeEach(async () => {
    await resetQueue();
    await prisma.notification.deleteMany();
    await prisma.setting.deleteMany({ where: { key: { in: ["anti_snipe_extend_sec", "settled_at", "settled_final"] } } });
  });

  async function queueOf(n: number) {
    const teams = [];
    for (let i = 0; i < n; i++) {
      const t = await makeTeamWithProduct();
      const res = await auction.enqueueAuction(t.members[0].id, "general");
      if (!res.ok) throw new Error(res.error);
      teams.push({ ...t, auctionId: res.auctionId });
    }
    return teams;
  }

  it("startNextAuction مدت را با احتساب سربار فاصله/تیک/تمدید برازش می‌کند", async () => {
    await queueOf(4);
    await prisma.setting.create({ data: { key: "anti_snipe_extend_sec", value: "30" } });
    // صف پس از ۲۰ دقیقهٔ پایانی بسته است، ولی حراج‌های صف‌شده می‌مانند؛ ۱۰۰۰ ثانیه تا ددلاین نهایی
    await phase.setPhase("LIVE", new Date(Date.now() + 1000_000));
    const started = await auction.startNextAuction(300);
    // floor(1000 × 0.85 / 4 − (60 + 30 + 30)) = 92 (999 ثانیه هم همان 92 می‌دهد)
    expect(started!.endsAt!.getTime() - started!.startsAt!.getTime()).toBe(92_000);
  });

  it("closeAuctionsForGameEnd به تیم‌هایی که حراجشان برگزار نشد اعلان می‌دهد", async () => {
    const [a, b, c] = await queueOf(3);
    await auction.startNextAuction();
    await phase.setPhase("CLOSED", null);
    await auction.closeAuctionsForGameEnd();

    const notified = await prisma.notification.findMany({ where: { kind: "auction_unrun" }, select: { userId: true } });
    const ids = notified.map((n) => n.userId).sort();
    expect(ids).toEqual([b.members[0].id, c.members[0].id].sort());
    expect(ids).not.toContain(a.members[0].id);
  });

  it("پس از CLOSED تسویهٔ عادی (settleIfEnded/settleAuction) رد می‌شود ولی مسیر پایان بازی تسویه می‌کند", async () => {
    const [a] = await queueOf(1);
    await auction.startNextAuction();
    const bidder = await makeBidder(100);
    await auction.placeBid(a.auctionId, bidder.id, 21);
    await prisma.auction.update({ where: { id: a.auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });
    await phase.setPhase("CLOSED", null);

    expect(await auction.settleIfEnded(a.auctionId)).toBe(false);
    expect(await auction.settleAuction(a.auctionId)).toBe(false);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).status).toBe("LIVE");

    await auction.closeAuctionsForGameEnd();
    expect(await prisma.auction.findUniqueOrThrow({ where: { id: a.auctionId } })).toMatchObject({
      status: "ENDED",
      winnerId: bidder.id,
    });
  });

  it("پس از تسویهٔ قطعی هیچ مسیری (حتی پایان بازی) حراج را تسویه نمی‌کند؛ تسویهٔ زودهنگام مانع نیست", async () => {
    const [a] = await queueOf(1);
    await auction.startNextAuction();
    await prisma.auction.update({ where: { id: a.auctionId }, data: { endsAt: new Date(Date.now() - 1_000) } });

    // تسویهٔ زودهنگام (settled_final = 0) جلوی تسویهٔ حراج را نمی‌گیرد
    await prisma.setting.create({ data: { key: "settled_at", value: new Date().toISOString() } });
    await prisma.setting.create({ data: { key: "settled_final", value: "0" } });
    const [b] = await queueOf(1);
    expect(await auction.settleIfEnded(a.auctionId)).toBe(true);

    // تسویهٔ قطعی
    await prisma.setting.update({ where: { key: "settled_final" }, data: { value: "1" } });
    await prisma.setting.upsert({ where: { key: "last_auction_ended_at" }, update: { value: new Date(0).toISOString() }, create: { key: "last_auction_ended_at", value: new Date(0).toISOString() } });
    await auction.startNextAuction();
    await phase.setPhase("CLOSED", null);
    await auction.closeAuctionsForGameEnd();
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: b.auctionId } })).status).toBe("LIVE");
  });
});
