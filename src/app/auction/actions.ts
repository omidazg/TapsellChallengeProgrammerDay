"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { placeBid, activateSecondWind } from "@/lib/auction";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

const bidSchema = z.object({
  auctionId: z.string().min(1),
  amount: z.number().int().positive(),
});

export async function placeBidAction(auctionId: string, amount: number) {
  const user = await requireUser();
  const limit = rateLimit("auction:bid", user.id, { limit: 60, windowMs: 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  const parsed = bidSchema.safeParse({ auctionId, amount });
  if (!parsed.success) return { error: "مبلغ پیشنهاد نامعتبر است" };
  try {
    await placeBid(parsed.data.auctionId, user.id, parsed.data.amount);
    revalidatePath("/auction");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خطای نامشخص" };
  }
}

export async function secondWindAction(auctionId: string) {
  const user = await requireUser();
  try {
    await activateSecondWind(auctionId, user.id);
    revalidatePath("/auction");
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خطای نامشخص" };
  }
}
