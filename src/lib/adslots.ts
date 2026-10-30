import { prisma } from "./db";
import { getPhase, getSetting, getSettingInt } from "./phase";
import { moduleGate } from "./module-state";
import { AD_SLOT_KINDS, DEFAULTS } from "./constants";
import { reservedBuyCoins } from "./reservations";
import { notifyAll, notifyTeam } from "./notifications";
import { fa } from "./persian";

export type AdSlotKind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as AdSlotKind[];
const HOUR_MS = 60 * 60 * 1000;

/** طول هر بازهٔ جایگاه (ms) از تنظیمات */
async function slotDurationMs(): Promise<number> {
  const hours = await getSettingInt("adslot_hours", DEFAULTS.adslotHours);
  return Math.max(1, hours) * HOUR_MS;
}

/**
 * زمان شروع نخستین بازه: از تنظیمات (`market_starts_at`)؛ وگرنه شروع اولین جایگاه موجود
 * (تا با عوض شدن روز، هر روز یک سری جایگاه تازه ساخته نشود)؛ وگرنه فردا ساعت صفر.
 */
export async function marketStartFromSettings(): Promise<Date> {
  const raw = await getSetting("market_starts_at", "");
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const first = await prisma.adSlot.findFirst({ orderBy: { hourStart: "asc" }, select: { hourStart: true } });
  if (first) return first.hourStart;
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** برای هر نوع جایگاه و هر بازه تا ددلاین نهایی یک AdSlot می‌سازد (idempotent). */
export async function ensureAdSlots(start?: Date) {
  const from = start ?? (await marketStartFromSettings());
  const duration = await slotDurationMs();
  const { endsAt } = await getPhase();
  const until = endsAt ? endsAt.getTime() : from.getTime() + DEFAULTS.contestDays * 24 * HOUR_MS;

  const wanted: { kind: AdSlotKind; hourStart: Date }[] = [];
  for (let t = from.getTime(); t < until; t += duration) {
    for (const kind of KINDS) wanted.push({ kind, hourStart: new Date(t) });
  }
  if (wanted.length === 0) return;
  // AdSlot روی (kind, hourStart) یکتاست، اما SQLite در Prisma 7 از skipDuplicates
  // پشتیبانی نمی‌کند؛ پس موجودها را می‌خوانیم و فقط کمبودها را می‌سازیم (idempotent).
  const existing = await prisma.adSlot.findMany({
    where: { hourStart: { in: wanted.map((w) => w.hourStart) } },
    select: { kind: true, hourStart: true },
  });
  const existingKey = new Set(existing.map((e) => `${e.kind}|${e.hourStart.toISOString()}`));
  const toCreate = wanted.filter((w) => !existingKey.has(`${w.kind}|${w.hourStart.toISOString()}`));
  if (toCreate.length === 0) return;
  await prisma.$transaction(
    toCreate.map((w) => prisma.adSlot.create({ data: { kind: w.kind, hourStart: w.hourStart } }))
  );
}

/** کمترین پیشنهاد هر نوع جایگاه (سکه) از تنظیمات. */
export async function adSlotPrices(): Promise<Record<AdSlotKind, number>> {
  const [banner, featured, push] = await Promise.all([
    getSettingInt("adslot_price_banner", DEFAULTS.adslotPriceBanner),
    getSettingInt("adslot_price_featured", DEFAULTS.adslotPriceFeatured),
    getSettingInt("adslot_price_push", DEFAULTS.adslotPricePush),
  ]);
  return { BANNER: banner, FEATURED: featured, PUSH: push };
}

/** کمترین پیشنهاد مجاز بعدی برای یک جایگاه (خالص) */
export function minNextSlotBid(base: number, current: number | null): number {
  return current == null ? base : current + DEFAULTS.adslotBidIncrement;
}

export type BidAdSlotResult = { ok: true; amount: number } | { ok: false; error: string };

class SlotBidError extends Error {}

/**
 * پیشنهاد برای یک بازهٔ جایگاه تبلیغاتی. تا شروع بازه، هر کس پیشنهاد بالاتری بدهد جایگاه را می‌گیرد،
 * حتی اگر دیرتر آمده باشد. سکهٔ پیشنهاد همان لحظه کم می‌شود و پیشنهاد قبلی کامل برمی‌گردد.
 * هر عضو تیم می‌تواند از سکه‌های خودش برای یکی از محصول‌های تیمش پیشنهاد بدهد.
 * هر تیم هم‌زمان حداکثر adslot_max_per_team بازه را در دست دارد. جایگاه در امتیاز اثری ندارد.
 */
export async function bidAdSlot(userId: string, slotId: string, productId: string, amount: number): Promise<BidAdSlotResult> {
  const [prices, maxPerTeam] = await Promise.all([
    adSlotPrices(),
    getSettingInt("adslot_max_per_team", DEFAULTS.adslotMaxPerTeam),
  ]);
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: "مبلغ پیشنهاد نامعتبر است" };

  let outbidTeamId: string | null = null;
  try {
    const result = await prisma.$transaction(async (tx): Promise<BidAdSlotResult> => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, teamId: true, buyWallet: true } });
      if (!user) return { ok: false, error: "کاربر پیدا نشد" };
      if (!user.teamId) return { ok: false, error: "جایگاه تبلیغاتی برای محصول تیم است؛ اول عضو یک تیم شو" };
      const gate = await moduleGate("adslots", user.teamId);
      if (gate) return { ok: false, error: gate };
      const product = await tx.product.findUnique({ where: { id: productId }, select: { teamId: true, submittedAt: true } });
      if (!product || product.teamId !== user.teamId) return { ok: false, error: "این محصول متعلق به تیم تو نیست" };
      if (!product.submittedAt) return { ok: false, error: "اول محصولت را ثبت نهایی کن؛ تبلیغ به صفحهٔ محصول می‌رسد" };

      const slot = await tx.adSlot.findUnique({ where: { id: slotId } });
      if (!slot || slot.status !== "OPEN") return { ok: false, error: "جایگاه پیدا نشد" };
      if (slot.hourStart.getTime() <= Date.now()) return { ok: false, error: "پیشنهاد این بازه بسته شده است" };

      const base = prices[slot.kind as AdSlotKind] ?? 0;
      const min = minNextSlotBid(base, slot.pricePaid);
      if (amount < min) return { ok: false, error: `کمترین پیشنهاد ${fa(min)} سکه است` };

      if (slot.winnerTeamId !== user.teamId) {
        const held = await tx.adSlot.count({
          where: { winnerTeamId: user.teamId, status: "OPEN", hourStart: { gt: new Date() } },
        });
        if (held >= maxPerTeam) return { ok: false, error: `هر تیم هم‌زمان حداکثر ${fa(maxPerTeam)} جایگاه می‌تواند در دست داشته باشد` };
      }

      // پیشنهاد قبلی همین نفر برمی‌گردد، پس در محاسبهٔ موجودی می‌آید.
      const refundToSelf = slot.winnerUserId === userId ? (slot.pricePaid ?? 0) : 0;
      const spendable = user.buyWallet + refundToSelf - (await reservedBuyCoins(tx, userId));
      if (amount > spendable) return { ok: false, error: "سکهٔ کافی نداری؛ از «کیف سکه» سکه بخر" };

      // نگهبان مسابقه: فقط اگر بالاترین پیشنهاد هنوز همانی است که خواندیم.
      const claimed = await tx.adSlot.updateMany({
        where: { id: slot.id, status: "OPEN", pricePaid: slot.pricePaid },
        data: { winnerTeamId: user.teamId, winnerProductId: productId, winnerUserId: userId, pricePaid: amount },
      });
      if (claimed.count === 0) throw new SlotBidError("همین حالا پیشنهاد بالاتری ثبت شد؛ دوباره تلاش کن");

      if (slot.winnerUserId && slot.pricePaid) {
        await tx.user.update({ where: { id: slot.winnerUserId }, data: { buyWallet: { increment: slot.pricePaid } } });
        await tx.ledgerEntry.create({
          data: { userId: slot.winnerUserId, teamId: slot.winnerTeamId, wallet: "BUY", delta: slot.pricePaid, reason: ADSLOT_REFUND_REASON, refId: slot.id },
        });
        if (slot.winnerTeamId !== user.teamId) outbidTeamId = slot.winnerTeamId;
      }
      const charged = await tx.user.updateMany({
        where: { id: userId, buyWallet: { gte: amount } },
        data: { buyWallet: { decrement: amount } },
      });
      if (charged.count === 0) throw new SlotBidError("سکهٔ کافی نداری");
      await tx.ledgerEntry.create({
        data: { userId, teamId: user.teamId, wallet: "BUY", delta: -amount, reason: "ADSLOT", refId: slot.id },
      });
      await tx.adSlotBid.create({ data: { slotId: slot.id, teamId: user.teamId, userId, productId, amount } });
      return { ok: true, amount };
    });

    if (result.ok && outbidTeamId) {
      await notifyTeam(outbidTeamId, {
        kind: "adslot_outbid",
        title: "پیشنهاد بالاتری برای جایگاه تبلیغاتی شما ثبت شد",
        body: "سکهٔ پیشنهادتان برگشت. اگر هنوز جایگاه را می‌خواهید پیشنهاد بالاتری بدهید.",
        href: "/adslots",
      }).catch(() => {});
    }
    return result;
  } catch (e) {
    if (e instanceof SlotBidError) return { ok: false, error: e.message };
    throw e;
  }
}

