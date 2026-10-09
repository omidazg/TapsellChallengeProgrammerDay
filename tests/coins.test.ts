/**
 * تست واحد src/lib/coins.ts (خرید سکه با پول) و src/lib/prize-pool.ts روی یک پایگاه‌دادهٔ SQLite موقت.
 * درایور پرداخت با متغیر محیطی PAYMENT_DRIVER انتخاب می‌شود؛ این‌جا فقط درون همین فرایند تست تنظیم می‌شود
 * (هیچ فایل .env خوانده نمی‌شود).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDb, type TempDb } from "../scripts/lib/temp-db";

let db: TempDb;
let prisma: typeof import("../src/lib/db").prisma;
let coins: typeof import("../src/lib/coins");
let prizePool: typeof import("../src/lib/prize-pool");
let phase: typeof import("../src/lib/phase");

const CALLBACK_BASE = "http://localhost:3000/";

beforeAll(async () => {
  db = createTempDb("coins-test");
  ({ prisma } = await import("../src/lib/db"));
  coins = await import("../src/lib/coins");
  prizePool = await import("../src/lib/prize-pool");
  phase = await import("../src/lib/phase");
  await phase.setPhase("SEED_ROUND", null);
});

afterAll(async () => {
  await prisma.$disconnect();
  db.cleanup();
});

beforeEach(() => {
  vi.stubEnv("PAYMENT_DRIVER", "fake");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

let counter = 0;
async function makeUser(buyWallet = 200) {
  counter++;
  return prisma.user.create({
    data: { email: `coins-${counter}@example.test`, passwordHash: "x", nickname: `خریدار ${counter}`, role: "BUILDER", power: "", buyWallet },
  });
}

async function walletOf(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).buyWallet;
}

async function orderOf(id: string) {
  return prisma.coinOrder.findUniqueOrThrow({ where: { id } });
}

/** سفارش با درگاه آزمایشی؛ authority برگشتی را هم می‌دهد */
async function fakeOrder(userId: string, n: number) {
  const res = await coins.createCoinOrder(userId, n, CALLBACK_BASE);
  if (!res.ok) throw new Error(res.error);
  if (res.next.kind !== "redirect") throw new Error("expected redirect");
  return { orderId: res.orderId, authority: res.next.authority, url: res.next.url };
}

describe("coins.ts: قیمت و درایور", () => {
  it("هر سکه هزار تومان (ده هزار ریال) است", () => {
    expect(coins.coinsToRial(10)).toBe(100_000);
    expect(coins.coinsToToman(10)).toBe(10_000);
    expect(coins.coinsToToman(1)).toBe(1000);
  });

  it("در محیط غیرتولید پیش‌فرض درگاه آزمایشی است و manual صریح رعایت می‌شود", () => {
    vi.stubEnv("PAYMENT_DRIVER", "");
    expect(coins.getPaymentDriver()).toMatchObject({ name: "fake", online: true });
    vi.stubEnv("PAYMENT_DRIVER", "manual");
    expect(coins.getPaymentDriver()).toMatchObject({ name: "manual", online: false });
    vi.stubEnv("PAYMENT_DRIVER", " Fake ");
    expect(coins.getPaymentDriver().name).toBe("fake");
  });

  it("در production درگاه آزمایشی بدون اجازهٔ صریح فعال نمی‌شود", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_FAKE_ALLOWED", "");
    vi.stubEnv("PAYMENT_DRIVER", "fake");
    expect(coins.fakePaymentAllowed()).toBe(false);
    expect(coins.getPaymentDriver().name).toBe("manual");
    vi.stubEnv("PAYMENT_DRIVER", "");
    expect(coins.getPaymentDriver().name).toBe("manual");

    vi.stubEnv("PAYMENT_FAKE_ALLOWED", "1");
    vi.stubEnv("PAYMENT_DRIVER", "fake");
    expect(coins.fakePaymentAllowed()).toBe(true);
    expect(coins.getPaymentDriver().name).toBe("fake");
  });
});

