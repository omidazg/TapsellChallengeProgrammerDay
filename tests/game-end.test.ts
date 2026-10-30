/**
 * تست واحد پایان بازی و زمان‌بند روی یک پایگاه‌دادهٔ SQLite موقت:
 *  - ددلاین نهایی تنها زمان‌بندی است و با رسیدنش مسابقه خودکار بسته می‌شود (scheduler)
 *  - زمان آخرین تیک زمان‌بند روی globalThis (برای /api/health)
 *  - بازپرداخت جایگاه‌های تبلیغاتی تحویل‌نشده و برداشت نهایی آمار بازار
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
let modules: typeof import("../src/lib/module-state");

beforeAll(async () => {
  db = createTempDb("game-end-test");
  ({ prisma } = await import("../src/lib/db"));
  phase = await import("../src/lib/phase");
  scheduler = await import("../src/lib/scheduler");
  adslots = await import("../src/lib/adslots");
  settlement = await import("../src/lib/settlement");
  transition = await import("../src/lib/phase-transition");
  modules = await import("../src/lib/module-state");
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
  const product = await prisma.product.create({ data: { teamId: team.id, slug: `end-team-${counter}-general`, name: `محصول ${counter}`, submittedAt: new Date() } });
  return { team, users, product };
}

/** یک جایگاه با بالاترین پیشنهاد، درست مثل bidAdSlot (کسر از کیف + ردیف ADSLOT دفتر کل) */
async function makeWonSlot(kind: "BANNER" | "FEATURED" | "PUSH", hourStart: Date, buyer: { id: string; teamId: string | null }, productId: string, price: number) {
  const slot = await prisma.adSlot.create({
    data: { kind, hourStart, winnerTeamId: buyer.teamId, winnerUserId: buyer.id, winnerProductId: productId, pricePaid: price },
  });
  await prisma.user.update({ where: { id: buyer.id }, data: { buyWallet: { decrement: price } } });
  await prisma.ledgerEntry.create({
    data: { userId: buyer.id, teamId: buyer.teamId, wallet: "BUY", delta: -price, reason: "ADSLOT", refId: slot.id },
  });
  return slot;
}

describe("adslots: isAdSlotDelivered (خالص)", () => {
  const now = Date.UTC(2026, 9, 10, 18, 0, 0);
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 10, h, m, 0));

  it("بنر/کارت ویژه: اگر بازه‌اش تا این لحظه شروع شده باشد تحویل شده است", () => {
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(10) }, null, now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "FEATURED", hourStart: at(18) }, null, now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "BANNER", hourStart: at(18, 1) }, null, now)).toBe(false);
  });

  it("اعلان: فقط با علامت ارسال واقعی (نه «skipped» و نه بدون علامت)", () => {
    expect(adslots.isAdSlotDelivered({ kind: "PUSH", hourStart: at(11) }, at(11, 1).toISOString(), now)).toBe(true);
    expect(adslots.isAdSlotDelivered({ kind: "PUSH", hourStart: at(11) }, "skipped", now)).toBe(false);
    expect(adslots.isAdSlotDelivered({ kind: "PUSH", hourStart: at(11) }, null, now)).toBe(false);
  });
});

