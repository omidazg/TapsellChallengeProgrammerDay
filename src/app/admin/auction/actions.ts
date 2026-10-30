"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { ensureAuctions, startNextAuction, settleAuction } from "@/lib/auction";
import { publishAuctionChange } from "@/lib/auction-events";
import { prisma } from "@/lib/db";
import { ensureAdSlots, marketStartFromSettings } from "@/lib/adslots";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";
import { moduleGate } from "@/lib/module-state";

export type AuctionAdminState = { error?: string; ok?: boolean };

/**
 * ابزار برگزارکننده: همهٔ محصولات ثبت‌شده‌ای که تیمشان هنوز به صف حراج نفرستاده، (با ترتیب تصادفی) ته صف می‌روند.
 * در جریان عادی هر تیم خودش محصولش را به صف می‌فرستد.
 */
export async function ensureAuctionsAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  const before = await prisma.auction.count();
  try {
    await ensureAuctions();
  } catch (e) {
    // مثلاً برخورد هم‌زمان با تیمی که همان لحظه محصولش را به صف فرستاده است
    console.error("ensureAuctionsAction failed", e);
    return { error: "افزودن محصولات به صف ممکن نشد؛ صفحه را تازه کن و دوباره تلاش کن" };
  }
  const added = (await prisma.auction.count()) - before;
  await audit(admin.id, "auction.enqueue_all", "", { added });
  revalidatePath("/admin/auction");
  revalidatePath("/auction");
  if (added <= 0) return { error: "محصول باقی‌مانده‌ای نیست؛ همهٔ محصولات ثبت‌شده در صف‌اند" };
  return { ok: true };
}

export async function startNextAuctionAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  // حراج زنده بخشی از بازار است؛ حراجی که با بازار بسته شروع شود بی‌پیشنهاد می‌سوزد.
  const gate = await moduleGate("market");
  if (gate) return { error: gate };
  const live = await prisma.auction.findFirst({ where: { status: "LIVE" }, select: { id: true } });
  if (live) return { error: "یک حراج هنوز زنده است؛ اول آن را تمام کن" };
  const dur = await getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec);
  const started = await startNextAuction(dur);
  revalidatePath("/admin/auction");
  revalidatePath("/auction");
  if (!started) return { error: "حراجی در صف باقی نمانده است" };
  await audit(admin.id, "auction.start", started.id, { durationSec: dur });
  return { ok: true };
}

const moveSchema = z.object({ auctionId: z.string().min(1), dir: z.enum(["up", "down"]) });

/** جابه‌جایی یک حراجِ در صف با حراج قبلی/بعدیِ در صف (فقط حراج‌های هنوز شروع‌نشده) */
export async function moveAuctionAction(prevState: AuctionAdminState, formData: FormData): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  const parsed = moveSchema.safeParse({ auctionId: formData.get("auctionId"), dir: formData.get("dir") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };
  const { auctionId, dir } = parsed.data;

  const swapped = await prisma.$transaction(async (tx) => {
    const a = await tx.auction.findUnique({ where: { id: auctionId }, select: { id: true, order: true, status: true } });
    if (!a || a.status !== "SCHEDULED") return null;
    const neighbor = await tx.auction.findFirst({
      where: { status: "SCHEDULED", order: dir === "up" ? { lt: a.order } : { gt: a.order } },
      orderBy: { order: dir === "up" ? "desc" : "asc" },
      select: { id: true, order: true },
    });
    if (!neighbor) return null;
    await tx.auction.update({ where: { id: a.id }, data: { order: neighbor.order } });
    await tx.auction.update({ where: { id: neighbor.id }, data: { order: a.order } });
    return { withId: neighbor.id };
  });
  if (!swapped) return { error: "جابه‌جایی ممکن نیست (حراج شروع شده یا در ابتدا/انتهای صف است)" };
  publishAuctionChange();
  await audit(admin.id, "auction.reorder", auctionId, { dir, swappedWith: swapped.withId });
  revalidatePath("/admin/auction");
  revalidatePath("/auction");
  return { ok: true };
}

export async function ensureAdSlotsAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  const marketStart = await marketStartFromSettings();
  // از زمان شروع تا ددلاین نهایی، برای هر بازه و هر نوع یک جایگاه ساخته می‌شود (idempotent).
  await ensureAdSlots(marketStart);
  await audit(admin.id, "adslot.ensure", "", { marketStart: marketStart.toISOString() });
  revalidatePath("/admin/auction");
  revalidatePath("/adslots");
  return { ok: true };
}

/** پایان دستی حراج زندهٔ جاری، صرف‌نظر از زمان باقی‌مانده. */
export async function settleCurrentAuctionAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  const live = await prisma.auction.findFirst({ where: { status: "LIVE" }, orderBy: { order: "asc" } });
  if (!live) return { error: "حراج زنده‌ای در جریان نیست" };
  let settled: Awaited<ReturnType<typeof settleAuction>>;
  try {
    settled = await settleAuction(live.id);
  } catch (e) {
    console.error("settleCurrentAuctionAction failed", e);
    return { error: "بستن حراج با خطا روبه‌رو شد" };
  }
  revalidatePath("/admin/auction");
  revalidatePath("/auction");
  if (!settled) return { error: "بستن حراج ممکن نشد" };
  // مثل بستن خودکار در زمان‌بند: فاصلهٔ «شروع خودکار حراج بعدی» از همین لحظه حساب شود
  await setSetting("last_auction_ended_at", new Date().toISOString());
  await audit(admin.id, "auction.close", live.id, {});
  return { ok: true };
}