describe("coins.ts: createCoinOrder", () => {
  it("سفارش PENDING با مبلغ ریالی درست می‌سازد و به درگاه آزمایشی هدایت می‌کند", async () => {
    const u = await makeUser();
    const res = await coins.createCoinOrder(u.id, 50, CALLBACK_BASE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.next.kind).toBe("redirect");
    if (res.next.kind !== "redirect") return;
    expect(res.next.url).toBe(`/coins/fake-gateway?authority=${encodeURIComponent(res.next.authority)}`);

    const order = await orderOf(res.orderId);
    expect(order).toMatchObject({
      userId: u.id,
      coins: 50,
      amountRial: 500_000,
      status: "PENDING",
      gateway: "fake",
      authority: res.next.authority,
      refId: null,
      paidAt: null,
    });
    // ثبت سفارش هنوز سکه‌ای اضافه نمی‌کند
    expect(await walletOf(u.id)).toBe(200);
    expect(await coins.boughtOrPendingCoins(u.id)).toEqual({ paid: 0, pending: 50 });
  });

  it("کمتر از حداقل خرید (۱۰ سکه) یا مقدار نامعتبر رد می‌شود", async () => {
    const u = await makeUser();
    for (const n of [9, 0, -20, Number.NaN]) {
      const res = await coins.createCoinOrder(u.id, n, CALLBACK_BASE);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("حداقل");
    }
    expect(await prisma.coinOrder.count({ where: { userId: u.id } })).toBe(0);
    expect((await coins.createCoinOrder(u.id, 10, CALLBACK_BASE)).ok).toBe(true);
  });

  it("پس از پایان بازی خرید سکه بسته است", async () => {
    const u = await makeUser();
    await phase.setPhase("CLOSED", null);
    try {
      const res = await coins.createCoinOrder(u.id, 20, CALLBACK_BASE);
      expect(res.ok).toBe(false);
    } finally {
      await phase.setPhase("SEED_ROUND", null);
    }
  });

  describe("سقف خرید هر نفر (پرداخت‌شده + در انتظار)", () => {
    beforeAll(async () => {
      await prisma.setting.upsert({
        where: { key: "max_bought_coins_per_user" },
        update: { value: "100" },
        create: { key: "max_bought_coins_per_user", value: "100" },
      });
    });
    afterAll(async () => {
      await prisma.setting.deleteMany({ where: { key: "max_bought_coins_per_user" } });
    });

    it("سفارش‌های در انتظار و پرداخت‌شده هر دو از سقف کم می‌کنند", async () => {
      const u = await makeUser();
      const first = await fakeOrder(u.id, 60);
      const over = await coins.createCoinOrder(u.id, 50, CALLBACK_BASE);
      expect(over.ok).toBe(false);
      if (!over.ok) expect(over.error).toContain("۴۰");

      // پرداخت سفارش اول هم سقف را آزاد نمی‌کند
      await coins.verifyCoinOrder("fake", first.authority, { status: "OK" });
      expect(await coins.boughtOrPendingCoins(u.id)).toEqual({ paid: 60, pending: 0 });
      expect((await coins.createCoinOrder(u.id, 41, CALLBACK_BASE)).ok).toBe(false);

      const second = await fakeOrder(u.id, 40);
      const full = await coins.createCoinOrder(u.id, 10, CALLBACK_BASE);
      expect(full.ok).toBe(false);
      if (!full.ok) expect(full.error).toContain("سقف");

      // لغو سفارش در انتظار جا باز می‌کند
      expect(await coins.cancelCoinOrder(u.id, second.orderId)).toBe(true);
      expect(await coins.boughtOrPendingCoins(u.id)).toEqual({ paid: 60, pending: 0 });
      expect((await coins.createCoinOrder(u.id, 40, CALLBACK_BASE)).ok).toBe(true);
    });

    it("سفارش ناموفق یا لغوشده در سقف حساب نمی‌شود", async () => {
      const u = await makeUser();
      const failed = await fakeOrder(u.id, 100);
      await coins.verifyCoinOrder("fake", failed.authority, { status: "NOK" });
      expect(await coins.boughtOrPendingCoins(u.id)).toEqual({ paid: 0, pending: 0 });
      expect((await coins.createCoinOrder(u.id, 100, CALLBACK_BASE)).ok).toBe(true);
    });
  });
});

