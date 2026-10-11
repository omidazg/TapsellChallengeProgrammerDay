import { prisma } from "./db";
import { getPhase, getSetting, getSettingInt } from "./phase";
import { AD_SLOT_KINDS, DEFAULTS } from "./constants";
import { reservedBuyCoins } from "./reservations";
import { notifyAll, notifyTeam } from "./notifications";
import { fa } from "./persian";

export type AdSlotKind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as AdSlotKind[];
const HOUR_MS = 60 * 60 * 1000;

/** خرید جایگاه از «ساخت محصول» تا پایان «روز بازار» باز است (پیش‌خرید ساعت‌های روز بازار). */
const ADSLOT_PHASES = ["BUILD", "MARKET"] as const;

/**
 * ساعت شروع روز بازار: از تنظیمات (`market_starts_at`)؛ وگرنه ساعت اولین جایگاه موجود
 * (تا با عوض شدن روز، هر روز یک سری جایگاه تازه ساخته نشود)؛ وگرنه امروز ساعت ۱۲.
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
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * طول روز بازار (ساعت) از تنظیم زمان‌بند `phase_hours_MARKET`.
 * صفر یعنی «روز بازار بدون زمان پایان» (نه صفر ساعت)؛ برای ساختن جایگاه‌ها مدت پیش‌فرض ۸ ساعت فرض می‌شود.
 */
export async function marketHoursFromSettings(): Promise<number> {
  const hours = await getSettingInt("phase_hours_MARKET", 8);
  if (hours <= 0) return 8;
  return Math.min(24, Math.max(1, hours));
}

/** برای هر نوع جایگاه و هر ساعت از روز بازار یک AdSlot می‌سازد (idempotent). */
export async function ensureAdSlots(marketStart: Date, hours?: number) {
  hours ??= await marketHoursFromSettings();
  const wanted: { kind: AdSlotKind; hourStart: Date }[] = [];
  for (let h = 0; h < hours; h++) {
    const hourStart = new Date(marketStart.getTime() + h * HOUR_MS);
    for (const kind of KINDS) wanted.push({ kind, hourStart });
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

/** قیمت ثابت هر نوع جایگاه (سکه) از تنظیمات. */
export async function adSlotPrices(): Promise<Record<AdSlotKind, number>> {
  const [banner, featured, push] = await Promise.all([
    getSettingInt("adslot_price_banner", DEFAULTS.adslotPriceBanner),
    getSettingInt("adslot_price_featured", DEFAULTS.adslotPriceFeatured),
    getSettingInt("adslot_price_push", DEFAULTS.adslotPricePush),
  ]);
  return { BANNER: banner, FEATURED: featured, PUSH: push };
}

export type BuyAdSlotResult = { ok: true; price: number } | { ok: false; error: string };

/**
 * خرید یک ساعت جایگاه تبلیغاتی به قیمت ثابت. هر عضو تیم می‌تواند از سکه‌های خودش برای تیمش بخرد.
 * اول‌آمده، اول‌خرید: جایگاهی که فروخته شد دیگر قابل خرید نیست. هر تیم حداکثر adslot_max_per_team جایگاه.
 * جایگاه برای امتیاز اثری ندارد؛ فقط دیده‌شدن در بازار را بیشتر می‌کند.
 */
export async function buyAdSlot(userId: string, slotId: string): Promise<BuyAdSlotResult> {
  const { phase } = await getPhase();
  if (!(ADSLOT_PHASES as readonly string[]).includes(phase)) {
    return { ok: false, error: "خرید جایگاه تبلیغاتی فقط در «ساخت محصول» و «روز بازار» ممکن است" };
  }
  const [prices, maxPerTeam] = await Promise.all([
    adSlotPrices(),
    getSettingInt("adslot_max_per_team", DEFAULTS.adslotMaxPerTeam),
  ]);

  try {
    return await prisma.$transaction(async (tx): Promise<BuyAdSlotResult> => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, teamId: true, buyWallet: true } });
      if (!user) return { ok: false, error: "کاربر پیدا نشد" };
      if (!user.teamId) return { ok: false, error: "جایگاه تبلیغاتی برای محصول تیم خریده می‌شود؛ اول عضو یک تیم شو" };
      const product = await tx.product.findUnique({ where: { teamId: user.teamId }, select: { submittedAt: true } });
      if (!product?.submittedAt) return { ok: false, error: "اول محصولت را ثبت نهایی کن؛ تبلیغ به صفحهٔ محصول می‌رسد" };

      const slot = await tx.adSlot.findUnique({ where: { id: slotId } });
      if (!slot) return { ok: false, error: "جایگاه پیدا نشد" };
      if (slot.winnerTeamId || slot.status !== "OPEN") return { ok: false, error: "این جایگاه قبلاً فروخته شده است" };
      if (slot.hourStart.getTime() + HOUR_MS <= Date.now()) return { ok: false, error: "زمان این جایگاه گذشته است" };

      const owned = await tx.adSlot.count({ where: { winnerTeamId: user.teamId } });
      if (owned >= maxPerTeam) return { ok: false, error: `هر تیم حداکثر ${fa(maxPerTeam)} جایگاه می‌تواند بخرد` };

      const price = prices[slot.kind as AdSlotKind] ?? 0;
      const spendable = user.buyWallet - (await reservedBuyCoins(tx, userId));
      if (price > spendable) return { ok: false, error: "سکهٔ کافی نداری؛ از «کیف سکه» سکه بخر" };

      // نگهبان مسابقه: فقط اگر جایگاه هنوز آزاد است.
      const claimed = await tx.adSlot.updateMany({
        where: { id: slot.id, status: "OPEN", winnerTeamId: null },
        data: { status: "CLOSED", winnerTeamId: user.teamId, pricePaid: price },
      });
      if (claimed.count === 0) throw new SlotTakenError();
      if (price > 0) {
        const charged = await tx.user.updateMany({
          where: { id: userId, buyWallet: { gte: price } },
          data: { buyWallet: { decrement: price } },
        });
        if (charged.count === 0) throw new SlotTakenError("سکهٔ کافی نداری");
        await tx.ledgerEntry.create({
          data: { userId, teamId: user.teamId, wallet: "BUY", delta: -price, reason: "ADSLOT", refId: slot.id },
        });
      }
      return { ok: true, price };
    });
  } catch (e) {
    if (e instanceof SlotTakenError) return { ok: false, error: e.message };
    throw e;
  }
}

