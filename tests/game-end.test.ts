/**
 * تست واحد پایان بازی و زمان‌بند روی یک پایگاه‌دادهٔ SQLite موقت:
 *  - phase_hours_X = 0 یعنی «بدون زمان پایان» (scheduler.phaseEndsAtFromHours / autoAdvancePhase)
 *  - زمان آخرین تیک زمان‌بند روی globalThis (برای /api/health)
 *  - بازه‌های واقعی روز بازار و بازپرداخت جایگاه‌های تبلیغاتی تحویل‌نشده (adslots.ts)
 *  - تسویهٔ زودهنگام که با رسیدن به CLOSED دوباره و قطعی انجام می‌شود (settlement / phase-transition)
 * سناریو ترتیبی است (تسویه در کل پایگاه‌داده محاسبه می‌شود).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let phase: typeof import("../src/lib/phase");
let scheduler: typeof import("../src/lib/scheduler");
let adslots: typeof import("../src/lib/adslots");
let settlement: typeof import("../src/lib/settlement");
let transition: typeof import("../src/lib/phase-transition");

beforeAll(async () => {
  db = createTempDb("game-end-test");
  ({ prisma } = await import("../src/lib/db"));
  phase = await import("../src/lib/phase");
  scheduler = await import("../src/lib/scheduler");
  adslots = await import("../src/lib/adslots");
  settlement = await import("../src/lib/settlement");
  transition = await import("../src/lib/phase-transition");
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

const HOUR = 3600_000;

let counter = 0;
async function makeTeam(members = 1, buyWallet = 100) {
  counter++;
  const team = await prisma.team.create({ data: { name: `تیم پایان ${counter}`, slug: `end-team-${counter}` } });
  const users = [];
  for (let i = 0; i < members; i++) {
    users.push(
      await prisma.user.create({
        data: {
          email: `end-${counter}-${i}@example.test`,
          passwordHash: "x",
          nickname: `کاربر ${counter}-${i}`,
          role: "BUILDER",
          power: "",
          buyWallet,
          teamId: team.id,
        },
      })
    );
  }
  await prisma.product.create({ data: { teamId: team.id, name: `محصول ${counter}`, submittedAt: new Date() } });
  return { team, users };
}

/** یک جایگاه فروخته‌شده، درست مثل buyAdSlot (کسر از کیف + ردیف ADSLOT دفتر کل) */
async function makeSoldSlot(kind: "BANNER" | "FEATURED" | "PUSH", hourStart: Date, buyer: { id: string; teamId: string | null }, price: number) {
  const slot = await prisma.adSlot.create({
    data: { kind, hourStart, status: "CLOSED", winnerTeamId: buyer.teamId, pricePaid: price },
  });
  await prisma.user.update({ where: { id: buyer.id }, data: { buyWallet: { decrement: price } } });
  await prisma.ledgerEntry.create({
    data: { userId: buyer.id, teamId: buyer.teamId, wallet: "BUY", delta: -price, reason: "ADSLOT", refId: slot.id },
  });
  return slot;
}

describe("scheduler: phaseEndsAtFromHours (phase_hours = 0 یعنی بدون زمان پایان)", () => {
  it("صفر، منفی، null و نامعتبر → null؛ مثبت → now + hours", () => {
    const now = Date.UTC(2026, 9, 10, 8, 0, 0);
    expect(scheduler.phaseEndsAtFromHours(0, now)).toBeNull();
    expect(scheduler.phaseEndsAtFromHours(-3, now)).toBeNull();
    expect(scheduler.phaseEndsAtFromHours(null, now)).toBeNull();
    expect(scheduler.phaseEndsAtFromHours(Number.NaN, now)).toBeNull();
    expect(scheduler.phaseEndsAtFromHours(8, now)?.getTime()).toBe(now + 8 * HOUR);
    expect(scheduler.phaseEndsAtFromHours(0.5, now)?.getTime()).toBe(now + HOUR / 2);
  });
});