describe("coins.ts: verifyCoinOrder (بازگشت از درگاه آزمایشی)", () => {
  it("پرداخت موفق سکه‌ها را دقیقاً یک‌بار به کیف اضافه و در دفتر کل ثبت می‌کند", async () => {
    const u = await makeUser(200);
    const { orderId, authority } = await fakeOrder(u.id, 50);

    const res = await coins.verifyCoinOrder("fake", authority, { status: "OK" });
    expect(res).toEqual({ ok: true, orderId, coins: 50, alreadyPaid: false });
    expect(await walletOf(u.id)).toBe(250);

    const order = await orderOf(orderId);
    expect(order.status).toBe("PAID");
    expect(order.refId).toBeTruthy();
    expect(order.paidAt).toBeInstanceOf(Date);

    const ledger = await prisma.ledgerEntry.findMany({ where: { userId: u.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ wallet: "BUY", delta: 50, reason: "COIN_PURCHASE", refId: orderId });

    // بازگشت دوباره (رفرش صفحهٔ بازگشت): idempotent
    const again = await coins.verifyCoinOrder("fake", authority, { status: "OK" });
    expect(again).toEqual({ ok: true, orderId, coins: 50, alreadyPaid: true });
    expect(await walletOf(u.id)).toBe(250);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id, reason: "COIN_PURCHASE" } })).toBe(1);

    // اعلان «سکه‌هایت اضافه شد» هم فقط یک‌بار
    expect(await prisma.notification.count({ where: { userId: u.id, kind: "coins" } })).toBe(1);
  });

  it("دو بازگشت هم‌زمان فقط یک‌بار سکه اضافه می‌کنند", async () => {
    const u = await makeUser(0);
    const { authority } = await fakeOrder(u.id, 30);
    const results = await Promise.all([
      coins.verifyCoinOrder("fake", authority, { status: "OK" }),
      coins.verifyCoinOrder("fake", authority, { status: "OK" }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.alreadyPaid)).toHaveLength(1);
    expect(await walletOf(u.id)).toBe(30);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id, reason: "COIN_PURCHASE" } })).toBe(1);
  });

  it("پرداخت ناموفق (NOK) سفارش را FAILED می‌کند و سکه‌ای اضافه نمی‌شود", async () => {
    const u = await makeUser(200);
    const { orderId, authority } = await fakeOrder(u.id, 20);
    const res = await coins.verifyCoinOrder("fake", authority, { status: "NOK" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.orderId).toBe(orderId);
    expect((await orderOf(orderId)).status).toBe("FAILED");
    expect(await walletOf(u.id)).toBe(200);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id } })).toBe(0);

    // سفارش ناموفق با بازگشت «موفقِ» بعدی پرداخت‌شده نمی‌شود
    const late = await coins.verifyCoinOrder("fake", authority, { status: "OK" });
    expect(late.ok).toBe(false);
    expect((await orderOf(orderId)).status).toBe("FAILED");
    expect(await walletOf(u.id)).toBe(200);
  });

  it("اطلاعات بازگشت نامعتبر رد می‌شود", async () => {
    const u = await makeUser();
    const { authority } = await fakeOrder(u.id, 20);
    expect((await coins.verifyCoinOrder("fake", "", { status: "OK" })).ok).toBe(false);
    expect((await coins.verifyCoinOrder("fake", "FAKE-unknown", { status: "OK" })).ok).toBe(false);
    expect((await coins.verifyCoinOrder("zarinpal", authority, { status: "OK" })).ok).toBe(false);
    expect((await coins.verifyCoinOrder("manual", authority, { status: "OK" })).ok).toBe(false);
    expect(await coins.boughtOrPendingCoins(u.id)).toEqual({ paid: 0, pending: 20 });
  });

  it("در production بدون اجازهٔ صریح، بازگشت درگاه آزمایشی پذیرفته نمی‌شود", async () => {
    const u = await makeUser(0);
    const { authority } = await fakeOrder(u.id, 20);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENT_FAKE_ALLOWED", "");
    const res = await coins.verifyCoinOrder("fake", authority, { status: "OK" });
    expect(res.ok).toBe(false);
    expect(await walletOf(u.id)).toBe(0);
  });
});

