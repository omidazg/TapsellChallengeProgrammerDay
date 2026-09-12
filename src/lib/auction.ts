import { prisma } from "./db";
import { getSettingInt } from "./phase";
import { DEFAULTS } from "./constants";
// اقتصاد خالص: nextMinBid و shouldExtendAuction از موتور اقتصاد می‌آیند.
// TODO: replace with engine — اگر این export ها هنگام tsc موجود نبودند، از fallback زیر استفاده کنید.
import * as engineImpl from "./economy/engine";
const nextMinBid: (currentHighest: number | null, startPrice: number, increment: number) => number =
  engineImpl.nextMinBid ?? ((currentHighest, startPrice, increment) => (currentHighest === null ? startPrice : currentHighest + increment));
const shouldExtendAuction: (nowMs: number, endsAtMs: number, windowSec: number) => boolean =
  engineImpl.shouldExtendAuction ??
  ((nowMs, endsAtMs, windowSec) => {
    const remaining = endsAtMs - nowMs;
    return remaining <= windowSec * 1000 && remaining >= 0;
  });

/** یک حراج به ازای هر محصول ثبت‌شده می‌سازد (idempotent)، به ترتیب زمان ثبت. */
export async function ensureAuctions() {
  const products = await prisma.product.findMany({
    where: { submittedAt: { not: null }, auction: null },
    orderBy: { submittedAt: "asc" },
  });
  if (products.length === 0) return;
  const existingCount = await prisma.auction.count();
  await prisma.$transaction(
    products.map((p, i) =>
      prisma.auction.create({
        data: { productId: p.id, order: existingCount + i, startPrice: p.specialStart },
      })
    )
  );
}

/** حراج بعدیِ در صف را زنده می‌کند. */
export async function startNextAuction(durationSec?: number) {
  const dur = durationSec ?? (await getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec));
  const next = await prisma.auction.findFirst({
    where: { status: "SCHEDULED" },
    orderBy: { order: "asc" },
  });
  if (!next) return null;
  const now = new Date();
  const endsAt = new Date(now.getTime() + dur * 1000);
  return prisma.auction.update({
    where: { id: next.id },
    data: { status: "LIVE", startsAt: now, endsAt },
  });
}

async function settleCore(id: string) {
  const settled = await prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id } });
    if (!auction || auction.status !== "LIVE") return false;
    const highest = await tx.bid.findFirst({ where: { auctionId: id }, orderBy: { amount: "desc" } });
    if (highest) {
      const winner = await tx.user.findUnique({ where: { id: highest.userId } });
      if (winner) {
        await tx.user.update({ where: { id: winner.id }, data: { buyWallet: { decrement: highest.amount } } });
        await tx.purchase.create({
          data: { productId: auction.productId, userId: winner.id, amount: highest.amount, discount: 0 },
        });
        await tx.ledgerEntry.create({
          data: { userId: winner.id, wallet: "BUY", delta: -highest.amount, reason: "PURCHASE", refId: auction.id },
        });
      }
    }
    await tx.auction.update({
      where: { id },
      data: { status: "ENDED", winnerId: highest?.userId ?? null, finalPrice: highest?.amount ?? null },
    });
    return true;
  });

  if (settled) {
    const { getPhase } = await import("./phase");
    const { phase } = await getPhase().catch(() => ({ phase: null }));
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
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId }, include: { product: true } });
    if (!auction) throw new Error("حراج پیدا نشد");
    if (auction.status !== "LIVE" || !auction.endsAt) throw new Error("این حراج در حال حاضر زنده نیست");
    if (Date.now() > auction.endsAt.getTime()) throw new Error("زمان این حراج تمام شده است");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.teamId === auction.product.teamId) {
      throw new Error("نمی‌توانی روی نسخهٔ ویژهٔ تیم خودت پیشنهاد بدهی");
    }
    if (user.buyWallet < amount) throw new Error("موجودی کیف خرید کافی نیست");

    const increment = await getSettingInt("bid_increment", DEFAULTS.bidIncrement);
    const highest = await tx.bid.findFirst({ where: { auctionId }, orderBy: { amount: "desc" } });
    const min = nextMinBid(highest?.amount ?? null, auction.startPrice, increment);
    if (amount < min) throw new Error(`پیشنهاد باید حداقل ${min} سکه باشد`);

    await tx.bid.create({ data: { auctionId, userId, amount } });

    const antiSnipeWindow = await getSettingInt("anti_snipe_window_sec", DEFAULTS.antiSnipeWindowSec);
    const antiSnipeExtend = await getSettingInt("anti_snipe_extend_sec", DEFAULTS.antiSnipeExtendSec);
    const now = Date.now();
    let endsAt = auction.endsAt;
    if (shouldExtendAuction(now, auction.endsAt.getTime(), antiSnipeWindow)) {
      endsAt = new Date(auction.endsAt.getTime() + antiSnipeExtend * 1000);
      await tx.auction.update({ where: { id: auctionId }, data: { endsAt, extensions: { increment: 1 } } });
    }

    return { ok: true, endsAt };
  });
}

/** قدرت «نفس دوم»: دو دقیقه تمدید یک حراج زنده، یک‌بار در کل بازی برای هر کاربر. */
export async function activateSecondWind(auctionId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.power !== "SECOND_WIND") throw new Error("این قدرت را نداری");
    if (user.powerUsed) throw new Error("قدرتت قبلاً استفاده شده است");

    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== "LIVE" || !auction.endsAt) throw new Error("این حراج زنده نیست");

    const endsAt = new Date(auction.endsAt.getTime() + 120 * 1000);
    await tx.auction.update({ where: { id: auctionId }, data: { endsAt, extensions: { increment: 1 } } });
    await tx.user.update({ where: { id: userId }, data: { powerUsed: true } });
    return { ok: true, endsAt };
  });
}

export type AuctionStateBid = { amount: number; nickname: string; avatarSeed: string; createdAt: string };
export type AuctionState = {
  id: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  startsAt: string | null;
  endsAt: string | null;
  highest: { amount: number; nickname: string; avatarSeed: string } | null;
  bids: AuctionStateBid[];
  nextMin: number;
  extensions: number;
  winnerNickname: string | null;
  finalPrice: number | null;
  product: {
    id: string;
    name: string;
    specialName: string;
    specialDesc: string;
    cover: string;
    teamName: string;
  };
};

/** وضعیت کامل یک حراج برای نمایش/polling. */
export async function getAuctionState(id: string): Promise<AuctionState | null> {
  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      product: { include: { team: true } },
      bids: { orderBy: { amount: "desc" }, take: 10, include: { user: true } },
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
    highest: highestBid ? { amount: highestBid.amount, nickname: highestBid.user.nickname, avatarSeed: highestBid.user.avatarSeed || highestBid.user.id } : null,
    bids: auction.bids.map((b) => ({ amount: b.amount, nickname: b.user.nickname, avatarSeed: b.user.avatarSeed || b.user.id, createdAt: b.createdAt.toISOString() })),
    nextMin: nextMinBid(highestBid?.amount ?? null, auction.startPrice, increment),
    extensions: auction.extensions,
    winnerNickname: winnerUser?.nickname ?? null,
    finalPrice: auction.finalPrice,
    product: {
      id: auction.product.id,
      name: auction.product.name,
      specialName: auction.product.specialName || auction.product.name,
      specialDesc: auction.product.specialDesc,
      cover: images[0] ?? `https://picsum.photos/seed/${auction.product.id}/800/500`,
      teamName: auction.product.team.name,
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
