import { randomInt } from "node:crypto";
import { prisma } from "./db";
import { getPhase, getSetting, getSettingInt } from "./phase";
import { DEFAULTS } from "./constants";
import { fa } from "./persian";
import { notifyTeam, notifyUser } from "./notifications";
import { cached, invalidate } from "./ttl-cache";
import { publishAuctionChange, AUCTION_CACHE_PREFIX } from "./auction-events";
// اقتصاد خالص: nextMinBid و shouldExtendAuction از موتور اقتصاد می‌آیند.
import { nextMinBid, shouldExtendAuction } from "./economy/engine";
import { pickFirstPriceWinner } from "./economy/bids";
import { reservedBuyCoins } from "./reservations";
import { coverUrl } from "./product-utils";
import { log } from "./log";
export { reservedBuyCoins } from "./reservations";

/** ضریب ایمنی: فقط تا این نسبت از زمان باقی‌ماندهٔ فاز صرف حراج‌ها می‌شود (بقیه برای تسویه/تأخیرها). */
const AUCTION_PHASE_FIT_RATIO = 0.85;
/** حداقل مطلق مدت هر حراج، حتی وقتی زمان فاز خیلی کم است. */
const MIN_AUCTION_DURATION_SEC = 60;
/** فاصلهٔ تیک زمان‌بند (instrumentation.ts): تسویه و شروع حراج بعدی تا این مقدار دیرتر رخ می‌دهد. */
export const SCHEDULER_TICK_SEC = 30;
/** پیش‌فرض auction_gap_sec (هم‌سان با زمان‌بند) */
const DEFAULT_AUCTION_GAP_SEC = 60;

/**
 * جابه‌جایی Fisher–Yates با node:crypto.randomInt (تصادفی رمزنگارانه، نه Math.random).
 * آرایهٔ ورودی را درجا به‌هم می‌ریزد و همان را برمی‌گرداند.
 */
export function shuffleOrder<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * مدت هر حراج را طوری کوتاه می‌کند که همهٔ حراج‌های باقی‌مانده در زمان باقی‌ماندهٔ فاز جا شوند.
 * هر حراج در عمل «مدت + سربار» طول می‌کشد؛ سربار = فاصلهٔ بین حراج‌ها (auction_gap_sec) + تأخیر تیک
 * زمان‌بند (۳۰ ثانیه) + تمدید ضدِ لحظهٔ آخر مورد انتظار (anti_snipe_extend_sec):
 *   n × (duration + overhead) ≤ secondsLeftInPhase × ۰٫۸۵
 *   duration = clamp(floor(secondsLeftInPhase × ۰٫۸۵ ÷ n − overhead), ۶۰, configuredDuration)
 * تابعی خالص است (بدون I/O) تا مستقیم قابل تست باشد. overheadPerAuctionSec پیش‌فرض صفر است (رفتار قدیمی).
 */
export function clampAuctionDuration(
  secondsLeftInPhase: number,
  auctionsRemainingIncludingThis: number,
  configuredDuration: number,
  overheadPerAuctionSec = 0
): number {
  if (auctionsRemainingIncludingThis <= 0 || secondsLeftInPhase <= 0) return MIN_AUCTION_DURATION_SEC;
  const perAuction = (secondsLeftInPhase * AUCTION_PHASE_FIT_RATIO) / auctionsRemainingIncludingThis;
  const fitted = Math.floor(perAuction - Math.max(0, overheadPerAuctionSec));
  return Math.min(configuredDuration, Math.max(MIN_AUCTION_DURATION_SEC, fitted));
}

/** سربار هر حراج علاوه بر مدتش (ثانیه): فاصله + تیک زمان‌بند + یک تمدید ضدِ لحظهٔ آخر. */
export function auctionOverheadSec(gapSec: number, antiSnipeExtendSec: number): number {
  return Math.max(0, gapSec) + SCHEDULER_TICK_SEC + Math.max(0, antiSnipeExtendSec);
}

export type EnqueueResult = { ok: true; auctionId: string; position: number } | { ok: false; error: string };

