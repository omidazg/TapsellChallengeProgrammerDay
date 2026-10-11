/**
 * خرید سکه با پول — هر سکه هزار تومان (ده هزار ریال).
 *
 * جریان: کاربر تعداد سکه را انتخاب می‌کند → CoinOrder با وضعیت PENDING ساخته می‌شود → درایور پرداخت
 * (درگاه) کاربر را به صفحهٔ پرداخت می‌برد → بازگشت از درگاه (/coins/callback) سفارش را تأیید می‌کند →
 * سکه‌ها یک‌بار (idempotent) به کیف کاربر اضافه و در دفتر کل با دلیل COIN_PURCHASE ثبت می‌شوند.
 *
 * درایورها (متغیر محیطی PAYMENT_DRIVER):
 *   fake   — درگاه آزمایشی برای توسعه/تست (در production فقط با PAYMENT_FAKE_ALLOWED=1)
 *   manual — بدون درگاه: سفارش ثبت می‌شود و برگزارکننده پس از دریافت وجه از /admin/coins تأییدش می‌کند
 * درگاه واقعی (مثلاً زرین‌پال/پی‌پینگ) با پیاده‌سازی همین رابط PaymentDriver اضافه می‌شود.
 *
 * کل مبلغ سفارش‌های پرداخت‌شده به صندوق جایزه اضافه می‌شود (./prize-pool.ts).
 */
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { COIN_PRICE_RIAL, DEFAULTS } from "./constants";
import { getPhase, getSetting, getSettingInt } from "./phase";
import { fa } from "./persian";
import { invalidate } from "./ttl-cache";
import { notifyUser } from "./notifications";

export const PRIZE_POOL_CACHE_PREFIX = "prizepool:";

export type CoinOrderStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED";

export function coinsToRial(coins: number): number {
  return coins * COIN_PRICE_RIAL;
}

export function coinsToToman(coins: number): number {
  return coinsToRial(coins) / 10;
}

// ---------- درایورهای پرداخت ----------

export type StartPaymentResult =
  /** کاربر باید به این آدرس برود (درگاه) */
  | { kind: "redirect"; url: string; authority: string }
  /** درگاهی در کار نیست؛ سفارش منتظر تأیید برگزارکننده می‌ماند */
  | { kind: "manual" };

export type VerifyPaymentResult = { ok: true; refId: string } | { ok: false; error: string };

export interface PaymentDriver {
  name: string;
  /** آیا پس از ثبت سفارش، کاربر به درگاه هدایت می‌شود؟ */
  online: boolean;
  start(order: { id: string; amountRial: number; coins: number }, callbackUrl: string): Promise<StartPaymentResult>;
  /** تأیید پرداخت پس از بازگشت از درگاه؛ params همان query string بازگشتی است. */
  verify(order: { id: string; amountRial: number; authority: string | null }, params: Record<string, string>): Promise<VerifyPaymentResult>;
}

const fakeDriver: PaymentDriver = {
  name: "fake",
  online: true,
  async start(order) {
    const authority = `FAKE-${order.id}-${randomBytes(6).toString("hex")}`;
    return { kind: "redirect", url: `/coins/fake-gateway?authority=${encodeURIComponent(authority)}`, authority };
  },
  async verify(_order, params) {
    if (params.status === "OK") return { ok: true, refId: `FAKE-${Date.now().toString(36)}` };
    return { ok: false, error: "پرداخت لغو شد" };
  },
};

const manualDriver: PaymentDriver = {
  name: "manual",
  online: false,
  async start() {
    return { kind: "manual" };
  },
  async verify() {
    return { ok: false, error: "این سفارش با تأیید برگزارکننده پرداخت می‌شود" };
  },
};

export function fakePaymentAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PAYMENT_FAKE_ALLOWED === "1";
}

/** درایور پرداخت فعال. درگاه آزمایشی هرگز بی‌اجازهٔ صریح در production فعال نمی‌شود. */
export function getPaymentDriver(): PaymentDriver {
  const wanted = (process.env.PAYMENT_DRIVER ?? "").trim().toLowerCase();
  if (wanted === "manual") return manualDriver;
  if (wanted === "fake") return fakePaymentAllowed() ? fakeDriver : manualDriver;
  return process.env.NODE_ENV === "production" ? manualDriver : fakeDriver;
}

function driverByName(name: string): PaymentDriver | null {
  if (name === "fake") return fakePaymentAllowed() ? fakeDriver : null;
  if (name === "manual") return manualDriver;
  return null;
}

// ---------- سفارش ----------