describe("coins.ts: cancelCoinOrder", () => {
  it("فقط صاحب سفارش و فقط سفارش در انتظار لغو می‌شود", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const { orderId, authority } = await fakeOrder(owner.id, 20);

    expect(await coins.cancelCoinOrder(stranger.id, orderId)).toBe(false);
    expect((await orderOf(orderId)).status).toBe("PENDING");

    expect(await coins.cancelCoinOrder(owner.id, orderId)).toBe(true);
    expect((await orderOf(orderId)).status).toBe("CANCELED");
    expect(await coins.cancelCoinOrder(owner.id, orderId)).toBe(false);

    // سفارش لغوشده با بازگشت از درگاه پرداخت‌شده نمی‌شود
    expect((await coins.verifyCoinOrder("fake", authority, { status: "OK" })).ok).toBe(false);
    expect(await walletOf(owner.id)).toBe(200);
  });

  it("سفارش پرداخت‌شده لغو نمی‌شود", async () => {
    const u = await makeUser();
    const { orderId, authority } = await fakeOrder(u.id, 20);
    await coins.verifyCoinOrder("fake", authority, { status: "OK" });
    expect(await coins.cancelCoinOrder(u.id, orderId)).toBe(false);
    expect((await orderOf(orderId)).status).toBe("PAID");
  });
});

describe("coins.ts: درایور manual و ابزار برگزارکننده", () => {
  it("بدون درگاه: سفارش در انتظار تأیید برگزارکننده می‌ماند", async () => {
    vi.stubEnv("PAYMENT_DRIVER", "manual");
    const u = await makeUser(100);
    const res = await coins.createCoinOrder(u.id, 40, CALLBACK_BASE);
    expect(res).toMatchObject({ ok: true, next: { kind: "manual" } });
    if (!res.ok) return;
    expect(await orderOf(res.orderId)).toMatchObject({ gateway: "manual", authority: null, status: "PENDING", amountRial: 400_000 });
    expect(await walletOf(u.id)).toBe(100);
  });

  it("adminMarkOrderPaid سکه‌ها را یک‌بار اضافه می‌کند و تأیید دوباره خطا می‌دهد", async () => {
    vi.stubEnv("PAYMENT_DRIVER", "manual");
    const u = await makeUser(100);
    const res = await coins.createCoinOrder(u.id, 40, CALLBACK_BASE);
    if (!res.ok) throw new Error(res.error);

    expect(await coins.adminMarkOrderPaid(res.orderId, "واریز کارت‌به‌کارت")).toEqual({ ok: true });
    expect(await walletOf(u.id)).toBe(140);
    const order = await orderOf(res.orderId);
    expect(order).toMatchObject({ status: "PAID", note: "واریز کارت‌به‌کارت" });
    expect(order.refId).toMatch(/^MANUAL-/);

    const again = await coins.adminMarkOrderPaid(res.orderId, "دوباره");
    expect(again.ok).toBe(false);
    expect(await walletOf(u.id)).toBe(140);
    expect(await prisma.ledgerEntry.count({ where: { userId: u.id, reason: "COIN_PURCHASE", refId: res.orderId } })).toBe(1);
  });

  it("adminRejectOrder فقط سفارش در انتظار را رد می‌کند", async () => {
    vi.stubEnv("PAYMENT_DRIVER", "manual");
    const u = await makeUser(100);
    const res = await coins.createCoinOrder(u.id, 40, CALLBACK_BASE);
    if (!res.ok) throw new Error(res.error);

    expect(await coins.adminRejectOrder(res.orderId, "رسید نامعتبر")).toEqual({ ok: true });
    expect(await orderOf(res.orderId)).toMatchObject({ status: "FAILED", note: "رسید نامعتبر" });
    expect(await coins.adminRejectOrder(res.orderId, "دوباره")).toEqual({ ok: false });
    expect(await walletOf(u.id)).toBe(100);
  });

  it("سفارش ردشده‌ای که وجهش واقعاً رسیده با تأیید برگزارکننده پرداخت‌شده می‌شود", async () => {
    vi.stubEnv("PAYMENT_DRIVER", "manual");
    const u = await makeUser(0);
    const res = await coins.createCoinOrder(u.id, 25, CALLBACK_BASE);
    if (!res.ok) throw new Error(res.error);
    await coins.adminRejectOrder(res.orderId, "اشتباه");

    expect((await coins.adminMarkOrderPaid(res.orderId, "پیگیری شد")).ok).toBe(true);
    expect((await orderOf(res.orderId)).status).toBe("PAID");
    expect(await walletOf(u.id)).toBe(25);
    // پرداخت‌شده دیگر رد نمی‌شود
    expect((await coins.adminRejectOrder(res.orderId, "x")).ok).toBe(false);
  });

  it("سفارش ناموجود", async () => {
    expect((await coins.adminMarkOrderPaid("no-such-order", "")).ok).toBe(false);
    expect((await coins.adminRejectOrder("no-such-order", "")).ok).toBe(false);
  });

  it("متن راهنمای پرداخت دستی پیش‌فرض دارد و از تنظیمات خوانده می‌شود", async () => {
    expect((await coins.getManualInstructions()).length).toBeGreaterThan(0);
    await prisma.setting.upsert({
      where: { key: coins.MANUAL_INSTRUCTIONS_KEY },
      update: { value: "به کارت ۶۰۳۷ واریز کن" },
      create: { key: coins.MANUAL_INSTRUCTIONS_KEY, value: "به کارت ۶۰۳۷ واریز کن" },
    });
    expect(await coins.getManualInstructions()).toBe("به کارت ۶۰۳۷ واریز کن");
  });
});