/**
 * تیم (هر عضوی) نسخهٔ ویژهٔ محصولش را در روز بازار به صف حراج زنده می‌فرستد.
 * هر محصول فقط یک‌بار حراج می‌شود؛ ترتیب صف همان ترتیب ثبت است. در دقایق پایانی روز بازار
 * (auction_enqueue_cutoff_min) دیگر محصول تازه‌ای وارد صف نمی‌شود تا صف پیش از پایان تمام شود.
 */
export async function enqueueAuction(userId: string): Promise<EnqueueResult> {
  const { phase, endsAt } = await getPhase();
  if (phase !== "MARKET") return { ok: false, error: "فرستادن به حراج فقط در «روز بازار» ممکن است" };
  if (endsAt) {
    const cutoffMin = await getSettingInt("auction_enqueue_cutoff_min", DEFAULTS.auctionEnqueueCutoffMin);
    if (endsAt.getTime() - Date.now() < cutoffMin * 60_000) {
      return { ok: false, error: `در ${fa(cutoffMin)} دقیقهٔ پایانی روز بازار صف حراج بسته است` };
    }
  }

  const result = await prisma.$transaction(async (tx): Promise<EnqueueResult> => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { teamId: true } });
    if (!user?.teamId) return { ok: false, error: "برای فرستادن محصول به حراج باید عضو یک تیم (یا شرکت‌کنندهٔ فردی) باشی" };
    const product = await tx.product.findUnique({
      where: { teamId: user.teamId },
      select: { id: true, submittedAt: true, auction: { select: { id: true } } },
    });
    if (!product?.submittedAt) return { ok: false, error: "اول محصولت را ثبت نهایی کن" };
    if (product.auction) return { ok: false, error: "محصولت قبلاً به صف حراج رفته است" };

    const last = await tx.auction.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
    const order = last ? last.order + 1 : 0;
    const fresh = await tx.product.findUniqueOrThrow({ where: { id: product.id }, select: { specialStart: true } });
    const auction = await tx.auction.create({
      data: { productId: product.id, order, startPrice: Math.max(1, fresh.specialStart) },
    });
    const position = await tx.auction.count({ where: { status: { in: ["SCHEDULED", "LIVE"] }, order: { lte: order } } });
    return { ok: true, auctionId: auction.id, position };
  });
  if (result.ok) publishAuctionChange();
  return result;
}

/**
 * ابزار برگزارکننده: همهٔ محصولات ثبت‌شده‌ای که هنوز به صف نرفته‌اند را (با ترتیب تصادفی) ته صف می‌گذارد.
 * idempotent است. در جریان عادی تیم‌ها خودشان با enqueueAuction محصول را به صف می‌فرستند.
 */
export async function ensureAuctions() {
  const products = await prisma.product.findMany({
    where: { submittedAt: { not: null }, auction: null },
    orderBy: { submittedAt: "asc" }, // فقط برای پایداری کوئری؛ ترتیب واقعی زیر با shuffleOrder به‌هم می‌ریزد
  });
  if (products.length === 0) return;
  shuffleOrder(products);
  const last = await prisma.auction.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
  const base = last ? last.order + 1 : 0;
  await prisma.$transaction(
    products.map((p, i) =>
      prisma.auction.create({
        data: { productId: p.id, order: base + i, startPrice: Math.max(1, p.specialStart) },
      })
    )
  );
  publishAuctionChange();
}

/**
 * پایان بازی: حراج زنده تسویه و حراج‌های اجرانشدهٔ صف حذف می‌شوند (بدون پیشنهاد هستند).
 * تیم‌هایی که محصولشان در صف مانده بود و نوبتش نرسید با اعلان باخبر می‌شوند (نه حذف بی‌صدا).
 */
