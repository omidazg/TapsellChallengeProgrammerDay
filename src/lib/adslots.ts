import { prisma } from "./db";
import { getSetting } from "./phase";
import { AD_SLOT_KINDS } from "./constants";

export type AdSlotKind = keyof typeof AD_SLOT_KINDS;
const KINDS = Object.keys(AD_SLOT_KINDS) as AdSlotKind[];

/** ساعت شروع روز بازار: از تنظیمات (`market_starts_at`) یا امروز ساعت ۱۲. */
export async function marketStartFromSettings(): Promise<Date> {
  const raw = await getSetting("market_starts_at", "");
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

/** برای هر نوع جایگاه و هر ساعت از روز بازار یک AdSlot می‌سازد (idempotent). */
export async function ensureAdSlots(marketStart: Date, hours = 6) {
  const wanted: { kind: AdSlotKind; hourStart: Date }[] = [];
  for (let h = 0; h < hours; h++) {
    const hourStart = new Date(marketStart.getTime() + h * 60 * 60 * 1000);
    for (const kind of KINDS) wanted.push({ kind, hourStart });
  }
  const existing = await prisma.adSlot.findMany({
    where: { hourStart: { in: wanted.map((w) => w.hourStart) } },
    select: { kind: true, hourStart: true },
  });
  const existingKey = new Set(existing.map((e) => `${e.kind}|${e.hourStart.toISOString()}`));
  const toCreate = wanted.filter((w) => !existingKey.has(`${w.kind}|${w.hourStart.toISOString()}`));
  if (toCreate.length === 0) return;
  await prisma.$transaction(toCreate.map((w) => prisma.adSlot.create({ data: { kind: w.kind, hourStart: w.hourStart } })));
}

/** ثبت/به‌روزرسانی پیشنهاد یک تیم روی یک جایگاه؛ سقف = خزانه منهای سایر تعهدهای باز تیم. */
export async function upsertBid(slotId: string, teamId: string, amount: number) {
  if (amount <= 0) throw new Error("مبلغ پیشنهاد باید مثبت باشد");
  return prisma.$transaction(async (tx) => {
    const slot = await tx.adSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new Error("جایگاه پیدا نشد");
    if (slot.status !== "OPEN") throw new Error("این جایگاه بسته شده است");

    const team = await tx.team.findUnique({ where: { id: teamId } });
    if (!team) throw new Error("تیم پیدا نشد");

    const otherBids = await tx.adSlotBid.findMany({
      where: { teamId, slot: { status: "OPEN" }, slotId: { not: slotId } },
    });
    const committedElsewhere = otherBids.reduce((s, b) => s + b.amount, 0);
    if (committedElsewhere + amount > team.treasury) {
      throw new Error("مجموع پیشنهادهای باز از خزانهٔ تیم بیشتر می‌شود");
    }

    return tx.adSlotBid.upsert({
      where: { slotId_teamId: { slotId, teamId } },
      update: { amount },
      create: { slotId, teamId, amount },
    });
  });
}

/** قیمت دوم برای یک جایگاه: بستن با قاعدهٔ حراج قیمت-دوم مهروموم. */
export async function closeSlot(slotId: string) {
  return prisma.$transaction(async (tx) => {
    const slot = await tx.adSlot.findUnique({ where: { id: slotId }, include: { bids: true } });
    if (!slot || slot.status !== "OPEN") return null;

    const sorted = [...slot.bids].sort((a, b) => b.amount - a.amount);
    if (sorted.length === 0) {
      return tx.adSlot.update({ where: { id: slotId }, data: { status: "CLOSED" } });
    }
    const winner = sorted[0];
    const second = sorted.length >= 2 ? sorted[1].amount : 0;
    const pricePaid = Math.max(second, 1);

    await tx.team.update({ where: { id: winner.teamId }, data: { treasury: { decrement: pricePaid } } });
    await tx.ledgerEntry.create({ data: { teamId: winner.teamId, wallet: "TREASURY", delta: -pricePaid, reason: "ADSLOT", refId: slotId } });

    return tx.adSlot.update({
      where: { id: slotId },
      data: { status: "CLOSED", winnerTeamId: winner.teamId, pricePaid },
    });
  });
}

/** جایگاه‌های OPEN که ساعتشان نزدیک است (۵ دقیقه پیش از شروع) را می‌بندد. */
export async function closeDueSlots() {
  const cutoff = new Date(Date.now() + 5 * 60 * 1000); // now >= hourStart - 5min  <=>  hourStart <= now + 5min
  const due = await prisma.adSlot.findMany({ where: { status: "OPEN", hourStart: { lte: cutoff } } });
  const results = [];
  for (const s of due) results.push(await closeSlot(s.id));
  return results;
}

/** قدرت «هیاهو»: یک جایگاه FEATURED آزاد را رایگان می‌گیرد. */
export async function claimHypeSlot(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("کاربر پیدا نشد");
    if (user.power !== "HYPE") throw new Error("این قدرت را نداری");
    if (user.powerUsed) throw new Error("قدرتت قبلاً استفاده شده است");
    if (!user.teamId) throw new Error("عضو هیچ تیمی نیستی");

    const slot = await tx.adSlot.findFirst({ where: { kind: "FEATURED", status: "OPEN" }, orderBy: { hourStart: "asc" } });
    if (!slot) throw new Error("جایگاه ویژهٔ آزادی باقی نمانده است");

    await tx.adSlot.update({ where: { id: slot.id }, data: { status: "CLOSED", winnerTeamId: user.teamId, pricePaid: 0 } });
    await tx.user.update({ where: { id: userId }, data: { powerUsed: true } });
    return slot;
  });
}