describe("پایان بازی (سناریوی ترتیبی)", () => {
  it("بدون ددلاین یا پیش از ددلاین، زمان‌بند مسابقه را نمی‌بندد و زمان تیک را روی globalThis ثبت می‌کند", async () => {
    (globalThis as { __arenaLastTickAt?: number | null }).__arenaLastTickAt = null;
    expect(scheduler.getLastSchedulerTickAt()).toBeNull();

    const before = Date.now();
    await scheduler.runScheduledTasks();
    expect((await phase.getPhase()).phase).toBe("LIVE");

    // همان مقدار از globalThis خوانده می‌شود (نمونهٔ دیگری از ماژول هم همین را می‌بیند)
    const tick = scheduler.getLastSchedulerTickAt();
    expect(tick).not.toBeNull();
    expect(tick!).toBeGreaterThanOrEqual(before);
    expect((globalThis as { __arenaLastTickAt?: number | null }).__arenaLastTickAt).toBe(tick);

    const future = new Date(Date.now() + HOUR);
    await phase.setPhase("LIVE", future);
    await scheduler.runScheduledTasks();
    const p = await phase.getPhase();
    expect(p.phase).toBe("LIVE");
    expect(p.endsAt?.toISOString()).toBe(future.toISOString());
  });

  let early: Awaited<ReturnType<typeof settlement.settleGame>>;
  let buyer: { id: string; teamId: string | null };
  let buyerProductId: string;
  let refundedSlots: string[];
  let deliveredSlots: string[];

  it("تسویهٔ زودهنگام ثبت می‌شود ولی قطعی نیست", async () => {
    const { users, product } = await makeTeam(2, 100);
    buyer = users[0];
    buyerProductId = product.id;
    early = await settlement.settleGame();
    expect(early.alreadySettled).toBe(false);
    expect(await settlement.isFinalSettled()).toBe(false);
    expect((await prisma.setting.findUnique({ where: { key: settlement.SETTLED_FINAL_KEY } }))?.value).toBe("0");
    // تکرار پیش از پایان بازی دوباره نمی‌نویسد
    expect((await settlement.settleGame()).alreadySettled).toBe(true);
  });

  it("ددلاین نهایی: جایگاه‌های تحویل‌نشده بازپرداخت، آمار بازار برداشت، و تسویه دوباره و قطعی انجام می‌شود", async () => {
    const T = new Date(Date.now() - 2 * HOUR);
    T.setMinutes(0, 0, 0);

    const delivered = await makeWonSlot("BANNER", T, buyer, buyerProductId, 10); // بازه‌اش شروع شد و نمایش داده شد
    const pushSent = await makeWonSlot("PUSH", new Date(T.getTime() - HOUR), buyer, buyerProductId, 15);
    await prisma.setting.create({ data: { key: `adslot_push_sent:${pushSent.id}`, value: new Date().toISOString() } });
    const lateBanner = await makeWonSlot("FEATURED", new Date(Date.now() + 5 * HOUR), buyer, buyerProductId, 7); // بازه‌اش هرگز نرسید
    const pushSkipped = await makeWonSlot("PUSH", new Date(T.getTime() - 2 * HOUR), buyer, buyerProductId, 5);
    await prisma.setting.create({ data: { key: `adslot_push_sent:${pushSkipped.id}`, value: "skipped" } });
    const pushNever = await makeWonSlot("PUSH", new Date(Date.now() + 6 * HOUR), buyer, buyerProductId, 4);
    refundedSlots = [lateBanner.id, pushSkipped.id, pushNever.id];
    deliveredSlots = [delivered.id, pushSent.id];
    const walletBefore = (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet;

    // آمار بازار پیش از ددلاین برداشت نشده است
    await prisma.bazaarStat.create({ data: { productId: buyerProductId, activeInstalls: 5 } });

    // تیم تازه پس از تسویهٔ زودهنگام: در بازتسویهٔ CLOSED باید وارد نتیجه شود
    const late = await makeTeam(1);
    const lateKey = { teamId_trackId: { teamId: late.team.id, trackId: "general" } };
    expect(await prisma.teamScore.findUnique({ where: lateKey })).toBeNull();

    // ددلاین گذشته: تیک زمان‌بند خودش مسابقه را می‌بندد
    await phase.setPhase("LIVE", new Date(Date.now() - 1_000));
    await scheduler.runScheduledTasks();
    expect((await phase.getPhase()).phase).toBe("CLOSED");

    // بازپرداخت: ۷ + ۵ + ۴ = ۱۶ سکه به همان پیشنهاددهنده
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).buyWallet).toBe(walletBefore + 16);
    for (const id of refundedSlots) {
      expect((await prisma.adSlot.findUniqueOrThrow({ where: { id } })).status).toBe("REFUNDED");
      const rows = await prisma.ledgerEntry.findMany({ where: { reason: adslots.ADSLOT_REFUND_REASON, refId: id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: buyer.id, teamId: buyer.teamId, wallet: "BUY" });
      expect(rows[0].delta).toBeGreaterThan(0);
    }
    for (const id of deliveredSlots) {
      expect((await prisma.adSlot.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
      expect(await prisma.ledgerEntry.count({ where: { reason: adslots.ADSLOT_REFUND_REASON, refId: id } })).toBe(0);
    }
    expect(await prisma.notification.count({ where: { kind: "adslot_refund", user: { teamId: buyer.teamId } } })).toBe(2);

    // برداشت نهایی آمار
    expect((await prisma.bazaarStat.findUniqueOrThrow({ where: { productId: buyerProductId } })).snapshotAt).not.toBeNull();

    // تسویه دوباره و قطعی
    expect(await settlement.isFinalSettled()).toBe(true);
    expect(await prisma.teamScore.findUnique({ where: lateKey })).not.toBeNull();
    const settledAt = await settlement.getSettledAt();
    expect(settledAt!.getTime()).toBeGreaterThanOrEqual(early.settledAt.getTime());
  });

  it("پس از پایان، بخش‌های بازی فقط‌خواندنی می‌شوند ولی داوری و نتایج وضعیت خودشان را دارند", async () => {
    const statuses = await modules.getModuleStatuses();
    for (const key of modules.MODULES_FROZEN_AT_END) expect(statuses[key]).toBe("ro");
    expect(statuses.jury).toBe(modules.MODULE_DEFAULTS.jury);
    expect(statuses.results).toBe(modules.MODULE_DEFAULTS.results);
    expect(await modules.moduleOpen("invest")).toBe(false);
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

  it("transitionTo(CLOSED) دوباره هم امن است", async () => {
    const res = await transition.transitionTo("CLOSED", null);
    expect(res.settleFailed).toBeUndefined();
    expect(await settlement.isFinalSettled()).toBe(true);
  });
});
