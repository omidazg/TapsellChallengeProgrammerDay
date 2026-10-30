"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { teamManageError } from "@/lib/team-access";
import { bidAdSlot } from "@/lib/adslots";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

const bidSchema = z.object({
  slotId: z.string().min(1),
  productId: z.string().min(1),
  amount: z.number().int().positive(),
});

/**
 * پیشنهاد برای یک بازهٔ جایگاه تبلیغاتی — هر عضو تیم با سکه‌های خودش و برای یکی از محصول‌های ثبت‌شدهٔ تیم.
 * شرط‌های بخش، سهمیهٔ تیم، کمترین پیشنهاد و موجودی همه در bidAdSlot (src/lib/adslots.ts) بررسی می‌شوند.
 */
export async function bidAdSlotAction(slotId: string, productId: string, amount: number): Promise<{ ok?: true; amount?: number; error?: string }> {
  const user = await requireUser();
  const limit = rateLimit("adslot:bid", user.id, { limit: 20, windowMs: 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };
  const parsed = bidSchema.safeParse({ slotId, productId, amount });
  if (!parsed.success) return { error: "پیشنهاد نامعتبر است" };

  try {
    const res = await bidAdSlot(user.id, parsed.data.slotId, parsed.data.productId, parsed.data.amount);
    if (!res.ok) return { error: res.error };
    revalidatePath("/adslots");
    revalidatePath("/market");
    return { ok: true, amount: res.amount };
  } catch (e) {
    console.error("adslot bid failed", e);
    return { error: "ثبت پیشنهاد ناموفق بود؛ دوباره تلاش کن" };
  }
}