/** سکه‌هایی که کاربر خریده یا در انتظار پرداخت دارد (برای سقف خرید هر نفر) */
export async function boughtOrPendingCoins(
  userId: string,
  db: Pick<typeof prisma, "coinOrder"> = prisma
): Promise<{ paid: number; pending: number }> {
  const groups = await db.coinOrder.groupBy({
    by: ["status"],
    where: { userId, status: { in: ["PAID", "PENDING"] } },
    _sum: { coins: true },
  });
  const sumOf = (s: CoinOrderStatus) => groups.find((g) => g.status === s)?._sum.coins ?? 0;
  return { paid: sumOf("PAID"), pending: sumOf("PENDING") };
}

export type CreateOrderResult =
  | { ok: true; orderId: string; next: StartPaymentResult }
  | { ok: false; error: string };

/**
 * ثبت سفارش خرید سکه و شروع پرداخت. سقف: max_bought_coins_per_user (پرداخت‌شده + در انتظار).
 * callbackBase آدرس پایهٔ سایت است (برای بازگشت از درگاه).
 */
export async function createCoinOrder(userId: string, coinsWanted: number, callbackBase: string): Promise<CreateOrderResult> {
  const coins = Math.round(Number(coinsWanted));
  const minCoins = DEFAULTS.minCoinPurchase;
  if (!Number.isFinite(coins) || coins < minCoins) return { ok: false, error: `حداقل خرید ${fa(minCoins)} سکه است` };

  const { phase } = await getPhase();
  if (phase === "CLOSED") return { ok: false, error: "بازی تمام شده و خرید سکه بسته است" };

  const maxPerUser = await getSettingInt("max_bought_coins_per_user", DEFAULTS.maxBoughtCoinsPerUser);
  const driver = getPaymentDriver();
  // بررسی سقف و ساخت سفارش در یک تراکنش: درخواست‌های هم‌زمان نباید هر دو از یک «جای خالی» رد شوند.
  const created = await prisma.$transaction(async (tx) => {
    const { paid, pending } = await boughtOrPendingCoins(userId, tx);
    const room = Math.max(0, maxPerUser - paid - pending);
    if (coins > room) {
      return {
        error:
          room === 0
            ? `به سقف خرید سکه (${fa(maxPerUser)} سکه) رسیده‌ای${pending > 0 ? "؛ سفارش‌های در انتظار را تکمیل یا لغو کن" : ""}`
            : `حداکثر ${fa(room)} سکهٔ دیگر می‌توانی بخری`,
      };
    }
    return {
      order: await tx.coinOrder.create({
        data: { userId, coins, amountRial: coinsToRial(coins), gateway: driver.name },
      }),
    };
  });
  if (!created.order) return { ok: false, error: created.error };
  const { order } = created;
  try {
    const next = await driver.start(
      { id: order.id, amountRial: order.amountRial, coins },
      `${callbackBase.replace(/\/$/, "")}/coins/callback?gateway=${driver.name}`
    );
    if (next.kind === "redirect") {
      await prisma.coinOrder.update({ where: { id: order.id }, data: { authority: next.authority } });
    }
    return { ok: true, orderId: order.id, next };
  } catch (e) {
    console.error("payment start failed", e);
    await prisma.coinOrder.update({ where: { id: order.id }, data: { status: "FAILED", note: "خطا در اتصال به درگاه" } });
    return { ok: false, error: "اتصال به درگاه پرداخت ممکن نشد؛ کمی بعد دوباره تلاش کن" };
  }
}

/**
 * پرداخت‌شده کردن سفارش و افزودن سکه‌ها — idempotent: فقط گذر PENDING→PAID سکه اضافه می‌کند.
 * true یعنی همین فراخوانی سکه‌ها را اضافه کرد.
 */
async function markPaidAndCredit(orderId: string, refId: string, note?: string): Promise<boolean> {
  const credited = await prisma.$transaction(async (tx) => {
    const claimed = await tx.coinOrder.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: "PAID", refId, paidAt: new Date(), ...(note !== undefined ? { note } : {}) },
    });
    if (claimed.count === 0) return null;
    const order = await tx.coinOrder.findUniqueOrThrow({ where: { id: orderId } });
    await tx.user.update({ where: { id: order.userId }, data: { buyWallet: { increment: order.coins } } });
    await tx.ledgerEntry.create({
      data: { userId: order.userId, wallet: "BUY", delta: order.coins, reason: "COIN_PURCHASE", refId: order.id },
    });
    return order;
  });
  if (!credited) return false;
  invalidate(PRIZE_POOL_CACHE_PREFIX);
  await notifyUser(credited.userId, {
    kind: "coins",
    title: "سکه‌هایت اضافه شد",
    body: `${fa(credited.coins)} سکه به کیفت اضافه شد.`,
    href: "/wallet",
  }).catch(() => {});
  return true;
}