export async function closeAuctionsForGameEnd() {
  const live = await prisma.auction.findMany({ where: { status: "LIVE" }, select: { id: true } });
  // در پایان بازی حراج بعدی نباید خودکار شروع شود، حتی اگر فاز هنوز CLOSED ثبت نشده باشد.
  for (const a of live) await settleCore(a.id, { startNext: false, gameEnd: true });
  const leftover = await prisma.auction.findMany({
    where: { status: "SCHEDULED", bids: { none: {} } },
    select: { id: true, product: { select: { teamId: true } } },
  });
  if (leftover.length === 0) return;
  const removed = await prisma.auction.deleteMany({
    where: { id: { in: leftover.map((a) => a.id) }, status: "SCHEDULED", bids: { none: {} } },
  });
  if (removed.count > 0) publishAuctionChange();
  for (const teamId of new Set(leftover.map((a) => a.product.teamId))) {
    await notifyTeam(teamId, {
      kind: "auction_unrun",
      title: "حراج محصولتان برگزار نشد",
      body: "روز بازار پیش از رسیدن نوبت محصول شما در صف حراج تمام شد و حراج آن برگزار نشد.",
      href: "/auction",
    }).catch((e) => console.error("notify leftover auction team failed", e));
  }
}

/**
 * مدت حراج بعدی را با توجه به زمان باقی‌ماندهٔ روز بازار (MARKET) تعیین می‌کند (در صورت نبود endsAt،
 * همان مدت پیکربندی‌شده). عمداً *بیرون* از $transaction فراخوانی می‌شود (مثل خواندن تنظیمات در
 * بقیهٔ این فایل)، چون کوئری با نمونهٔ اصلی prisma داخل یک تراکنش باز ممکن است قفل شود.
 */
async function resolveAuctionDuration(configuredDuration: number): Promise<number> {
  const { phase, endsAt } = await getPhase();
  if (phase !== "MARKET" || !endsAt) return configuredDuration;
  const secondsLeftInPhase = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
  // شامل همین حراجی که قرار است زنده شود، به‌علاوهٔ بقیهٔ صف (SCHEDULED فعلی).
  const [remainingCount, gapSec, extendSec] = await Promise.all([
    prisma.auction.count({ where: { status: "SCHEDULED" } }),
    getSettingInt("auction_gap_sec", DEFAULT_AUCTION_GAP_SEC),
    getSettingInt("anti_snipe_extend_sec", DEFAULTS.antiSnipeExtendSec),
  ]);
  return clampAuctionDuration(secondsLeftInPhase, remainingCount, configuredDuration, auctionOverheadSec(gapSec, extendSec));
}

/**
 * حراج بعدیِ در صف را زنده می‌کند.
 * اگر همین حالا حراجی زنده باشد هیچ کاری نمی‌کند (هم‌زمان فقط یک حراج زنده است).
 */
export async function startNextAuction(durationSec?: number) {
  const configuredDuration = durationSec ?? (await getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec));
  const dur = await resolveAuctionDuration(configuredDuration);
  const started = await prisma.$transaction(async (tx) => {
    const live = await tx.auction.findFirst({ where: { status: "LIVE" } });
    if (live) return null;

    const next = await tx.auction.findFirst({
      where: { status: "SCHEDULED" },
      orderBy: { order: "asc" },
    });
    if (!next) return null;

    const now = new Date();
    const endsAt = new Date(now.getTime() + dur * 1000);
    // نگهبان مسابقه: فقط اگر هنوز SCHEDULED است آن را زنده کن.
    const claimed = await tx.auction.updateMany({
      where: { id: next.id, status: "SCHEDULED" },
      data: { status: "LIVE", startsAt: now, endsAt },
    });
    if (claimed.count === 0) return null;
    return tx.auction.findUnique({ where: { id: next.id } });
  });
  if (started) publishAuctionChange();
  return started;
}