export type SlotCell = {
  id: string;
  kind: AdSlotKind;
  hourStart: string;
  /** OPEN: پیشنهاد باز است · LIVE: در حال نمایش · PAST: تمام شده */
  state: "OPEN" | "LIVE" | "PAST";
  /** کمترین پیشنهاد مجاز بعدی */
  minBid: number;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  pricePaid: number | null;
  mine: boolean;
};

/** شبکهٔ بازه × نوع جایگاه برای صفحهٔ جایگاه تبلیغاتی. */
export async function slotsGrid(myTeamId: string | null): Promise<SlotCell[]> {
  // مدل AdSlot رابطهٔ winnerTeam ندارد (فقط winnerTeamId اسکالر)؛ جدا واکشی می‌شود.
  const [slots, teams, prices, duration] = await Promise.all([
    prisma.adSlot.findMany({ orderBy: [{ hourStart: "asc" }, { kind: "asc" }] }),
    prisma.team.findMany({ select: { id: true, name: true } }),
    adSlotPrices(),
    slotDurationMs(),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const now = Date.now();
  return slots.map((s) => {
    const start = s.hourStart.getTime();
    return {
      id: s.id,
      kind: s.kind as AdSlotKind,
      hourStart: s.hourStart.toISOString(),
      state: start > now ? "OPEN" : start + duration > now ? "LIVE" : "PAST",
      minBid: minNextSlotBid(prices[s.kind as AdSlotKind] ?? 0, s.pricePaid),
      winnerTeamId: s.winnerTeamId,
      winnerTeamName: (s.winnerTeamId && teamById.get(s.winnerTeamId)?.name) ?? null,
      pricePaid: s.pricePaid,
      mine: !!myTeamId && s.winnerTeamId === myTeamId,
    };
  });
}

/** محصول‌های صاحب فعلی هر نوع جایگاه، برای نمایش در بازار. */
export async function currentAdWinners(now: Date): Promise<{ banner: string | null; featured: string | null; push: string | null }> {
  const duration = await slotDurationMs();
  const sold = await prisma.adSlot.findMany({
    where: { winnerProductId: { not: null }, status: "OPEN", hourStart: { lte: now, gt: new Date(now.getTime() - duration) } },
    orderBy: { hourStart: "desc" },
  });
  const pick = (kind: AdSlotKind) => sold.find((s) => s.kind === kind)?.winnerProductId ?? null;
  return { banner: pick("BANNER"), featured: pick("FEATURED"), push: pick("PUSH") };
}

/**
 * جایگاه «اعلان به همه»: وقتی بازه‌اش شروع شد، یک‌بار به همهٔ شرکت‌کننده‌ها اعلان می‌رود.
 * ارسال‌شده‌ها در Setting (adslot_push_sent:<id>) علامت می‌خورند تا تکرار نشوند.
 */
export async function sendDuePushSlots(): Promise<number> {
  const now = new Date();
  const duration = await slotDurationMs();
  const due = await prisma.adSlot.findMany({
    where: { kind: "PUSH", status: "OPEN", winnerProductId: { not: null }, hourStart: { lte: now, gt: new Date(now.getTime() - duration) } },
  });
  let sent = 0;
  for (const slot of due) {
    const key = `adslot_push_sent:${slot.id}`;
    const marked = await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: "" } });
    if (marked.value) continue;
    // ادعای شرطی: فقط یک فراخوانی ارسال می‌کند.
    const claimed = await prisma.setting.updateMany({ where: { key, value: "" }, data: { value: now.toISOString() } });
    if (claimed.count === 0) continue;
    const product = await prisma.product.findUnique({
      where: { id: slot.winnerProductId! },
      select: { name: true, tagline: true, slug: true, submittedAt: true, team: { select: { name: true } } },
    });
    if (!product?.submittedAt) {
      // اعلانی نرفت: علامت «ارسال‌نشده» تا در پایان بازی بازپرداخت شود (و دوباره هم تلاش نشود).
      await prisma.setting.update({ where: { key }, data: { value: PUSH_SKIPPED } }).catch(() => {});
      continue;
    }
    await notifyAll({
      kind: "adslot_push",
      title: `📣 ${product.name}`,
      body: product.tagline || `محصول تیم ${product.team.name} را در بازار ببین.`,
      href: `/market/${product.slug}`,
    });
    sent++;
  }
  return sent;
}