describe("prize-pool.ts: صندوق جایزه با فروش سکه بزرگ می‌شود", () => {
  it("فقط مبلغ سفارش‌های پرداخت‌شده (به تومان) به پایهٔ ۲۰۰۰ میلیون اضافه می‌شود", async () => {
    const before = await prizePool.coinSales();
    const cachedBefore = await prizePool.getPrizePoolCached();
    expect(cachedBefore.baseMillion).toBe(2000);
    expect(cachedBefore.totalMillion).toBeCloseTo(2000 + before.toman / 1_000_000, 9);

    const u = await makeUser(0);
    const paid = await fakeOrder(u.id, 100);
    const pending = await fakeOrder(u.id, 50);
    const failed = await fakeOrder(u.id, 30);
    const canceled = await fakeOrder(u.id, 20);
    await coins.verifyCoinOrder("fake", paid.authority, { status: "OK" });
    await coins.verifyCoinOrder("fake", failed.authority, { status: "NOK" });
    await coins.cancelCoinOrder(u.id, canceled.orderId);
    void pending;

    const after = await prizePool.coinSales();
    expect(after.toman - before.toman).toBe(100_000); // ۱۰۰ سکه × ۱۰۰۰ تومان
    expect(after.coins - before.coins).toBe(100);
    expect(after.orders - before.orders).toBe(1);

    const pool = await prizePool.getPrizePool();
    expect(pool.baseMillion).toBe(2000);
    expect(pool.extraMillion).toBeCloseTo(after.toman / 1_000_000, 9);
    expect(pool.totalMillion).toBeCloseTo(2000 + after.toman / 1_000_000, 9);

    // پرداخت تازه کش صندوق را باطل می‌کند
    const cachedAfter = await prizePool.getPrizePoolCached();
    expect(cachedAfter.totalMillion).toBeCloseTo(pool.totalMillion, 9);
    expect(cachedAfter.totalMillion - cachedBefore.totalMillion).toBeCloseTo(0.1, 9);
  });
});
