"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { ensureAuctions, startNextAuction, settleAuction } from "@/lib/auction";
import { prisma } from "@/lib/db";
import { closeDueSlots, ensureAdSlots, marketStartFromSettings } from "@/lib/adslots";

export type AuctionAdminState = { error?: string; ok?: boolean };

export async function ensureAuctionsAction(): Promise<AuctionAdminState> {
  await requireAdmin();
  await ensureAuctions();
  revalidatePath("/admin/auction");
  return { ok: true };
}

export async function startNextAuctionAction(): Promise<AuctionAdminState> {
  await requireAdmin();
  const dur = await getSettingInt("auction_duration_sec", DEFAULTS.auctionDurationSec);
  const started = await startNextAuction(dur);
  revalidatePath("/admin/auction");
  if (!started) return { error: "حراجی در صف باقی نمانده است" };
  return { ok: true };
}

export async function closeDueSlotsAction(): Promise<AuctionAdminState> {
  await requireAdmin();
  await closeDueSlots();
  revalidatePath("/admin/auction");
  return { ok: true };
}

export async function ensureAdSlotsAction(): Promise<AuctionAdminState> {
  await requireAdmin();
  const marketStart = await marketStartFromSettings();
  await ensureAdSlots(marketStart, 6);
  revalidatePath("/admin/auction");
  return { ok: true };
}

/** پایان دستی حراج زندهٔ جاری، صرف‌نظر از زمان باقی‌مانده. */
export async function settleCurrentAuctionAction(): Promise<AuctionAdminState> {
  await requireAdmin();
  const live = await prisma.auction.findFirst({ where: { status: "LIVE" }, orderBy: { order: "asc" } });
  if (!live) return { error: "حراج زنده‌ای در جریان نیست" };
  const settled = await settleAuction(live.id);
  revalidatePath("/admin/auction");
  revalidatePath("/auction");
  if (!settled) return { error: "بستن حراج ممکن نشد" };
  return { ok: true };
}