// ---------- بازپرداخت جایگاه‌های تحویل‌نشده در پایان بازی ----------

/** مقدار علامت adslot_push_sent وقتی اعلان به دلیلی فرستاده نشد (تحویل‌نشده حساب می‌شود). */
const PUSH_SKIPPED = "skipped";

/**
 * آیا جایگاه تحویل شده است؟ (خالص، برای تست)
 * - PUSH: فقط اگر اعلانش واقعاً فرستاده شده باشد.
 * - BANNER/FEATURED: اگر بازه‌اش پیش از پایان مسابقه شروع شده باشد.
 */
export function isAdSlotDelivered(slot: { kind: string; hourStart: Date }, pushSentValue: string | null, nowMs: number): boolean {
  if (slot.kind === "PUSH") return !!pushSentValue && pushSentValue !== PUSH_SKIPPED;
  return slot.hourStart.getTime() <= nowMs;
}

/** دلیل دفتر کل برای بازگشت پیشنهاد جایگاه */
export const ADSLOT_REFUND_REASON = "ADSLOT_REFUND";

/**
 * پایان بازی: پیشنهادهایی که به نمایش نرسیدند (بازه‌شان بعد از پایان مسابقه بود یا اعلانشان نرفت) به
 * پیشنهاددهنده برمی‌گردد. idempotent است: هر جایگاه با گذر شرطی OPEN→REFUNDED فقط یک‌بار بازپرداخت می‌شود.
 */