export type SlotCell = {
  id: string;
  kind: AdSlotKind;
  hourStart: string;
  status: "OPEN" | "CLOSED";
  bidderCount: number;
  myBid: number | null;
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  pricePaid: number | null;
};

/** شبکهٔ ساعت × نوع جایگاه برای صفحهٔ حراج جایگاه تبلیغاتی. */
export async function slotsGrid(myTeamId: string | null): Promise<SlotCell[]> {
  // مدل AdSlot رابطهٔ winnerTeam ندارد (فقط winnerTeamId اسکالر)؛ جدا واکشی می‌شود.
  const [slots, teams] = await Promise.all([
    prisma.adSlot.findMany({ orderBy: [{ hourStart: "asc" }, { kind: "asc" }], include: { bids: true } }),
    prisma.team.findMany({ select: { id: true, name: true } }),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  return slots.map((s) => ({
    id: s.id,
    kind: s.kind as AdSlotKind,
    hourStart: s.hourStart.toISOString(),
    status: s.status as "OPEN" | "CLOSED",
    bidderCount: s.bids.length,
    myBid: myTeamId ? s.bids.find((b) => b.teamId === myTeamId)?.amount ?? null : null,
    winnerTeamId: s.winnerTeamId,
    winnerTeamName: (s.winnerTeamId && teamById.get(s.winnerTeamId)?.name) ?? null,
    pricePaid: s.pricePaid,
  }));
}

/** تیم‌های برندهٔ فعلی هر نوع جایگاه، برای نمایش در بازار. */
export async function currentAdWinners(now: Date): Promise<{ banner: string | null; featured: string | null; push: string | null }> {
  const closed = await prisma.adSlot.findMany({
    where: { status: "CLOSED", hourStart: { lte: now } },
  });
  const oneHour = 60 * 60 * 1000;
  const active = closed.filter((s) => now.getTime() < s.hourStart.getTime() + oneHour);
  const pick = (kind: AdSlotKind) => active.filter((s) => s.kind === kind).sort((a, b) => b.hourStart.getTime() - a.hourStart.getTime())[0]?.winnerTeamId ?? null;
  return { banner: pick("BANNER"), featured: pick("FEATURED"), push: pick("PUSH") };
}
