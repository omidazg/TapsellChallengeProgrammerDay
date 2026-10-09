"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { teamManageError } from "@/lib/team-access";
import { buyAdSlot } from "@/lib/adslots";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

/**
 * خرید یک ساعت جایگاه تبلیغاتی به قیمت ثابت (اول‌آمده، اول‌خرید) — هر عضو تیم با سکه‌های خودش.
 * شرط‌های فاز، سهمیهٔ تیم، محصول ثبت‌شده و موجودی همه در buyAdSlot (src/lib/adslots.ts) بررسی می‌شوند.
 */
export async function buyAdSlotAction(slotId: string): Promise<{ ok?: true; price?: number; error?: string }> {
  const user = await requireUser();
  const limit = rateLimit("adslot:buy", user.id, { limit: 20, windowMs: 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };
  const parsed = z.string().min(1).safeParse(slotId);
  if (!parsed.success) return { error: "جایگاه نامعتبر است" };

  try {
    const res = await buyAdSlot(user.id, parsed.data);
    if (!res.ok) return { error: res.error };
    revalidatePath("/adslots");
    revalidatePath("/market");
    return { ok: true, price: res.price };
  } catch (e) {
    console.error("adslot purchase failed", e);
    return { error: "خرید جایگاه ناموفق بود؛ دوباره تلاش کن" };
  }
}
