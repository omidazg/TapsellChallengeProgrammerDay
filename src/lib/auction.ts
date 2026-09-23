import { randomInt } from "node:crypto";
import { prisma } from "./db";
import { getPhase, getSettingInt } from "./phase";
import { DEFAULTS } from "./constants";
import { fa } from "./persian";
import { notifyUser } from "./notifications";
import { cached } from "./ttl-cache";
import { publishAuctionChange, AUCTION_CACHE_PREFIX } from "./auction-events";
// اقتصاد خالص: nextMinBid و shouldExtendAuction از موتور اقتصاد می‌آیند.
import { nextMinBid, shouldExtendAuction } from "./economy/engine";

/** تمدید قدرت «نفس دوم» بر حسب ثانیه. */
const SECOND_WIND_EXTEND_SEC = 120;

/** ضریب ایمنی: فقط تا این نسبت از زمان باقی‌ماندهٔ فاز صرف حراج‌ها می‌شود (بقیه برای تسویه/تأخیرها). */
const AUCTION_PHASE_FIT_RATIO = 0.85;
/** حداقل مطلق مدت هر حراج، حتی وقتی زمان فاز خیلی کم است. */
const MIN_AUCTION_DURATION_SEC = 60;

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
 * مدت هر حراج را طوری کوتاه می‌کند که همهٔ حراج‌های باقی‌مانده در زمان باقی‌ماندهٔ فاز جا شوند:
 * duration = clamp(floor(secondsLeftInPhase × ۰٫۸۵ ÷ auctionsRemainingIncludingThis), ۶۰, configuredDuration).
 * تابعی خالص است (بدون I/O) تا مستقیم قابل تست باشد.
 */
export function clampAuctionDuration(
  secondsLeftInPhase: number,
  auctionsRemainingIncludingThis: number,
  configuredDuration: number
): number {
  if (auctionsRemainingIncludingThis <= 0 || secondsLeftInPhase <= 0) return MIN_AUCTION_DURATION_SEC;
  const fitted = Math.floor((secondsLeftInPhase * AUCTION_PHASE_FIT_RATIO) / auctionsRemainingIncludingThis);
  return Math.min(configuredDuration, Math.max(MIN_AUCTION_DURATION_SEC, fitted));
}

/** یک حراج به ازای هر محصول ثبت‌شده می‌سازد (idempotent)؛ ترتیب صف هر بار به‌طور تصادفی چیده می‌شود
 *  تا تیم‌هایی که زود ثبت کرده‌اند همیشه آخر صف (و با کیف خرج‌شدهٔ همه) نمانند. */
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
        data: { productId: p.id, order: base + i, startPrice: p.specialStart },
      })
    )
  );
  publishAuctionChange();
}

/**
 * مدت حراج بعدی را با توجه به زمان باقی‌ماندهٔ فاز AUCTION تعیین می‌کند (در صورت نبود endsAt،
 * همان مدت پیکربندی‌شده). عمداً *بیرون* از $transaction فراخوانی می‌شود (مثل خواندن تنظیمات در
 * بقیهٔ این فایل)، چون کوئری با نمونهٔ اصلی prisma داخل یک تراکنش باز ممکن است قفل شود.
 */
async function resolveAuctionDuration(configuredDuration: number): Promise<number> {
  const { phase, endsAt } = await getPhase();
  if (phase !== "AUCTION" || !endsAt) return configuredDuration;
  const secondsLeftInPhase = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));
  // شامل همین حراجی که قرار است زنده شود، به‌علاوهٔ بقیهٔ صف (SCHEDULED فعلی).
  const remainingCount = await prisma.auction.count({ where: { status: "SCHEDULED" } });
  return clampAuctionDuration(secondsLeftInPhase, remainingCount, configuredDuration);
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
 */