/**
 * هستهٔ تسویه. idempotent است: با `updateMany` روی وضعیت LIVE قفل می‌گیرد،
 * پس دو فراخوانی هم‌زمان فقط یک‌بار برنده را بدهکار می‌کنند.
 *
 * پس از «پایان بازی» (فاز CLOSED) فقط مسیر پایان بازی (closeAuctionsForGameEnd با gameEnd) حق تسویه دارد،
 * و پس از تسویهٔ قطعی هیچ مسیری: خریدِ برنده پس از ثبت نتیجهٔ نهایی در امتیاز نمی‌آمد و نتایج را
 * با دفتر کل ناهمخوان می‌کرد. (مثلاً اگر closeAuctionsForGameEnd شکست خورده باشد، حراج زنده با
 * بازدید صفحه یا کلیک ادمین نباید بعداً تسویه شود.)
 */
async function settleCore(id: string, opts: { startNext?: boolean; gameEnd?: boolean } = {}) {
  const settled = await prisma.$transaction(async (tx) => {
    const gate = await tx.setting.findMany({ where: { key: { in: ["phase", "settled_at", "settled_final"] } } });
    const gateMap = new Map(gate.map((r) => [r.key, r.value]));
    const finalSettled = !!gateMap.get("settled_at") && gateMap.get("settled_final") !== "0";
    if (finalSettled || (gateMap.get("phase") === "CLOSED" && !opts.gameEnd)) {
      log.error("auction_settle_refused_after_game_end", { auctionId: id, phase: gateMap.get("phase") ?? null, finalSettled });
      return false;
    }
    // قفل منطقی: تنها فراخوانی‌ای که count=1 بگیرد حق تسویه دارد.
    const claimed = await tx.auction.updateMany({
      where: { id, status: "LIVE" },
      data: { status: "ENDED" },
    });
    if (claimed.count === 0) return false;

    const auction = await tx.auction.findUnique({ where: { id } });
    if (!auction) return false;

    // همهٔ پیشنهادها به ترتیب اولویت (مبلغ نزولی، در تساوی زودتر)؛ از هر کاربر فقط بالاترین پیشنهادش.
    const bids = await tx.bid.findMany({
      where: { auctionId: id },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });
    if (bids.length === 0) return true; // بدون پیشنهاد: پایان بدون برنده

    const bidderIds = [...new Set(bids.map((b) => b.userId))];
    const users = await tx.user.findMany({ where: { id: { in: bidderIds } }, select: { id: true, buyWallet: true } });
    const walletById = new Map(users.map((u) => [u.id, u.buyWallet]));

    // برنده اولین پیشنهادی است که صاحبش هنوز *کل* مبلغ را دارد و دقیقاً همان را می‌پردازد.
    // پیشنهادِ بدون پشتوانه نامعتبر است و کنار می‌رود — هرگز کمتر از مبلغ پیشنهاد گرفته نمی‌شود.
    const picked = pickFirstPriceWinner(
      bids.map((b) => ({ ...b, bidderId: b.userId })),
      (userId) => walletById.get(userId) ?? null
    );
    if (!picked) return true; // هیچ پیشنهاد معتبری نماند: پایان بدون برنده

    const winner = { id: picked.bid.userId };
    const finalPrice = picked.price;

    // نگهبان: کسر فقط اگر موجودی هنوز کافی است (کیف هرگز منفی نمی‌شود).
    const charged = await tx.user.updateMany({
      where: { id: winner.id, buyWallet: { gte: finalPrice } },
      data: { buyWallet: { decrement: finalPrice } },
    });
    if (charged.count === 0) throw new Error("موجودی برندهٔ حراج در لحظهٔ تسویه تغییر کرد");
    await tx.purchase.create({
      data: { productId: auction.productId, userId: winner.id, amount: finalPrice, discount: 0 },
    });
    await tx.ledgerEntry.create({
      data: { userId: winner.id, wallet: "BUY", delta: -finalPrice, reason: "AUCTION_WIN", refId: auction.id },
    });
    // برد حراج یک خرید است و در «حمایت مردمی» و جمع فروش بازار حساب می‌شود.
    invalidate("scores:");
    invalidate("market:");
    await tx.auction.update({
      where: { id },
      data: { winnerId: winner.id, finalPrice },
    });
    return true;
  });

  if (settled) {
    publishAuctionChange();
    // حراج بعدی را فقط زمان‌بند شروع می‌کند، auction_gap_sec ثانیه پس از همین لحظه
    // (تا بنر «نتیجهٔ حراج قبلی» وقت دیده‌شدن داشته باشد).
    const endedAt = new Date().toISOString();
    await prisma.setting
      .upsert({ where: { key: "last_auction_ended_at" }, update: { value: endedAt }, create: { key: "last_auction_ended_at", value: endedAt } })
      .catch(() => {});
    if (opts.startNext !== true) return settled;
    const { phase } = await getPhase().catch(() => ({ phase: null as string | null }));
    const autoAuction = await getSetting("auto_auction", "1").catch(() => "0");
    if (phase === "MARKET" && autoAuction === "1") {
      await startNextAuction();
    }
  }
  return settled;
}