describe("adslots: isAdSlotDelivered (خالص)", () => {
  const now = Date.UTC(2026, 9, 10, 18, 0, 0);
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h, m, 0));
  const windows = [{ start: at(10, 30).toISOString(), end: at(12).toISOString() }];

  it("بنر/کارت ویژه: هم‌پوشانی حتی بخشی از ساعت با روز بازار یعنی تحویل", () => {
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(10) }, windows, null, now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "FEATURED", hourStart: at(11) }, windows, null, now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(12) }, windows, null, now)).toBe(false);
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(9) }, windows, null, now)).toBe(false);
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(10) }, [], null, now)).toBe(false);
  });

  it("بازهٔ باز تا nowMs حساب می‌شود", () => {
    const open = [{ start: at(16).toISOString(), end: null }];
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(17) }, open, null, now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(18) }, open, null, now)).toBe(false);
  });

  it("اعلان: فقط با علامت ارسال واقعی (نه «skipped» و نه بدون علامت)", () => {
    expect(adslots.isAdSlotDelivered({ kind: "PUSH", hourStart: at(11) }, windows, at(11, 1).toISOString(), now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "PUSH", hourStart: at(11) }, windows, "skipped", now)).toBe(false);
    expect(adslots.isAdSlotDelivered({ kind: "PUSH", hourStart: at(11) }, windows, null, now)).toBe(false);
  });
});

