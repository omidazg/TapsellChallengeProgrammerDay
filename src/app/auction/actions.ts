"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { placeBid, activateSecondWind, getBidBudget } from "@/lib/auction";
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
  // بودجهٔ تازهٔ کاربر (موجودی/رزرو/قابل‌خرج) همراه نتیجه برمی‌گردد تا ردیف کیف بدون درخواست جدا تازه شود.
  try {
    await placeBid(parsed.data.auctionId, user.id, parsed.data.amount);
    revalidatePath("/auction");
    return { ok: true as const, budget: await getBidBudget(user.id, parsed.data.auctionId).catch(() => null) };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "خطای نامشخص",
      budget: await getBidBudget(user.id, parsed.data.auctionId).catch(() => null),
    };
  }
}

/** بودجهٔ پیشنهاد کاربر جاری برای یک حراج؛ دادهٔ خصوصی کاربر، جدا از وضعیت عمومی و کش‌شدهٔ حراج. */
export async function bidBudgetAction(auctionId: string | null) {
  const user = await requireUser();
  const parsed = z.string().min(1).nullable().safeParse(auctionId);
  if (!parsed.success) return null;
  return getBidBudget(user.id, parsed.data);
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