class SlotTakenError extends Error {
  constructor(message = "این جایگاه همین حالا فروخته شد") {
    super(message);
  }
}

export type SlotCell = {
  id: string;
  kind: AdSlotKind;
  hourStart: string;
  /** OPEN: قابل خرید · SOLD: فروخته شده · PAST: زمانش گذشته */
  state: "OPEN" | "SOLD" | "PAST";
  price: number;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  pricePaid: number | null;
  mine: boolean;
};

/** شبکهٔ ساعت × نوع جایگاه برای صفحهٔ جایگاه تبلیغاتی. */
export async function slotsGrid(myTeamId: string | null): Promise<SlotCell[]> {
  // مدل AdSlot رابطهٔ winnerTeam ندارد (فقط winnerTeamId اسکالر)؛ جدا واکشی می‌شود.
  const [slots, teams, prices] = await Promise.all([
    prisma.adSlot.findMany({ orderBy: [{ hourStart: "asc" }, { kind: "asc" }] }),
    prisma.team.findMany({ select: { id: true, name: true } }),
    adSlotPrices(),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const now = Date.now();
  return slots.map((s) => ({
    id: s.id,
    kind: s.kind as AdSlotKind,
    hourStart: s.hourStart.toISOString(),
    state: s.winnerTeamId ? "SOLD" : s.hourStart.getTime() + HOUR_MS <= now ? "PAST" : "OPEN",
    price: prices[s.kind as AdSlotKind] ?? 0,
    winnerTeamId: s.winnerTeamId,
    winnerTeamName: (s.winnerTeamId && teamById.get(s.winnerTeamId)?.name) ?? null,
    pricePaid: s.pricePaid,
    mine: !!myTeamId && s.winnerTeamId === myTeamId,
  }));
}

/** تیم‌های صاحب فعلی هر نوع جایگاه، برای نمایش در بازار. */
export async function currentAdWinners(now: Date): Promise<{ banner: string | null; featured: string | null; push: string | null }> {
  const sold = await prisma.adSlot.findMany({
    where: { winnerTeamId: { not: null }, hourStart: { lte: now } },
  });
  const active = sold.filter((s) => now.getTime() < s.hourStart.getTime() + HOUR_MS);
  const pick = (kind: AdSlotKind) => active.filter((s) => s.kind === kind).sort((a, b) => b.hourStart.getTime() - a.hourStart.getTime())[0]?.winnerTeamId ?? null;
  return { banner: pick("BANNER"), featured: pick("FEATURED"), push: pick("PUSH") };
}

/**
 * جایگاه «اعلان به همه»: وقتی ساعتش شروع شد، یک‌بار به همهٔ شرکت‌کننده‌ها اعلان می‌رود.
 * ارسال‌شده‌ها در Setting (adslot_push_sent:<id>) علامت می‌خورند تا تکرار نشوند. زمان‌بند در روز بازار صدا می‌زند.
 */
export async function sendDuePushSlots(): Promise<number> {
  const now = new Date();
  const due = await prisma.adSlot.findMany({
    where: { kind: "PUSH", winnerTeamId: { not: null }, hourStart: { lte: now, gt: new Date(now.getTime() - HOUR_MS) } },
  });
  let sent = 0;
  for (const slot of due) {
    const key = `adslot_push_sent:${slot.id}`;
    const marked = await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: "" } });
    if (marked.value) continue;
    // ادعای شرطی: فقط یک فراخوانی ارسال می‌کند.
    const claimed = await prisma.setting.updateMany({ where: { key, value: "" }, data: { value: now.toISOString() } });
    if (claimed.count === 0) continue;
    const team = await prisma.team.findUnique({
      where: { id: slot.winnerTeamId! },
      select: { name: true, slug: true, product: { select: { name: true, tagline: true, submittedAt: true } } },
    });
    if (!team?.product?.submittedAt) {
      // اعلانی نرفت: علامت «ارسال‌نشده» تا در پایان بازی بازپرداخت شود (و دوباره هم تلاش نشود).
      await prisma.setting.update({ where: { key }, data: { value: PUSH_SKIPPED } }).catch(() => {});
      continue;
    }
    await notifyAll({
      kind: "adslot_push",
      title: `📣 ${team.product.name}`,
      body: team.product.tagline || `محصول تیم ${team.name} را در بازار ببین.`,
      href: `/market/${team.slug}`,
    });
    sent++;
  }
  return sent;
}