/** پایان دستیِ یک حراج زنده (برای پنل برگزارکننده)، صرف‌نظر از زمان. */
export async function settleAuction(id: string) {
  return settleCore(id);
}

/** اگر حراج زنده و زمانش تمام شده، پایانش می‌دهد (حراج بعدی را زمان‌بند پس از فاصله شروع می‌کند). */
export async function settleIfEnded(id: string) {
  const auction = await prisma.auction.findUnique({ where: { id } });
  if (!auction || auction.status !== "LIVE" || !auction.endsAt) return false;
  if (Date.now() < auction.endsAt.getTime()) return false;
  return settleCore(id);
}

/** ثبت پیشنهاد روی یک حراج زندهٔ در جریان. */
export async function placeBid(auctionId: string, userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("مبلغ پیشنهاد نامعتبر است");

  const increment = await getSettingInt("bid_increment", DEFAULTS.bidIncrement);
  const antiSnipeWindow = await getSettingInt("anti_snipe_window_sec", DEFAULTS.antiSnipeWindowSec);
  const antiSnipeExtend = await getSettingInt("anti_snipe_extend_sec", DEFAULTS.antiSnipeExtendSec);

  const result = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId }, include: { product: true } });
    if (!auction) throw new Error("حراج پیدا نشد");
    if (auction.status !== "LIVE" || !auction.endsAt) throw new Error("این حراج در حال حاضر زنده نیست");

    const now = Date.now();
    if (now >= auction.endsAt.getTime()) throw new Error("حراج تمام شده است");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.teamId && user.teamId === auction.product.teamId) {
      throw new Error("نمی‌توانی روی نسخهٔ ویژهٔ تیم خودت پیشنهاد بدهی");
    }

    const highest = await tx.bid.findFirst({
      where: { auctionId },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });

    // جلوگیری از ثبت دوبارهٔ همان پیشنهاد (مثلاً دوبار کلیک)؛ بالا بردن پیشنهاد خود مجاز است.
    if (highest && highest.userId === userId && highest.amount === amount) {
      throw new Error("همین حالا بالاترین پیشنهاد با همین مبلغ از توست");
    }

    const min = nextMinBid(highest?.amount ?? null, auction.startPrice, increment);
    if (amount < min) throw new Error(`پیشنهاد باید حداقل ${fa(min)} سکه باشد`);

    // پیشنهاد باید از همان ابتدا معتبر باشد: سقفش موجودی «قابل‌خرج» است، یعنی کیف سکه منهای
    // سکه‌هایی که جای دیگر رزرو شده (پیشتازی در حراج زندهٔ دیگر). پیشتازی در همین حراج کنار
    // گذاشته می‌شود، چون بالا بردن پیشنهاد خود رزرو قبلی خودت را جایگزین می‌کند.
    // سکه‌ها تا پایان حراج برای بالاترین پیشنهاددهنده رزرو می‌مانند (بازار آن‌ها را خرج‌پذیر نمی‌بیند).
    const spendable = user.buyWallet - (await reservedBuyCoins(tx, userId, auctionId));
    if (spendable < amount) throw new Error("سکهٔ قابل‌خرج کافی نداری");

    await tx.bid.create({ data: { auctionId, userId, amount } });

    let endsAt = auction.endsAt;
    if (shouldExtendAuction(now, auction.endsAt.getTime(), antiSnipeWindow)) {
      endsAt = new Date(auction.endsAt.getTime() + antiSnipeExtend * 1000);
      await tx.auction.update({ where: { id: auctionId }, data: { endsAt, extensions: { increment: 1 } } });
    }

    return { ok: true as const, amount, endsAt, outbidUserId: highest && highest.userId !== userId ? highest.userId : null };
  });
  publishAuctionChange();

  if (result.outbidUserId) {
    await notifyUser(result.outbidUserId, {
      kind: "OUTBID",
      title: "پیشنهادت شکسته شد",
      body: "یک پیشنهاد بالاتر روی این حراج ثبت شد.",
      href: "/auction",
    }).catch(() => {});
  }

  return result;
}

