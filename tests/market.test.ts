/**
 * تست src/lib/market.ts (خرید محصول در روز بازار) و src/lib/adslots.ts (جایگاه تبلیغاتی با قیمت ثابت)
 * روی یک پایگاه‌دادهٔ SQLite موقت.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let market: typeof import("../src/lib/market");
let adslots: typeof import("../src/lib/adslots");
let phase: typeof import("../src/lib/phase");

beforeAll(async () => {
  db = createTempDb("market-test");
  ({ prisma } = await import("../src/lib/db"));
  market = await import("../src/lib/market");
  adslots = await import("../src/lib/adslots");
  phase = await import("../src/lib/phase");
  await phase.setPhase("MARKET", null);
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

let counter = 0;
async function makeUser(buyWallet = 200, teamId: string | null = null) {
  counter++;
  return prisma.user.create({
    data: { email: `market-${counter}@example.test`, passwordHash: "x", nickname: `کاربر ${counter}`, role: "BUILDER", power: "", buyWallet, teamId },
  });
}

async function makeTeamWithProduct(opts: { price?: number; submitted?: boolean; liveStatus?: string; members?: number } = {}) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم بازار ${counter}`, slug: `market-team-${counter}` } });
  const members = [];
  for (let i = 0; i < (opts.members ?? 1); i++) members.push(await makeUser(200, team.id));
  const product = await prisma.product.create({
    data: {
      teamId: team.id,
      name: `محصول ${counter}`,
      price: opts.price ?? 20,
      submittedAt: opts.submitted === false ? null : new Date(),
      liveStatus: opts.liveStatus ?? "",
    },
  });
  return { team, product, members };
}

async function walletOf(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).buyWallet;
}

async function inPhase<T>(p: Parameters<typeof phase.setPhase>[0], fn: () => Promise<T>): Promise<T> {
  await phase.setPhase(p, null);
  try {
    return await fn();
  } finally {
    await phase.setPhase("MARKET", null);
  }
}

describe("market.ts: purchaseProduct", () => {
  it("به قیمت کامل می‌خرد، کیف سکه را کم و ردیف PURCHASE ثبت می‌کند (کاربر بی‌تیم هم می‌تواند)", async () => {
    const { product, team } = await makeTeamWithProduct({ price: 25 });
    const buyer = await makeUser(100);
    const res = await market.purchaseProduct(buyer.id, product.id);
    expect(res).toMatchObject({ ok: true, amount: 25 });
    if (!res.ok) return;
    expect(await walletOf(buyer.id)).toBe(75);
    expect(await prisma.purchase.findUniqueOrThrow({ where: { id: res.purchaseId } })).toMatchObject({
      productId: product.id,
      userId: buyer.id,
      amount: 25,
      discount: 0,
    });
    const ledger = await prisma.ledgerEntry.findMany({ where: { refId: res.purchaseId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ userId: buyer.id, teamId: team.id, wallet: "BUY", delta: -25, reason: "PURCHASE" });
  });

  it("سقفی روی تعداد خرید از یک محصول نیست", async () => {
    const { product } = await makeTeamWithProduct({ price: 20 });
    const buyer = await makeUser(100);
    for (let i = 0; i < 3; i++) expect((await market.purchaseProduct(buyer.id, product.id)).ok).toBe(true);
    expect(await walletOf(buyer.id)).toBe(40);
    expect(await market.userSpentOn(buyer.id, product.id)).toBe(60);
    expect(await market.salesSummary(product.id)).toMatchObject({ sold: 60, buyersCount: 1 });
  });

  it("خرید از تیم خود ممنوع است", async () => {
    const { product, members } = await makeTeamWithProduct();
    const res = await market.purchaseProduct(members[0].id, product.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("تیم خودت");
    expect(await walletOf(members[0].id)).toBe(200);
  });

  it("موجودی ناکافی، محصول ثبت‌نهایی‌نشده و بیرون از روز بازار رد می‌شوند", async () => {
    const { product } = await makeTeamWithProduct({ price: 30 });
    const poor = await makeUser(29);
    expect((await market.purchaseProduct(poor.id, product.id)).ok).toBe(false);

    const { product: draft } = await makeTeamWithProduct({ submitted: false });
    const buyer = await makeUser(100);
    expect((await market.purchaseProduct(buyer.id, draft.id)).ok).toBe(false);

    const res = await inPhase("BUILD", () => market.purchaseProduct(buyer.id, product.id));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("روز بازار");
    expect(await walletOf(buyer.id)).toBe(100);
    expect(await walletOf(poor.id)).toBe(29);
  });

  it("سکه‌های رزروشده برای پیشتازی در حراج زنده خرج‌شدنی نیستند", async () => {
    const { product } = await makeTeamWithProduct({ price: 20 });
    const { product: auctioned } = await makeTeamWithProduct();
    const buyer = await makeUser(50);
    const a = await prisma.auction.create({
      data: { productId: auctioned.id, status: "LIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 60_000) },
    });
    await prisma.bid.create({ data: { auctionId: a.id, userId: buyer.id, amount: 40 } });
    try {
      expect(await market.spendableBuyCoins(buyer.id, 50)).toBe(10);
      const res = await market.purchaseProduct(buyer.id, product.id);
      expect(res.ok).toBe(false);
      expect(await walletOf(buyer.id)).toBe(50);

      // پیشنهادش شکسته شد → رزرو آزاد
      const rival = await makeUser(100);
      await prisma.bid.create({ data: { auctionId: a.id, userId: rival.id, amount: 45 } });
      expect(await market.spendableBuyCoins(buyer.id, 50)).toBe(50);
      expect((await market.purchaseProduct(buyer.id, product.id)).ok).toBe(true);
    } finally {
      await prisma.auction.update({ where: { id: a.id }, data: { status: "ENDED" } });
    }
  });
});

describe("market.ts: getMarketProducts", () => {
  it("برچسب «خریده‌ای» برای بازدیدکننده و «لایو» برای محصولات منتشرشده", async () => {
    const { product: bought } = await makeTeamWithProduct({ price: 10 });
    const { product: live } = await makeTeamWithProduct({ liveStatus: "LIVE" });
    const { product: requested } = await makeTeamWithProduct({ liveStatus: "REQUESTED" });
    const { product: draft } = await makeTeamWithProduct({ submitted: false });
    const viewer = await makeUser(100);
    await market.purchaseProduct(viewer.id, bought.id);

    const cards = await market.getMarketProducts("all", { userId: viewer.id });
    const byId = new Map(cards.map((c) => [c.id, c]));
    expect(byId.get(bought.id)).toMatchObject({ bought: true, live: false, sold: 10 });
    expect(byId.get(live.id)).toMatchObject({ bought: false, live: true });
    expect(byId.get(requested.id)?.live).toBe(false);
    expect(byId.has(draft.id)).toBe(false);
    expect(cards[0]).not.toHaveProperty("limitReached");

    const anonymous = await market.getMarketProducts("all");
    expect(anonymous.every((c) => c.bought === false)).toBe(true);
  });

  it("مرتب‌سازی پرفروش و ارزان", async () => {
    const top = await market.getMarketProducts("top");
    for (let i = 1; i < top.length; i++) expect(top[i - 1].sold).toBeGreaterThanOrEqual(top[i].sold);
    const cheap = await market.getMarketProducts("cheap");
    for (let i = 1; i < cheap.length; i++) expect(cheap[i - 1].price).toBeLessThanOrEqual(cheap[i].price);
  });
});

describe("adslots.ts: جایگاه تبلیغاتی با قیمت ثابت", () => {
  const HOUR = 3600_000;
  let marketStart: Date;

  beforeAll(async () => {
    marketStart = new Date(Date.now() - 30 * 60_000); // ساعت اول همین حالا جاری است
    await adslots.ensureAdSlots(marketStart, 4);
  });

  async function openSlot(kind: "BANNER" | "FEATURED" | "PUSH", hour: number) {
    return prisma.adSlot.findUniqueOrThrow({
      where: { kind_hourStart: { kind, hourStart: new Date(marketStart.getTime() + hour * HOUR) } },
    });
  }

  it("ensureAdSlots برای هر ساعت و هر نوع یک جایگاه می‌سازد و idempotent است", async () => {
    expect(await prisma.adSlot.count()).toBe(12);
    await adslots.ensureAdSlots(marketStart, 4);
    expect(await prisma.adSlot.count()).toBe(12);
  });

  it("قیمت‌ها پیش‌فرض دارند و از تنظیمات خوانده می‌شوند", async () => {
    expect(await adslots.adSlotPrices()).toEqual({ BANNER: 60, FEATURED: 40, PUSH: 80 });
    await prisma.setting.create({ data: { key: "adslot_price_featured", value: "45" } });
    try {
      expect((await adslots.adSlotPrices()).FEATURED).toBe(45);
    } finally {
      await prisma.setting.delete({ where: { key: "adslot_price_featured" } });
    }
  });

  it("هر عضو تیم با محصول ثبت‌شده می‌تواند به قیمت ثابت بخرد؛ اول‌آمده اول‌خرید", async () => {
    const { team, members } = await makeTeamWithProduct({ members: 2 });
    const slot = await openSlot("BANNER", 1);

    const res = await adslots.buyAdSlot(members[1].id, slot.id);
    expect(res).toEqual({ ok: true, price: 60 });
    expect(await walletOf(members[1].id)).toBe(140);
    expect(await prisma.adSlot.findUniqueOrThrow({ where: { id: slot.id } })).toMatchObject({
      status: "CLOSED",
      winnerTeamId: team.id,
      pricePaid: 60,
    });
    const ledger = await prisma.ledgerEntry.findMany({ where: { refId: slot.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ userId: members[1].id, teamId: team.id, delta: -60, reason: "ADSLOT" });

    // تیم دیگر دیگر نمی‌تواند همان جایگاه را بخرد
    const other = await makeTeamWithProduct();
    const taken = await adslots.buyAdSlot(other.members[0].id, slot.id);
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error).toContain("فروخته");
    expect(await walletOf(other.members[0].id)).toBe(200);

    const grid = await adslots.slotsGrid(team.id);
    const cell = grid.find((c) => c.id === slot.id)!;
    expect(cell).toMatchObject({ state: "SOLD", mine: true, winnerTeamId: team.id, pricePaid: 60, price: 60 });
    const otherView = await adslots.slotsGrid(other.team.id);
    expect(otherView.find((c) => c.id === slot.id)?.mine).toBe(false);
  });

  it("سقف جایگاه هر تیم (پیش‌فرض ۲) برای همهٔ اعضا مشترک است", async () => {
    const { members } = await makeTeamWithProduct({ members: 2 });
    expect((await adslots.buyAdSlot(members[0].id, (await openSlot("FEATURED", 1)).id)).ok).toBe(true);
    expect((await adslots.buyAdSlot(members[1].id, (await openSlot("FEATURED", 2)).id)).ok).toBe(true);
    const third = await adslots.buyAdSlot(members[1].id, (await openSlot("FEATURED", 3)).id);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toContain("حداکثر");
  });

  it("بی‌تیم، بدون محصول ثبت‌شده، موجودی ناکافی، جایگاه گذشته و فاز نادرست رد می‌شوند", async () => {
    const slot = await openSlot("PUSH", 2);
    const teamless = await makeUser(500);
    expect((await adslots.buyAdSlot(teamless.id, slot.id)).ok).toBe(false);

    const draft = await makeTeamWithProduct({ submitted: false });
    expect((await adslots.buyAdSlot(draft.members[0].id, slot.id)).ok).toBe(false);

    const poor = await makeTeamWithProduct();
    await prisma.user.update({ where: { id: poor.members[0].id }, data: { buyWallet: 79 } });
    const noCoins = await adslots.buyAdSlot(poor.members[0].id, slot.id);
    expect(noCoins.ok).toBe(false);
    if (!noCoins.ok) expect(noCoins.error).toContain("سکهٔ کافی");

    const past = await prisma.adSlot.create({ data: { kind: "BANNER", hourStart: new Date(Date.now() - 3 * HOUR) } });
    const rich = await makeTeamWithProduct();
    const late = await adslots.buyAdSlot(rich.members[0].id, past.id);
    expect(late.ok).toBe(false);
    expect((await adslots.slotsGrid(null)).find((c) => c.id === past.id)?.state).toBe("PAST");

    for (const p of ["SEED_ROUND", "CLOSED"] as const) {
      const res = await inPhase(p, () => adslots.buyAdSlot(rich.members[0].id, slot.id));
      expect(res.ok).toBe(false);
    }
    // در «ساخت محصول» پیش‌خرید ممکن است
    const prebuy = await inPhase("BUILD", () => adslots.buyAdSlot(rich.members[0].id, slot.id));
    expect(prebuy).toEqual({ ok: true, price: 80 });
  });
});

describe("market.ts: getCurrentAdSlotWinners (بازهٔ ساعت، بدون N+1)", () => {
  // زمانی دور در آینده تا جایگاه‌های بقیهٔ تست‌ها در بازه نیفتند
  const now = new Date(2030, 0, 1, 10, 0, 0);
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);

  it("جایگاهی که سرِ ساعت نیست (مثلاً ۹:۳۰) برندهٔ اکنون است؛ جدیدترینِ هر نوع، بدون بازپرداخت‌شده و محصول ثبت‌نشده", async () => {
    const a = await makeTeamWithProduct();
    const older = await makeTeamWithProduct();
    const refunded = await makeTeamWithProduct();
    const unsubmitted = await makeTeamWithProduct({ submitted: false });
    const featured = await makeTeamWithProduct();
    await prisma.adSlot.createMany({
      data: [
        { kind: "BANNER", hourStart: ago(30), status: "CLOSED", winnerTeamId: a.team.id, pricePaid: 1 },
        { kind: "BANNER", hourStart: ago(50), status: "CLOSED", winnerTeamId: older.team.id, pricePaid: 1 },
        { kind: "BANNER", hourStart: ago(61), status: "CLOSED", winnerTeamId: older.team.id, pricePaid: 1 }, // تمام‌شده
        { kind: "FEATURED", hourStart: ago(10), status: "CLOSED", winnerTeamId: unsubmitted.team.id, pricePaid: 1 },
        { kind: "FEATURED", hourStart: ago(20), status: "REFUNDED", winnerTeamId: refunded.team.id, pricePaid: 1 },
        { kind: "FEATURED", hourStart: ago(40), status: "CLOSED", winnerTeamId: featured.team.id, pricePaid: 1 },
        { kind: "BANNER", hourStart: new Date(now.getTime() + 60_000), status: "CLOSED", winnerTeamId: older.team.id, pricePaid: 1 }, // هنوز شروع نشده
      ],
    });

    const winners = await market.getCurrentAdSlotWinners(now);
    const byKind = Object.fromEntries(winners.map((w) => [w.kind, w.teamId]));
    expect(winners).toHaveLength(2);
    expect(byKind).toEqual({ BANNER: a.team.id, FEATURED: featured.team.id });
    expect(winners.find((w) => w.kind === "BANNER")).toMatchObject({ productSlug: a.team.slug, productName: a.product.name });
  });

  it("بدون جایگاه در بازه، فهرست خالی است", async () => {
    expect(await market.getCurrentAdSlotWinners(new Date(2031, 0, 1, 10, 0, 0))).toEqual([]);
  });
});

describe("market.ts: کش کوتاه جمع فروش بازار", () => {
  it("بازدیدهای پیاپی از کش خوانده می‌شوند و خرید کش را فوراً پاک می‌کند", async () => {
    const { product } = await makeTeamWithProduct({ price: 10 });
    const buyer = await makeUser(100);
    const soldOf = async () => (await market.getMarketProducts("all", { userId: buyer.id })).find((c) => c.id === product.id);
    // کارت تازه ممکن است هنوز در کش نباشد؛ با یک خرید کش پاک و دوباره ساخته می‌شود
    const first = await market.purchaseProduct(buyer.id, product.id);
    expect(first.ok).toBe(true);
    expect(await soldOf()).toMatchObject({ sold: 10, bought: true });

    // نوشتن مستقیم (بدون purchaseProduct) تا پایان TTL در کش دیده نمی‌شود
    await prisma.purchase.create({ data: { productId: product.id, userId: buyer.id, amount: 10, discount: 0 } });
    expect((await soldOf())?.sold).toBe(10);

    // خرید واقعی کش را پاک می‌کند و جمع تازه (۳۰) را نشان می‌دهد
    const second = await market.purchaseProduct(buyer.id, product.id);
    expect(second.ok).toBe(true);
    expect((await soldOf())?.sold).toBe(30);
  });
});