describe("پایان بازی (سناریوی ترتیبی)", () => {
  it("زمان‌بند با phase_hours_MARKET=0 به روز بازار بدون زمان پایان می‌رود و زمان تیک را روی globalThis ثبت می‌کند", async () => {
    (globalThis as { __arenaLastTickAt?: number | null }).__arenaLastTickAt = null;
    expect(scheduler.getLastSchedulerTickAt()).toBeNull();

    await prisma.setting.create({ data: { key: "auto_advance", value: "1" } });
    await prisma.setting.create({ data: { key: "phase_hours_MARKET", value: "0" } });
    await phase.setPhase("BUILD", new Date(Date.now() - 1_000));

    const before = Date.now();
    await scheduler.runScheduledTasks();
    const p = await phase.getPhase();
    expect(p.phase).toBe("MARKET");
    expect(p.endsAt).toBeNull();

    // همان مقدار از globalThis خوانده می‌شود (نمونهٔ دیگری از ماژول هم همین را می‌بیند)
    const tick = scheduler.getLastSchedulerTickAt();
    expect(tick).not.toBeNull();
    expect(tick!).toBeGreaterThanOrEqual(before);
    expect((globalThis as { __arenaLastTickAt?: number | null }).__arenaLastTickAt).toBe(tick);

    // ورود به MARKET (از هر مسیری) یک بازهٔ باز روز بازار ثبت می‌کند
    const windows = await adslots.getMarketWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0].end).toBeNull();
  });

  it("recordMarketWindow idempotent است: MARKET تکراری بازهٔ تازه باز نمی‌کند و فاز دیگر آن را می‌بندد", async () => {
    await adslots.recordMarketWindow("MARKET");
    expect(await adslots.getMarketWindows()).toHaveLength(1);

    const closeAt = new Date(Date.now() + 1_000);
    await adslots.recordMarketWindow("BUILD", closeAt);
    await adslots.recordMarketWindow("CLOSED", new Date(Date.now() + 5_000)); // بازهٔ بازی نیست؛ بی‌اثر
    let windows = await adslots.getMarketWindows();
    expect(windows).toHaveLength(1);
    expect(windows[0].end).toBe(closeAt.toISOString());

    await adslots.recordMarketWindow("MARKET", new Date(Date.now() + 2_000));
    windows = await adslots.getMarketWindows();
    expect(windows).toHaveLength(2);
    expect(windows[1].end).toBeNull();
  });

  let early: Awaited<ReturnType<typeof settlement.settleGame>>;
  let buyer: { id: string; teamId: string | null };
  let refundedSlots: string[];
  let deliveredSlots: string[];

  it("تسویهٔ زودهنگام در روز بازار ثبت می‌شود ولی قطعی نیست", async () => {
    const { users } = await makeTeam(2, 100);
    buyer = users[0];
    early = await settlement.settleGame();
    expect(early.alreadySettled).toBe(false);
    expect(await settlement.isFinalSettled()).toBe(false);
    expect((await prisma.setting.findUnique({ where: { key: settlement.SETTLED_FINAL_KEY } }))?.value).toBe("0");
    // تکرار پیش از پایان بازی دوباره نمی‌نویسد
    expect((await settlement.settleGame()).alreadySettled).toBe(true);
  });

  it("رفتن به CLOSED: جایگاه‌های تحویل‌نشده بازپرداخت و تسویه دوباره و قطعی انجام می‌شود", async () => {
    // بازهٔ روز بازار را به یک بازهٔ مشخص بازنویسی می‌کنیم: [T, T+2h) که T = دو ساعت پیش (باز تا اکنون)
    const T = new Date(Date.now() - 2 * HOUR);
    T.setMinutes(0, 0, 0);
    await prisma.setting.update({
      where: { key: adslots.MARKET_WINDOWS_KEY },
      data: { value: JSON.stringify([{ start: T.toISOString(), end: null }]) },
    });

    const delivered = await makeSoldSlot("BANNER", T, buyer, 10); // در روز بازار نمایش داده شد
    const pushSent = await makeSoldSlot("PUSH", new Date(T.getTime() + HOUR), buyer, 15);
    await prisma.setting.create({ data: { key: `adslot_push_sent:${pushSent.id}`, value: new Date().toISOString() } });
    const lateBanner = await makeSoldSlot("FEATURED", new Date(T.getTime() + 5 * HOUR), buyer, 7); // ساعتش هرگز نرسید
    const earlyBanner = await makeSoldSlot("BANNER", new Date(T.getTime() - 3 * HOUR), buyer, 8); // پیش از شروع روز بازار
    const pushSkipped = await makeSoldSlot("PUSH", new Date(T.getTime() - 2 * HOUR), buyer, 5);
    await prisma.setting.create({ data: { key: `adslot_push_sent:${pushSkipped.id}`, value: "skipped" } });
    const pushNever = await makeSoldSlot("PUSH", new Date(T.getTime() + 6 * HOUR), buyer, 4);
    refundedSlots = [lateBanner.id, earlyBanner.id, pushSkipped.id, pushNever.id];
    deliveredSlots = [delivered.id, pushSent.id];
    const walletBefore = (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet;

    // تیم تازه پس از تسویهٔ زودهنگام: در بازتسویهٔ CLOSED باید وارد نتیجه شود
    const late = await makeTeam(1);
    expect(await prisma.teamScore.findUnique({ where: { teamId: late.team.id } })).toBeNull();

    const res = await transition.transitionTo("CLOSED", null);
    expect(res.settleFailed).toBeUndefined();

    // بازپرداخت: ۷ + ۸ + ۵ + ۴ = ۲۴ سکه به همان خریدار
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet).toBe(walletBefore + 24);
    for (const id of refundedSlots) {
      expect((await prisma.adSlot.findUniqueOrThrow({ where: { id } })).status).toBe("REFUNDED");
      const rows = await prisma.ledgerEntry.findMany({ where: { reason: adslots.ADSLOT_REFUND_REASON, refId: id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: buyer.id, teamId: buyer.teamId, wallet: "BUY" });
      expect(rows[0].delta).toBeGreaterThan(0);
    }
    for (const id of deliveredSlots) {
      expect((await prisma.adSlot.findUniqueOrThrow({ where: { id } })).status).toBe("CLOSED");
      expect(await prisma.ledgerEntry.count({ where: { reason: adslots.ADSLOT_REFUND_REASON, refId: id } })).toBe(0);
    }
    expect(await prisma.notification.count({ where: { kind: "adslot_refund", user: { teamId: buyer.teamId } } })).toBe(2);

    // بازه پس از CLOSED بسته است
    const windows = await adslots.getMarketWindows();
    expect(windows[windows.length - 1].end).not.toBeNull();

    // تسویه دوباره و قطعی
    expect(await settlement.isFinalSettled()).toBe(true);
    expect(await prisma.teamScore.findUnique({ where: { teamId: late.team.id } })).not.toBeNull();
    const settledAt = await settlement.getSettledAt();
    expect(settledAt!.getTime()).toBeGreaterThanOrEqual(early.settledAt.getTime());
  });

  it("پس از تسویهٔ قطعی، تسویه و بازپرداخت دوباره کاری نمی‌کنند (idempotent)", async () => {
    const settledAt = await settlement.getSettledAt();
    const again = await settlement.settleGame();
    expect(again.alreadySettled).toBe(true);
    expect(again.settledAt.getTime()).toBe(settledAt!.getTime());

    const ledgerBefore = await prisma.ledgerEntry.count({ where: { reason: adslots.ADSLOT_REFUND_REASON } });
    const walletBefore = (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet;
    expect(await adslots.refundUndeliveredAdSlots()).toEqual({ refunded: 0, coins: 0 });
    expect(await prisma.ledgerEntry.count({ where: { reason: adslots.ADSLOT_REFUND_REASON } })).toBe(ledgerBefore);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet).toBe(walletBefore);
  });
});
