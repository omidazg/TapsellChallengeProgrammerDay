/**
 * تست واحد src/lib/auction.ts (placeBid) روی یک پایگاه‌دادهٔ SQLite موقت.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let auction: typeof import("../src/lib/auction");

beforeAll(async () => {
  db = createTempDb("auction-test");
  ({ prisma } = await import("../src/lib/db"));
  auction = await import("../src/lib/auction");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeBidder(buyWallet = 100) {
  counter++;
  return prisma.user.create({
    data: {
      email: `bidder-${counter}@example.test`,
      passwordHash: "x",
      nickname: `مزایده‌گر ${counter}`,
      role: "DEALMAKER",
      power: "HYPE",
      buyWallet,
    },
  });
}

/** یک تیم + محصول + حراج SCHEDULED/LIVE می‌سازد و برمی‌گرداند */
async function makeAuction(opts: { status?: "SCHEDULED" | "LIVE" | "ENDED"; startPrice?: number; endsInMs?: number } = {}) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم حراج ${counter}`, slug: `auction-team-${counter}` } });
  const product = await prisma.product.create({
    data: { teamId: team.id, name: `محصول ${counter}`, submittedAt: new Date(), specialStart: opts.startPrice ?? 20 },
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
  });
});

describe("auction.ts: placeBid — wallet funds", () => {
  it("rejects a bid exceeding the bidder's buy wallet", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const poorBidder = await makeBidder(10);
    await expect(auction.placeBid(a.id, poorBidder.id, 20)).rejects.toThrow(/موجودی/);
  });

  it("accepts a bid exactly equal to the wallet balance", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder(20);
    const res = await auction.placeBid(a.id, bidder.id, 20);
    expect(res.ok).toBe(true);
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
});

describe("auction.ts: nextMinBid / getAuctionState integration", () => {
  it("reflects the new highest bid and nextMin in getAuctionState", async () => {
    const { auction: a } = await makeAuction({ startPrice: 20 });
    const bidder = await makeBidder();
    await auction.placeBid(a.id, bidder.id, 20);
    const state = await auction.getAuctionState(a.id);
    expect(state?.highest?.amount).toBe(20);
    expect(state?.nextMin).toBe(22); // increment پیش‌فرض ۲
  });
});