export async function refundUndeliveredAdSlots(now: Date = new Date()): Promise<{ refunded: number; coins: number }> {
  const sold = await prisma.adSlot.findMany({ where: { winnerTeamId: { not: null }, status: "OPEN" } });
  if (sold.length === 0) return { refunded: 0, coins: 0 };

  const pushMarks = await prisma.setting.findMany({
    where: { key: { in: sold.filter((s) => s.kind === "PUSH").map((s) => `adslot_push_sent:${s.id}`) } },
  });
  const pushSentById = new Map(pushMarks.map((m) => [m.key.slice("adslot_push_sent:".length), m.value]));

  let refunded = 0;
  let coins = 0;
  const notifyTeams = new Map<string, number>();
  for (const slot of sold) {
    if (isAdSlotDelivered(slot, pushSentById.get(slot.id) ?? null, now.getTime())) continue;
    const amount = await prisma.$transaction(async (tx) => {
      const claimed = await tx.adSlot.updateMany({ where: { id: slot.id, status: "OPEN" }, data: { status: "REFUNDED" } });
      if (claimed.count === 0 || !slot.winnerUserId || !slot.pricePaid) return 0;
      await tx.user.update({ where: { id: slot.winnerUserId }, data: { buyWallet: { increment: slot.pricePaid } } });
      await tx.ledgerEntry.create({
        data: { userId: slot.winnerUserId, teamId: slot.winnerTeamId, wallet: "BUY", delta: slot.pricePaid, reason: ADSLOT_REFUND_REASON, refId: slot.id },
      });
      return slot.pricePaid;
    });
    if (amount > 0) {
      refunded++;
      coins += amount;
      notifyTeams.set(slot.winnerTeamId!, (notifyTeams.get(slot.winnerTeamId!) ?? 0) + amount);
    }
  }
  for (const [teamId, amount] of notifyTeams) {
    await notifyTeam(teamId, {
      kind: "adslot_refund",
      title: "بازگشت پیشنهاد جایگاه تبلیغاتی",
      body: `جایگاهی که پیشنهاد داده بودید پیش از پایان مسابقه نمایش داده نشد؛ ${fa(amount)} سکه به کیف پیشنهاددهنده برگشت.`,
      href: "/wallet",
    }).catch(() => {});
  }
  if (refunded > 0) console.log(`[adslots] ${refunded} جایگاه تحویل‌نشده بازپرداخت شد (${coins} سکه)`);
  return { refunded, coins };
}