export type VerifyResult =
  | { ok: true; orderId: string; coins: number; alreadyPaid: boolean }
  | { ok: false; error: string; orderId?: string };

/** بازگشت از درگاه: سفارش با (gateway, authority) پیدا و تأیید می‌شود. */
export async function verifyCoinOrder(gateway: string, authority: string, params: Record<string, string>): Promise<VerifyResult> {
  const driver = driverByName(gateway);
  if (!driver || !authority) return { ok: false, error: "اطلاعات بازگشت از درگاه نامعتبر است" };
  const order = await prisma.coinOrder.findUnique({ where: { gateway_authority: { gateway, authority } } });
  if (!order) return { ok: false, error: "سفارش پیدا نشد" };
  if (order.status === "PAID") return { ok: true, orderId: order.id, coins: order.coins, alreadyPaid: true };
  if (order.status !== "PENDING") return { ok: false, error: "این سفارش دیگر قابل پرداخت نیست", orderId: order.id };

  const result = await driver.verify(order, params);
  if (!result.ok) {
    await prisma.coinOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED", note: result.error } });
    return { ok: false, error: result.error, orderId: order.id };
  }
  const credited = await markPaidAndCredit(order.id, result.refId);
  return { ok: true, orderId: order.id, coins: order.coins, alreadyPaid: !credited };
}

/** لغو سفارش در انتظار توسط خود کاربر */
export async function cancelCoinOrder(userId: string, orderId: string): Promise<boolean> {
  const res = await prisma.coinOrder.updateMany({
    where: { id: orderId, userId, status: "PENDING" },
    data: { status: "CANCELED" },
  });
  return res.count > 0;
}

// ---------- ابزار برگزارکننده ----------

/** تأیید دستی پرداخت (درایور manual یا پیگیری پرداخت‌های مشکل‌دار درگاه) */
export async function adminMarkOrderPaid(orderId: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.coinOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "سفارش پیدا نشد" };
  if (order.status === "PAID") return { ok: false, error: "این سفارش قبلاً پرداخت‌شده است" };
  if (order.status !== "PENDING") {
    // سفارش ناموفق/لغوشده‌ای که وجهش واقعاً رسیده: اول به PENDING برمی‌گردد تا مسیر idempotent اعتبار بگیرد.
    // سفارش ناموفق/لغوشده در سقف خرید حساب نمی‌شد، پس بازکردنش باید دوباره سقف هر نفر را رعایت کند
    // (بررسی و بازکردن در یک تراکنش، مثل createCoinOrder، تا سفارش هم‌زمان از همان «جای خالی» رد نشود).
    const maxPerUser = await getSettingInt("max_bought_coins_per_user", DEFAULTS.maxBoughtCoinsPerUser);
    const reopenError = await prisma.$transaction(async (tx) => {
      const { paid, pending } = await boughtOrPendingCoins(order.userId, tx);
      const room = Math.max(0, maxPerUser - paid - pending);
      if (order.coins > room) {
        return `تأیید این سفارش سقف خرید سکهٔ این کاربر (${fa(maxPerUser)} سکه) را رد می‌کند؛ جای خالی فقط ${fa(room)} سکه است. سفارش‌های در انتظار او را رد کن یا وجه را برگردان.`;
      }
      const reopened = await tx.coinOrder.updateMany({ where: { id: orderId, status: order.status }, data: { status: "PENDING" } });
      return reopened.count === 0 ? "سفارش همین حالا تغییر کرد" : null;
    });
    if (reopenError) return { ok: false, error: reopenError };
  }
  const credited = await markPaidAndCredit(orderId, order.refId ?? `MANUAL-${Date.now().toString(36)}`, note.slice(0, 300));
  return credited ? { ok: true } : { ok: false, error: "سفارش همین حالا تغییر کرد" };
}

export async function adminRejectOrder(orderId: string, note: string): Promise<{ ok: boolean }> {
  const res = await prisma.coinOrder.updateMany({
    where: { id: orderId, status: "PENDING" },
    data: { status: "FAILED", note: note.slice(0, 300) },
  });
  return { ok: res.count > 0 };
}

/** متن راهنمای پرداخت دستی (شمارهٔ کارت/حساب و نحوهٔ ارسال رسید) که برگزارکننده تنظیم می‌کند */
export const MANUAL_INSTRUCTIONS_KEY = "coin_manual_instructions";

export async function getManualInstructions(): Promise<string> {
  return getSetting(
    MANUAL_INSTRUCTIONS_KEY,
    "شمارهٔ کارت و نحوهٔ ارسال رسید را از برگزارکننده بپرس. پس از دریافت وجه، سکه‌ها به کیفت اضافه می‌شوند."
  );
}