// ---------- بازپرداخت جایگاه‌های تحویل‌نشده در پایان بازی ----------

/** مقدار علامت adslot_push_sent وقتی اعلان به دلیلی فرستاده نشد (تحویل‌نشده حساب می‌شود). */
const PUSH_SKIPPED = "skipped";
/** کلید Setting بازه‌های واقعی «روز بازار» (JSON: [{start, end|null}] با زمان ISO). */
export const MARKET_WINDOWS_KEY = "market_windows";

export type MarketWindow = { start: string; end: string | null };

function parseWindows(raw: string | null | undefined): MarketWindow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (w): w is MarketWindow =>
        !!w && typeof w.start === "string" && (w.end === null || typeof w.end === "string") && !Number.isNaN(new Date(w.start).getTime())
    );
  } catch {
    return [];
  }
}

export async function getMarketWindows(): Promise<MarketWindow[]> {
  const row = await prisma.setting.findUnique({ where: { key: MARKET_WINDOWS_KEY } });
  return parseWindows(row?.value);
}

/**
 * ثبت بازه‌های واقعی روز بازار (idempotent): رسیدن به MARKET اگر بازهٔ بازی نباشد یکی باز می‌کند؛
 * هر فاز دیگری بازهٔ باز را می‌بندد. از transitionTo و (برای اطمینان) از تیک زمان‌بند در روز بازار صدا زده می‌شود.
 * تحویل بنر/کارت ویژه در پایان بازی از روی همین بازه‌ها سنجیده می‌شود.
 */
export async function recordMarketWindow(phase: string, now: Date = new Date()): Promise<void> {
  const windows = await getMarketWindows();
  const last = windows[windows.length - 1];
  const open = !!last && last.end === null;
  if (phase === "MARKET") {
    if (open) return;
    windows.push({ start: now.toISOString(), end: null });
  } else {
    if (!open) return;
    last.end = now.toISOString();
  }
  const value = JSON.stringify(windows);
  await prisma.setting.upsert({ where: { key: MARKET_WINDOWS_KEY }, update: { value }, create: { key: MARKET_WINDOWS_KEY, value } });
}

