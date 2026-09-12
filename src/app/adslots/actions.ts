"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { upsertBid, claimHypeSlot } from "@/lib/adslots";

const bidSchema = z.object({
  slotId: z.string().min(1),
  amount: z.number().int().positive(),
});

export async function bidOnSlotAction(slotId: string, amount: number) {
  const user = await requireUser();
  if (!user.teamId) return { error: "عضو هیچ تیمی نیستی" };
  const parsed = bidSchema.safeParse({ slotId, amount });
  if (!parsed.success) return { error: "مبلغ پیشنهاد نامعتبر است" };
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
  try {
    await claimHypeSlot(user.id);
    revalidatePath("/adslots");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خطای نامشخص" };
  }
}
