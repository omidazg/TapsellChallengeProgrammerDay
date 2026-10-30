/**
 * تست src/lib/market.ts (خرید محصول) و src/lib/adslots.ts (حراج جایگاه تبلیغاتی)
 * روی یک پایگاه‌دادهٔ SQLite موقت.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";
import { DEFAULTS } from "../src/lib/constants";

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
  await phase.setPhase("LIVE", null);
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
      slug: `market-team-${counter}-general`,
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

/** اجرای fn وقتی بخش key در وضعیت status است */
async function withModule<T>(key: string, status: string, fn: () => Promise<T>): Promise<T> {
  const k = `module_${key}`;
  await prisma.setting.upsert({ where: { key: k }, update: { value: status }, create: { key: k, value: status } });
  try {
    return await fn();
  } finally {
    await prisma.setting.delete({ where: { key: k } });
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

  it("موجودی ناکافی، محصول ثبت‌نهایی‌نشده، بازار بسته و پایان مسابقه رد می‌شوند", async () => {
    const { product } = await makeTeamWithProduct({ price: 30 });
    const poor = await makeUser(29);
    expect((await market.purchaseProduct(poor.id, product.id)).ok).toBe(false);

    const { product: draft } = await makeTeamWithProduct({ submitted: false });
    const buyer = await makeUser(100);
    expect((await market.purchaseProduct(buyer.id, draft.id)).ok).toBe(false);

    for (const status of ["ro", "closed", "hidden"]) {
      const res = await withModule("market", status, () => market.purchaseProduct(buyer.id, product.id));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("فعلاً باز نیست");
    }
    await phase.setPhase("CLOSED", null);
    try {
      expect((await market.purchaseProduct(buyer.id, product.id)).ok).toBe(false);
    } finally {
      await phase.setPhase("LIVE", null);
    }
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

describe("adslots.ts: حراج جایگاه تبلیغاتی", () => {
  const HOUR = 3600_000;
  let slotCounter = 0;

  /** جایگاه تازه در آینده با زمان یکتا */
  async function futureSlot(kind: "BANNER" | "FEATURED" | "PUSH" = "BANNER") {
    slotCounter++;
    return prisma.adSlot.create({ data: { kind, hourStart: new Date(Date.now() + (slotCounter + 1) * HOUR) } });
  }

  const slotOf = (id: string) => prisma.adSlot.findUniqueOrThrow({ where: { id } });

  describe("ساخت بازه‌ها و قیمت‌ها", () => {
    it("ensureAdSlots برای هر بازه تا ددلاین و هر نوع یک جایگاه می‌سازد و idempotent است", async () => {
      const start = new Date(2031, 0, 1, 0, 0, 0);
      const inRange = { hourStart: { gte: start } };
      await phase.setPhase("LIVE", new Date(start.getTime() + 72 * HOUR));
      try {
        await adslots.ensureAdSlots(start);
        expect(await prisma.adSlot.count({ where: inRange })).toBe(9); // ۳ بازهٔ ۲۴ساعته × ۳ نوع
        await adslots.ensureAdSlots(start);
        expect(await prisma.adSlot.count({ where: inRange })).toBe(9);
      } finally {
        await prisma.adSlot.deleteMany({ where: inRange });
        await phase.setPhase("LIVE", null);
      }
    });

    it("طول بازه از تنظیمات adslot_hours می‌آید", async () => {
      const start = new Date(2032, 0, 1, 0, 0, 0);
      const inRange = { hourStart: { gte: start } };
      await prisma.setting.create({ data: { key: "adslot_hours", value: "12" } });
      await phase.setPhase("LIVE", new Date(start.getTime() + 24 * HOUR));
      try {
        await adslots.ensureAdSlots(start);
        const rows = await prisma.adSlot.findMany({ where: { ...inRange, kind: "BANNER" }, orderBy: { hourStart: "asc" } });
        expect(rows.map((r) => r.hourStart.getTime() - start.getTime())).toEqual([0, 12 * HOUR]);
      } finally {
        await prisma.adSlot.deleteMany({ where: inRange });
        await prisma.setting.delete({ where: { key: "adslot_hours" } });
        await phase.setPhase("LIVE", null);
      }
    });

    it("کمترین پیشنهاد پیش‌فرض دارد و از تنظیمات خوانده می‌شود", async () => {
      expect(await adslots.adSlotPrices()).toEqual({ BANNER: 60, FEATURED: 40, PUSH: 80 });
      await prisma.setting.create({ data: { key: "adslot_price_featured", value: "45" } });
      try {
        expect((await adslots.adSlotPrices()).FEATURED).toBe(45);
      } finally {
        await prisma.setting.delete({ where: { key: "adslot_price_featured" } });
      }
    });

    it("minNextSlotBid: نخستین پیشنهاد برابر پایه، سپس بالاترین + گام", () => {
      expect(adslots.minNextSlotBid(60, null)).toBe(60);
      expect(adslots.minNextSlotBid(60, 60)).toBe(60 + DEFAULTS.adslotBidIncrement);
      expect(adslots.minNextSlotBid(60, 200)).toBe(200 + DEFAULTS.adslotBidIncrement);
    });
  });

  describe("bidAdSlot", () => {
    it("نخستین پیشنهاد: هر عضو تیم، سکه همان لحظه کم می‌شود و جایگاه به محصول می‌رسد", async () => {
      const { team, members, product } = await makeTeamWithProduct({ members: 2 });
      const slot = await futureSlot("BANNER");

      const low = await adslots.bidAdSlot(members[1].id, slot.id, product.id, 59);
      expect(low.ok).toBe(false);
      if (!low.ok) expect(low.error).toContain("کمترین پیشنهاد");

      const res = await adslots.bidAdSlot(members[1].id, slot.id, product.id, 60);
      expect(res).toEqual({ ok: true, amount: 60 });
      expect(await walletOf(members[1].id)).toBe(140);
      expect(await slotOf(slot.id)).toMatchObject({
        status: "OPEN",
        winnerTeamId: team.id,
        winnerUserId: members[1].id,
        winnerProductId: product.id,
        pricePaid: 60,
      });
      const ledger = await prisma.ledgerEntry.findMany({ where: { refId: slot.id } });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ userId: members[1].id, teamId: team.id, wallet: "BUY", delta: -60, reason: "ADSLOT" });
      expect(await prisma.adSlotBid.findMany({ where: { slotId: slot.id } })).toMatchObject([{ userId: members[1].id, teamId: team.id, productId: product.id, amount: 60 }]);
    });

    it("پیشنهاد بالاتر جایگاه را می‌گیرد و پیشنهاد قبلی کامل به نفر قبلی برمی‌گردد، حتی اگر دیرتر آمده باشد", async () => {
      const first = await makeTeamWithProduct();
      const second = await makeTeamWithProduct();
      const slot = await futureSlot("FEATURED");
      expect((await adslots.bidAdSlot(first.members[0].id, slot.id, first.product.id, 40)).ok).toBe(true);
      expect(await walletOf(first.members[0].id)).toBe(160);

      // کمتر از بالاترین + گام رد می‌شود و هیچ سکه‌ای جابه‌جا نمی‌شود
      const tooLow = await adslots.bidAdSlot(second.members[0].id, slot.id, second.product.id, 40 + DEFAULTS.adslotBidIncrement - 1);
      expect(tooLow.ok).toBe(false);
      expect(await walletOf(first.members[0].id)).toBe(160);
      expect(await walletOf(second.members[0].id)).toBe(200);

      const amount = 40 + DEFAULTS.adslotBidIncrement;
      expect((await adslots.bidAdSlot(second.members[0].id, slot.id, second.product.id, amount)).ok).toBe(true);
      expect(await walletOf(first.members[0].id)).toBe(200);
      expect(await walletOf(second.members[0].id)).toBe(200 - amount);
      expect(await slotOf(slot.id)).toMatchObject({ winnerTeamId: second.team.id, winnerUserId: second.members[0].id, winnerProductId: second.product.id, pricePaid: amount });

      const refunds = await prisma.ledgerEntry.findMany({ where: { refId: slot.id, reason: adslots.ADSLOT_REFUND_REASON } });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]).toMatchObject({ userId: first.members[0].id, teamId: first.team.id, wallet: "BUY", delta: 40 });
      expect(await prisma.adSlotBid.count({ where: { slotId: slot.id } })).toBe(2);

      // تیم قبلی خبردار می‌شود
      expect(await prisma.notification.count({ where: { kind: "adslot_outbid", userId: first.members[0].id } })).toBe(1);
      expect(await prisma.notification.count({ where: { kind: "adslot_outbid", userId: second.members[0].id } })).toBe(0);

      // شبکه: وضعیت و کمترین پیشنهاد بعدی
      const cell = (await adslots.slotsGrid(second.team.id)).find((c) => c.id === slot.id)!;
      expect(cell).toMatchObject({ state: "OPEN", mine: true, winnerTeamId: second.team.id, pricePaid: amount, minBid: amount + DEFAULTS.adslotBidIncrement });
      expect((await adslots.slotsGrid(first.team.id)).find((c) => c.id === slot.id)?.mine).toBe(false);
    });

    it("زنجیرهٔ پیشنهادها: جمع سکهٔ کیف‌ها فقط به اندازهٔ بالاترین پیشنهاد کم شده است", async () => {
      const a = await makeTeamWithProduct();
      const b = await makeTeamWithProduct();
      const slot = await futureSlot("BANNER");
      for (const [who, amount] of [[a, 60], [b, 70], [a, 80], [b, 100]] as const) {
        expect((await adslots.bidAdSlot(who.members[0].id, slot.id, who.product.id, amount)).ok).toBe(true);
      }
      expect(await walletOf(a.members[0].id)).toBe(200);
      expect(await walletOf(b.members[0].id)).toBe(100);
    });

    it("بالا بردن پیشنهاد خود: پیشنهاد قبلی همان نفر در موجودی حساب می‌شود و اعلان نمی‌گیرد", async () => {
      const { members, product } = await makeTeamWithProduct();
      await prisma.user.update({ where: { id: members[0].id }, data: { buyWallet: 70 } });
      const slot = await futureSlot("BANNER");
      expect((await adslots.bidAdSlot(members[0].id, slot.id, product.id, 60)).ok).toBe(true);
      expect(await walletOf(members[0].id)).toBe(10);

      // ۷۰ از کل موجودی (۱۰ + ۶۰) ممکن است؛ ۷۱ نه
      const tooMuch = await adslots.bidAdSlot(members[0].id, slot.id, product.id, 71);
      expect(tooMuch.ok).toBe(false);
      if (!tooMuch.ok) expect(tooMuch.error).toContain("سکهٔ کافی");
      expect(await walletOf(members[0].id)).toBe(10);

      expect((await adslots.bidAdSlot(members[0].id, slot.id, product.id, 70)).ok).toBe(true);
      expect(await walletOf(members[0].id)).toBe(0);
      expect((await slotOf(slot.id)).pricePaid).toBe(70);
      expect(await prisma.notification.count({ where: { kind: "adslot_outbid", userId: members[0].id } })).toBe(0);
    });

    it("هم‌تیمی پیشنهاد را بالا می‌برد: سکهٔ نفر قبلی برمی‌گردد و سقف تیم مصرف اضافه نمی‌شود", async () => {
      const { members, product } = await makeTeamWithProduct({ members: 2 });
      const s1 = await futureSlot("PUSH");
      const s2 = await futureSlot("PUSH");
      expect((await adslots.bidAdSlot(members[0].id, s1.id, product.id, 80)).ok).toBe(true);
      expect((await adslots.bidAdSlot(members[0].id, s2.id, product.id, 80)).ok).toBe(true);
      // هر دو جایگاه سقف تیم را پر کرده‌اند، ولی بالابردن جایگاهی که دست تیم است آزاد است
      expect((await adslots.bidAdSlot(members[1].id, s1.id, product.id, 90)).ok).toBe(true);
      expect(await walletOf(members[0].id)).toBe(120);
      expect(await walletOf(members[1].id)).toBe(110);
      expect(await prisma.notification.count({ where: { kind: "adslot_outbid", userId: members[0].id } })).toBe(0);
    });

    it("سقف جایگاه هر تیم (پیش‌فرض ۲) برای همهٔ اعضا مشترک است و با شکسته‌شدن پیشنهاد آزاد می‌شود", async () => {
      const { members, product } = await makeTeamWithProduct({ members: 2 });
      const s1 = await futureSlot("FEATURED");
      const s2 = await futureSlot("FEATURED");
      const s3 = await futureSlot("FEATURED");
      expect((await adslots.bidAdSlot(members[0].id, s1.id, product.id, 40)).ok).toBe(true);
      expect((await adslots.bidAdSlot(members[1].id, s2.id, product.id, 40)).ok).toBe(true);
      const third = await adslots.bidAdSlot(members[1].id, s3.id, product.id, 40);
      expect(third.ok).toBe(false);
      if (!third.ok) expect(third.error).toContain("حداکثر");

      const rival = await makeTeamWithProduct();
      expect((await adslots.bidAdSlot(rival.members[0].id, s1.id, rival.product.id, 50)).ok).toBe(true);
      expect((await adslots.bidAdSlot(members[1].id, s3.id, product.id, 40)).ok).toBe(true);
    });

    it("پیشنهاد در لحظهٔ شروع بازه بسته می‌شود؛ شبکه وضعیت LIVE و PAST را نشان می‌دهد", async () => {
      const { members, product } = await makeTeamWithProduct();
      const live = await prisma.adSlot.create({ data: { kind: "BANNER", hourStart: new Date(Date.now() - HOUR) } });
      const past = await prisma.adSlot.create({ data: { kind: "BANNER", hourStart: new Date(Date.now() - 25 * HOUR) } });
      const startingNow = await prisma.adSlot.create({ data: { kind: "FEATURED", hourStart: new Date() } });
      for (const slot of [live, past, startingNow]) {
        const res = await adslots.bidAdSlot(members[0].id, slot.id, product.id, 500);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("بسته");
      }
      expect(await walletOf(members[0].id)).toBe(200);
      const grid = await adslots.slotsGrid(null);
      expect(grid.find((c) => c.id === live.id)?.state).toBe("LIVE");
      expect(grid.find((c) => c.id === past.id)?.state).toBe("PAST");
    });

    it("بی‌تیم، محصول ثبت‌نهایی‌نشده، محصول تیم دیگر، مبلغ نامعتبر، موجودی ناکافی و جایگاه ناموجود رد می‌شوند", async () => {
      const slot = await futureSlot("PUSH");
      const { members, product } = await makeTeamWithProduct();

      const teamless = await makeUser(500);
      expect((await adslots.bidAdSlot(teamless.id, slot.id, product.id, 80)).ok).toBe(false);

      const draft = await makeTeamWithProduct({ submitted: false });
      const draftRes = await adslots.bidAdSlot(draft.members[0].id, slot.id, draft.product.id, 80);
      expect(draftRes.ok).toBe(false);
      if (!draftRes.ok) expect(draftRes.error).toContain("ثبت نهایی");

      const foreign = await makeTeamWithProduct();
      const foreignRes = await adslots.bidAdSlot(members[0].id, slot.id, foreign.product.id, 80);
      expect(foreignRes.ok).toBe(false);
      if (!foreignRes.ok) expect(foreignRes.error).toContain("متعلق");

      for (const bad of [0, -5, 80.5, Number.NaN]) {
        expect((await adslots.bidAdSlot(members[0].id, slot.id, product.id, bad)).ok).toBe(false);
      }

      const poor = await makeTeamWithProduct();
      await prisma.user.update({ where: { id: poor.members[0].id }, data: { buyWallet: 79 } });
      const noCoins = await adslots.bidAdSlot(poor.members[0].id, slot.id, poor.product.id, 80);
      expect(noCoins.ok).toBe(false);
      if (!noCoins.ok) expect(noCoins.error).toContain("سکهٔ کافی");

      expect((await adslots.bidAdSlot(members[0].id, "no-such-slot", product.id, 80)).ok).toBe(false);
      expect((await slotOf(slot.id)).pricePaid).toBeNull();
      expect(await prisma.ledgerEntry.count({ where: { refId: slot.id } })).toBe(0);
    });

    it("سکه‌های رزروشده برای پیشتازی در حراج زنده خرج‌شدنی نیستند", async () => {
      const { members, product } = await makeTeamWithProduct();
      const { product: auctioned } = await makeTeamWithProduct();
      const slot = await futureSlot("BANNER");
      const a = await prisma.auction.create({
        data: { productId: auctioned.id, status: "LIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 60_000) },
      });
      await prisma.bid.create({ data: { auctionId: a.id, userId: members[0].id, amount: 150 } });
      try {
        const res = await adslots.bidAdSlot(members[0].id, slot.id, product.id, 60);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("سکهٔ کافی");
      } finally {
        await prisma.auction.update({ where: { id: a.id }, data: { status: "ENDED" } });
      }
    });

    it("بخش جایگاه باید باز باشد (مگر استثنای همان تیم) و پس از پایان مسابقه بسته است", async () => {
      const { team, members, product } = await makeTeamWithProduct();
      const slot = await futureSlot("BANNER");
      for (const status of ["ro", "closed", "hidden"]) {
        const res = await withModule("adslots", status, () => adslots.bidAdSlot(members[0].id, slot.id, product.id, 60));
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toContain("فعلاً باز نیست");
      }
      await phase.setPhase("CLOSED", null);
      try {
        expect((await adslots.bidAdSlot(members[0].id, slot.id, product.id, 60)).ok).toBe(false);
      } finally {
        await phase.setPhase("LIVE", null);
      }
      expect(await walletOf(members[0].id)).toBe(200);

      await prisma.moduleException.create({ data: { moduleKey: "adslots", teamId: team.id, createdBy: "test" } });
      const res = await withModule("adslots", "closed", () => adslots.bidAdSlot(members[0].id, slot.id, product.id, 60));
      expect(res.ok).toBe(true);
    });

    it("دو پیشنهاد هم‌زمان سکه را گم نمی‌کنند: یک برنده و بازگشت کامل بقیه", async () => {
      const a = await makeTeamWithProduct();
      const b = await makeTeamWithProduct();
      const slot = await futureSlot("BANNER");
      const results = await Promise.all([
        adslots.bidAdSlot(a.members[0].id, slot.id, a.product.id, 60),
        adslots.bidAdSlot(b.members[0].id, slot.id, b.product.id, 60),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const row = await slotOf(slot.id);
      expect(row.pricePaid).toBe(60);
      const winner = row.winnerUserId === a.members[0].id ? a : b;
      const loser = winner === a ? b : a;
      expect(await walletOf(winner.members[0].id)).toBe(140);
      expect(await walletOf(loser.members[0].id)).toBe(200);
    });

    it("یک تیم می‌تواند برای محصول هر محورش جدا پیشنهاد بدهد", async () => {
      const { team, members } = await makeTeamWithProduct();
      const content = await prisma.product.create({
        data: { teamId: team.id, trackId: "content", slug: `${team.slug}-content`, name: "محتوا", submittedAt: new Date() },
      });
      const slot = await futureSlot("BANNER");
      expect((await adslots.bidAdSlot(members[0].id, slot.id, content.id, 60)).ok).toBe(true);
      expect((await slotOf(slot.id)).winnerProductId).toBe(content.id);
    });
  });

  describe("نمایش برنده و اعلان", () => {
    it("currentAdWinners محصول صاحب بازهٔ جاری هر نوع را برمی‌گرداند", async () => {
      const now = new Date(2029, 5, 1, 12, 0, 0);
      const a = await makeTeamWithProduct();
      const b = await makeTeamWithProduct();
      await prisma.adSlot.createMany({
        data: [
          { kind: "BANNER", hourStart: new Date(now.getTime() - HOUR), winnerTeamId: a.team.id, winnerProductId: a.product.id, pricePaid: 1 },
          { kind: "FEATURED", hourStart: new Date(now.getTime() + HOUR), winnerTeamId: b.team.id, winnerProductId: b.product.id, pricePaid: 1 }, // هنوز شروع نشده
          { kind: "PUSH", hourStart: new Date(now.getTime() - 25 * HOUR), winnerTeamId: b.team.id, winnerProductId: b.product.id, pricePaid: 1 }, // تمام‌شده
        ],
      });
      expect(await adslots.currentAdWinners(now)).toEqual({ banner: a.product.id, featured: null, push: null });
    });

    it("sendDuePushSlots وقتی بازه شروع شد یک‌بار به همه اعلان می‌دهد و محصول ثبت‌نشده علامت «ارسال‌نشده» می‌گیرد", async () => {
      const a = await makeTeamWithProduct();
      const slot = await prisma.adSlot.create({
        data: { kind: "PUSH", hourStart: new Date(Date.now() - 30 * 60_000), winnerTeamId: a.team.id, winnerProductId: a.product.id, winnerUserId: a.members[0].id, pricePaid: 80 },
      });
      const draft = await makeTeamWithProduct({ submitted: false });
      const skipped = await prisma.adSlot.create({
        data: { kind: "PUSH", hourStart: new Date(Date.now() - 40 * 60_000), winnerTeamId: draft.team.id, winnerProductId: draft.product.id, winnerUserId: draft.members[0].id, pricePaid: 80 },
      });
      const sent = await adslots.sendDuePushSlots();
      expect(sent).toBe(1);
      const note = await prisma.notification.findFirstOrThrow({ where: { kind: "adslot_push", userId: a.members[0].id } });
      expect(note.href).toBe(`/market/${a.product.slug}`);
      expect((await prisma.setting.findUniqueOrThrow({ where: { key: `adslot_push_sent:${skipped.id}` } })).value).toBe("skipped");
      expect((await prisma.setting.findUniqueOrThrow({ where: { key: `adslot_push_sent:${slot.id}` } })).value).not.toBe("");
      expect(await adslots.sendDuePushSlots()).toBe(0);
    });
  });
});

describe("market.ts: getCurrentAdSlotWinners (بازهٔ جاری، بدون N+1)", () => {
  // زمانی دور در آینده تا جایگاه‌های بقیهٔ تست‌ها در بازه نیفتند
  const now = new Date(2030, 0, 1, 10, 0, 0);
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);

  it("برندهٔ اکنون جدیدترین جایگاه هر نوع است، بدون بازپرداخت‌شده، محصول ثبت‌نشده و بازه‌های گذشته و آینده", async () => {
    const a = await makeTeamWithProduct();
    const older = await makeTeamWithProduct();
    const refunded = await makeTeamWithProduct();
    const unsubmitted = await makeTeamWithProduct({ submitted: false });
    const featured = await makeTeamWithProduct();
    const row = (kind: string, hourStart: Date, w: { team: { id: string }; product: { id: string } }, status = "OPEN") => ({
      kind,
      hourStart,
      status,
      winnerTeamId: w.team.id,
      winnerProductId: w.product.id,
      pricePaid: 1,
    });
    await prisma.adSlot.createMany({
      data: [
        row("BANNER", ago(1), a),
        row("BANNER", ago(5), older),
        row("BANNER", ago(25), older), // تمام‌شده (بازهٔ پیش‌فرض ۲۴ ساعت)
        row("FEATURED", ago(1), unsubmitted),
        row("FEATURED", ago(2), refunded, "REFUNDED"),
        row("FEATURED", ago(4), featured),
        row("BANNER", new Date(now.getTime() + 60_000), older), // هنوز شروع نشده
      ],
    });

    const winners = await market.getCurrentAdSlotWinners(now);
    const byKind = Object.fromEntries(winners.map((w) => [w.kind, w.teamId]));
    expect(winners).toHaveLength(2);
    expect(byKind).toEqual({ BANNER: a.team.id, FEATURED: featured.team.id });
    expect(winners.find((w) => w.kind === "BANNER")).toMatchObject({ productSlug: a.product.slug, productName: a.product.name });
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
