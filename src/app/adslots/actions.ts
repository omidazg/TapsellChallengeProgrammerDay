"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { teamManageError } from "@/lib/leader";
import { upsertBid, claimHypeSlot } from "@/lib/adslots";
import { getPhase, phaseAtLeast } from "@/lib/phase";

/** مثل صفحه: از «ساخت محصول» باز است و پس از پایان بازی فقط خواندنی. */
async function adSlotsPhaseError(): Promise<string | null> {
  const { phase } = await getPhase();
  if (!phaseAtLeast(phase, "BUILD")) return "حراج جایگاه تبلیغاتی هنوز باز نشده است";
  if (phase === "CLOSED") return "بازی تمام شده است";
  return null;
}

const bidSchema = z.object({
  slotId: z.string().min(1),
  amount: z.number().int().positive(),
});

export async function bidOnSlotAction(slotId: string, amount: number) {
  const user = await requireUser();
  if (!user.teamId) return { error: "عضو هیچ تیمی نیستی" };
  const leaderError = await teamManageError(user);
  if (leaderError) return { error: leaderError };
  const parsed = bidSchema.safeParse({ slotId, amount });
  if (!parsed.success) return { error: "مبلغ پیشنهاد نامعتبر است" };
  const phaseError = await adSlotsPhaseError();
  if (phaseError) return { error: phaseError };
  try {
    await upsertBid(parsed.data.slotId, user.teamId, parsed.data.amount);
    revalidatePath("/adslots");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خطای نامشخص" };
  }
}

export async function claimHypeAction() {
  const user = await requireUser();
  const phaseError = await adSlotsPhaseError();
  if (phaseError) return { error: phaseError };
  try {
    await claimHypeSlot(user.id);
    revalidatePath("/adslots");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خطای نامشخص" };
  }
}