/**
 * بودجهٔ پیشنهاد یک کاربر برای یک حراج — دادهٔ خصوصی کاربر؛ هرگز در وضعیت عمومی/کش مشترک حراج قرار نمی‌گیرد.
 * spendable همان سقفی است که placeBid بررسی می‌کند: کیف سکه منهای رزروِ حراج‌های زندهٔ *دیگر*
 * (پیشتازی در همین حراج کنار گذاشته می‌شود، چون بالا بردن پیشنهاد خود جایگزینش می‌کند).
 */
export type BidBudget = { auctionId: string | null; buyWallet: number; reservedElsewhere: number; spendable: number };

export async function getBidBudget(userId: string, auctionId: string | null): Promise<BidBudget | null> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { buyWallet: true } });
    if (!user) return null;
    const reservedElsewhere = await reservedBuyCoins(tx, userId, auctionId ?? undefined);
    return { auctionId, buyWallet: user.buyWallet, reservedElsewhere, spendable: Math.max(0, user.buyWallet - reservedElsewhere) };
  });
}

export type AuctionStateBid = { amount: number; nickname: string; avatarSeed: string; createdAt: string };
export type AuctionState = {
  id: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  startsAt: string | null;
  endsAt: string | null;
  highest: { userId: string; amount: number; nickname: string; avatarSeed: string } | null;
  bids: AuctionStateBid[];
  nextMin: number;
  extensions: number;
  winnerId: string | null;
  winnerNickname: string | null;
  /** تیم برنده (برای بنر «نتیجهٔ حراج قبلی»)؛ برندهٔ بدون تیم null. */
  winnerTeamName: string | null;
  finalPrice: number | null;
  product: {
    id: string;
    name: string;
    specialName: string;
    specialDesc: string;
    cover: string;
    teamName: string;
    teamId: string;
  };
};

/** وضعیت کامل یک حراج برای نمایش/polling. */
export async function getAuctionState(id: string): Promise<AuctionState | null> {
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      product: { include: { team: true } },
      bids: { orderBy: [{ amount: "desc" }, { createdAt: "asc" }], take: 10, include: { user: true } },
    },
  });
  if (!auction) return null;

  // مدل Auction رابطهٔ winner ندارد (فقط winnerId اسکالر)؛ جدا واکشی می‌شود.
  const winnerUser = auction.winnerId
    ? await prisma.user.findUnique({ where: { id: auction.winnerId }, include: { team: { select: { name: true } } } })
    : null;

  const increment = await getSettingInt("bid_increment", DEFAULTS.bidIncrement);
  const highestBid = auction.bids[0] ?? null;
  const images = safeParseImages(auction.product.images);

  return {
    id: auction.id,
    status: auction.status as AuctionState["status"],
    startsAt: auction.startsAt?.toISOString() ?? null,
    endsAt: auction.endsAt?.toISOString() ?? null,
    highest: highestBid
      ? {
          userId: highestBid.userId,
          amount: highestBid.amount,
          nickname: highestBid.user.nickname,
          avatarSeed: highestBid.user.avatarSeed || highestBid.user.id,
        }
      : null,
    bids: auction.bids.map((b) => ({
      amount: b.amount,
      nickname: b.user.nickname,
      avatarSeed: b.user.avatarSeed || b.user.id,
      createdAt: b.createdAt.toISOString(),
    })),
    nextMin: nextMinBid(highestBid?.amount ?? null, auction.startPrice, increment),
    extensions: auction.extensions,
    winnerId: auction.winnerId,
    winnerNickname: winnerUser?.nickname ?? null,
    winnerTeamName: winnerUser?.team?.name ?? null,
    finalPrice: auction.finalPrice,
    product: {
      id: auction.product.id,
      name: auction.product.name,
      specialName: auction.product.specialName || auction.product.name,
      specialDesc: auction.product.specialDesc,
      cover: coverUrl(images, auction.product.id),
      teamName: auction.product.team.name,
      teamId: auction.product.teamId,
    },
  };
}