/**
 * آیا جایگاه تحویل شده است؟ (خالص، برای تست)
 * - PUSH: فقط اگر اعلانش واقعاً فرستاده شده باشد (علامت adslot_push_sent با زمان ارسال).
 * - BANNER/FEATURED: اگر ساعتش با یکی از بازه‌های واقعی روز بازار هم‌پوشانی داشته باشد
 *   (حتی بخشی از ساعت؛ بازهٔ باز تا nowMs حساب می‌شود).
 */
export function isAdSlotDelivered(
  slot: { kind: string; hourStart: Date },
  windows: MarketWindow[],
  pushSentValue: string | null,
  nowMs: number
): boolean {
  if (slot.kind === "PUSH") return !!pushSentValue && pushSentValue !== PUSH_SKIPPED;
  const from = slot.hourStart.getTime();
  const to = from + HOUR_MS;
  return windows.some((w) => {
    const ws = new Date(w.start).getTime();
    const we = w.end ? new Date(w.end).getTime() : nowMs;
    return ws < to && we > from;
  });
}

/** دلیل دفتر کل برای بازپرداخت جایگاه تحویل‌نشده */
export const ADSLOT_REFUND_REASON = "ADSLOT_REFUND";

/**
 * پایان بازی: جایگاه‌های فروخته‌شده‌ای که هرگز تحویل نشدند (روز بازار دیرتر از ساعت پیکربندی‌شده شروع شد،
 * زودتر بسته شد، یا اصلاً به آن ساعت نرسید) به خریدار بازپرداخت می‌شوند. idempotent است: هر جایگاه با
 * گذر شرطی وضعیت CLOSED→REFUNDED فقط یک‌بار بازپرداخت می‌شود و یک ردیف ADSLOT_REFUND در دفتر کل می‌گیرد.
 * سکه به همان کسی برمی‌گردد که خرید را انجام داد (ردیف ADSLOT دفتر کل با refId جایگاه).
 */
export async function refundUndeliveredAdSlots(now: Date = new Date()): Promise<{ refunded: number; coins: number }> {
  const windows = await getMarketWindows();
  const sold = await prisma.adSlot.findMany({ where: { winnerTeamId: { not: null }, status: "CLOSED" } });
  if (sold.length === 0) return { refunded: 0, coins: 0 };

  const pushMarks = await prisma.setting.findMany({
    where: { key: { in: sold.filter((s) => s.kind === "PUSH").map((s) => `adslot_push_sent:${s.id}`) } },
  });
  const pushSentById = new Map(pushMarks.map((m) => [m.key.slice("adslot_push_sent:".length), m.value]));

  let refunded = 0;
  let coins = 0;
  const notifyTeams = new Map<string, number>();
  for (const slot of sold) {
    if (isAdSlotDelivered(slot, windows, pushSentById.get(slot.id) ?? null, now.getTime())) continue;
    const amount = await prisma.$transaction(async (tx) => {
      const claimed = await tx.adSlot.updateMany({ where: { id: slot.id, status: "CLOSED" }, data: { status: "REFUNDED" } });
      if (claimed.count === 0) return 0;
      const purchase = await tx.ledgerEntry.findFirst({
        where: { reason: "ADSLOT", refId: slot.id, delta: { lt: 0 } },
        orderBy: { createdAt: "desc" },
      });
      const already = await tx.ledgerEntry.count({ where: { reason: ADSLOT_REFUND_REASON, refId: slot.id } });
      if (!purchase?.userId || already > 0) return 0;
      const refund = -purchase.delta;
      await tx.user.update({ where: { id: purchase.userId }, data: { buyWallet: { increment: refund } } });
      await tx.ledgerEntry.create({
        data: { userId: purchase.userId, teamId: slot.winnerTeamId, wallet: "BUY", delta: refund, reason: ADSLOT_REFUND_REASON, refId: slot.id },
      });
      return refund;
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
      title: "بازپرداخت جایگاه تبلیغاتی",
      body: `جایگاه تبلیغاتی‌ای که خریده بودید چون روز بازار در آن ساعت برگزار نشد نمایش داده نشد؛ ${fa(amount)} سکه به کیف خریدار برگشت.`,
      href: "/wallet",
    }).catch(() => {});
  }
  if (refunded > 0) console.log(`[adslots] ${refunded} جایگاه تحویل‌نشده بازپرداخت شد (${coins} سکه)`);
  return { refunded, coins };
}
