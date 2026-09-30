"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { ensureAuctions, startNextAuction, settleAuction } from "@/lib/auction";
import { prisma } from "@/lib/db";
import { closeDueSlots, ensureAdSlots, marketStartFromSettings } from "@/lib/adslots";
import { audit } from "@/lib/audit";
import { setSetting } from "@/lib/admin";

export type AuctionAdminState = { error?: string; ok?: boolean };

export async function ensureAuctionsAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  try {
    await ensureAuctions();
  } catch (e) {
    // مثلاً برخورد هم‌زمان با زمان‌بند خودکار که همان محصول را در صف گذاشته است
    console.error("ensureAuctionsAction failed", e);
    return { error: "ساخت صف حراج ممکن نشد؛ صفحه را تازه کن و دوباره تلاش کن" };
  }
  await audit(admin.id, "auction.create", "", {});
  revalidatePath("/admin/auction");
  return { ok: true };
}

export async function startNextAuctionAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  // پیشنهاد دادن فقط در فاز AUCTION مجاز است؛ حراجی که بیرون از آن شروع شود بی‌پیشنهاد می‌سوزد.
  const { phase } = await getPhase();
  if (phase !== "AUCTION") return { error: "حراج فقط در فاز «حراج زنده» شروع می‌شود؛ اول فاز را عوض کن" };
  const live = await prisma.auction.findFirst({ where: { status: "LIVE" }, select: { id: true } });
  if (live) return { error: "یک حراج هنوز زنده است؛ اول آن را تمام کن" };
  const dur = await getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec);
  const started = await startNextAuction(dur);
  revalidatePath("/admin/auction");
  if (!started) return { error: "حراجی در صف باقی نمانده است" };
  await audit(admin.id, "auction.start", started.id, { durationSec: dur });
  return { ok: true };
}

export async function closeDueSlotsAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  await closeDueSlots();
  await audit(admin.id, "adslot.close_due", "", {});
  revalidatePath("/admin/auction");
  return { ok: true };
}

export async function ensureAdSlotsAction(): Promise<AuctionAdminState> {
  const admin = await requireAdmin();
  const marketStart = await marketStartFromSettings();
  await ensureAdSlots(marketStart, 6);
  await audit(admin.id, "adslot.ensure", "", { marketStart: marketStart.toISOString() });
  revalidatePath("/admin/auction");
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