function safeParseImages(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** فهرست تمام حراج‌ها با اطلاعات محصول، برای صفحهٔ حراج زنده. */
export async function listAuctions() {
  const auctions = await prisma.auction.findMany({
    orderBy: { order: "asc" },
    include: { product: { include: { team: true } } },
  });
  const winnerIds = auctions.map((a) => a.winnerId).filter((id): id is string => !!id);
  const winners = winnerIds.length
    ? await prisma.user.findMany({ where: { id: { in: winnerIds } } })
    : [];
  const winnerById = new Map(winners.map((w) => [w.id, w]));

  return auctions.map((a) => ({
    id: a.id,
    order: a.order,
    status: a.status as "SCHEDULED" | "LIVE" | "ENDED",
    startPrice: a.startPrice,
    finalPrice: a.finalPrice,
    winnerNickname: (a.winnerId && winnerById.get(a.winnerId)?.nickname) ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    product: {
      id: a.product.id,
      name: a.product.name,
      specialName: a.product.specialName || a.product.name,
      teamName: a.product.team.name,
      teamId: a.product.teamId,
    },
  }));
}

/** id حراج زندهٔ فعلی، یا اگر نبود، اولین حراج در صف. */
export async function currentOrNextAuctionId(): Promise<string | null> {
  const live = await prisma.auction.findFirst({ where: { status: "LIVE" }, orderBy: { order: "asc" } });
  if (live) return live.id;
  const next = await prisma.auction.findFirst({ where: { status: "SCHEDULED" }, orderBy: { order: "asc" } });
  return next?.id ?? null;
}

/** TTL کش عمومی حراج؛ هر نوشتن در این فایل با publishAuctionChange آن را باطل می‌کند. */
const PUBLIC_TTL_MS = 1000;

/** id حراج زنده/بعدی با کش کوتاه‌مدت مشترک (دادهٔ عمومی). */
export function getLiveAuctionIdCached(): Promise<string | null> {
  return cached(`${AUCTION_CACHE_PREFIX}live`, PUBLIC_TTL_MS, currentOrNextAuctionId);
}

/**
 * وضعیت عمومی یک حراج با کش کوتاه‌مدت مشترک. اگر حراج زنده و زمانش گذشته باشد،
 * همین‌جا تسویه می‌شود (به‌جای یک کوئری settleIfEnded برای هر درخواست).
 * شامل هیچ دادهٔ مخصوص کاربر نیست؛ پس کلید مشترک امن است.
 */
export async function getPublicAuctionState(id: string): Promise<AuctionState | null> {
  const key = `${AUCTION_CACHE_PREFIX}state:${id}`;
  const state = await cached(key, PUBLIC_TTL_MS, () => getAuctionState(id));
  if (state?.status === "LIVE" && state.endsAt && Date.now() >= new Date(state.endsAt).getTime()) {
    // settleCore خودش publishAuctionChange را صدا می‌زند و کش را باطل می‌کند.
    const settled = await settleIfEnded(id).catch(() => false);
    if (settled) return cached(key, PUBLIC_TTL_MS, () => getAuctionState(id));
  }
  return state;
}