async function settleCore(id: string) {
  const settled = await prisma.$transaction(async (tx) => {
    // قفل منطقی: تنها فراخوانی‌ای که count=1 بگیرد حق تسویه دارد.
    const claimed = await tx.auction.updateMany({
      where: { id, status: "LIVE" },
      data: { status: "ENDED" },
    });
    if (claimed.count === 0) return false;

    const auction = await tx.auction.findUnique({ where: { id } });
    if (!auction) return false;

    // بالاترین پیشنهاد؛ در تساوی، پیشنهاد زودتر برنده است.
    const highest = await tx.bid.findFirst({
      where: { auctionId: id },
      orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
    });
    if (!highest) return true; // بدون پیشنهاد: پایان بدون برنده

    const winner = await tx.user.findUnique({ where: { id: highest.userId } });
    if (!winner) return true;

    // سکه‌ها در زمان پیشنهاد بلوکه نمی‌شوند؛ پس در لحظهٔ تسویه ممکن است
    // موجودی کمتر از مبلغ برنده باشد (مثلاً خرید هم‌زمان در بازار).
    // در این حالت قیمت نهایی به موجودی موجود محدود می‌شود تا کیف منفی نشود.
    const finalPrice = Math.max(0, Math.min(winner.buyWallet, highest.amount));

    if (finalPrice > 0) {
      await tx.user.update({ where: { id: winner.id }, data: { buyWallet: { decrement: finalPrice } } });
    }
    await tx.purchase.create({
      data: { productId: auction.productId, userId: winner.id, amount: finalPrice, discount: 0 },
    });
    await tx.ledgerEntry.create({
      data: { userId: winner.id, wallet: "BUY", delta: -finalPrice, reason: "AUCTION_WIN", refId: auction.id },
    });
    await tx.auction.update({
      where: { id },
      data: { winnerId: winner.id, finalPrice },
    });
    return true;
  });

  if (settled) {
    publishAuctionChange();
    const { phase } = await getPhase().catch(() => ({ phase: null as string | null }));
    if (phase === "AUCTION") {
      await startNextAuction();
    }
  }
  return settled;
}

/** پایان دستیِ یک حراج زنده (برای پنل برگزارکننده)، صرف‌نظر از زمان. */
export async function settleAuction(id: string) {
  return settleCore(id);
}

/** اگر حراج زنده و زمانش تمام شده، پایانش می‌دهد و بعدی را شروع می‌کند. */
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

    // سکه بلوکه نمی‌شود؛ فقط کفایت موجودی در لحظهٔ پیشنهاد بررسی می‌شود.
    if (user.buyWallet < amount) throw new Error("موجودی کیف خرید کافی نیست");

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

/** قدرت «نفس دوم»: دو دقیقه تمدید یک حراج زنده، یک‌بار در کل بازی برای هر کاربر. */
export async function activateSecondWind(auctionId: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== "LIVE" || !auction.endsAt) throw new Error("این حراج زنده نیست");
    if (Date.now() >= auction.endsAt.getTime()) throw new Error("حراج تمام شده است");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.power !== "SECOND_WIND") throw new Error("این قدرت را نداری");
    if (user.powerUsed) throw new Error("قدرتت قبلاً استفاده شده است");

    // نگهبان مسابقه: قدرت فقط یک‌بار مصرف می‌شود.
    const used = await tx.user.updateMany({ where: { id: userId, powerUsed: false }, data: { powerUsed: true } });
    if (used.count === 0) throw new Error("قدرتت قبلاً استفاده شده است");

    const endsAt = new Date(auction.endsAt.getTime() + SECOND_WIND_EXTEND_SEC * 1000);
    await tx.auction.update({ where: { id: auctionId }, data: { endsAt, extensions: { increment: 1 } } });
    return { ok: true as const, endsAt };
  });
  publishAuctionChange();
  return result;
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
  const winnerUser = auction.winnerId ? await prisma.user.findUnique({ where: { id: auction.winnerId } }) : null;

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
    finalPrice: auction.finalPrice,
    product: {
      id: auction.product.id,
      name: auction.product.name,
      specialName: auction.product.specialName || auction.product.name,
      specialDesc: auction.product.specialDesc,
      cover: images[0] ?? `https://picsum.photos/seed/${auction.product.id}/800/500`,
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
    product: { id: a.product.id, name: a.product.name, specialName: a.product.specialName || a.product.name, teamName: a.product.team.name },
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
