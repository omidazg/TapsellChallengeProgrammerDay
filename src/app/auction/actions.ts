"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { placeBid, getBidBudget } from "@/lib/auction";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { getPhase } from "@/lib/phase";
import { bidErrorMessage, GENERIC_BID_ERROR } from "./bid-errors";

/** حراج زنده بخشی از «روز بازار» است؛ پیشنهاد فقط در همین فاز مجاز است. */
async function auctionPhaseError(): Promise<string | null> {
  const { phase } = await getPhase();
  return phase === "MARKET" ? null : "حراج زنده فقط در «روز بازار» باز است";
}

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
  const phaseError = await auctionPhaseError();
  if (phaseError) return { error: phaseError };
  // بودجهٔ تازهٔ کاربر (موجودی/رزرو/قابل‌خرج) همراه نتیجه برمی‌گردد تا ردیف کیف بدون درخواست جدا تازه شود.
  // (پیشنهاد روی محصول تیم خود را placeBid رد می‌کند.)
  try {
    await placeBid(parsed.data.auctionId, user.id, parsed.data.amount);
    revalidatePath("/auction");
    return { ok: true as const, budget: await getBidBudget(user.id, parsed.data.auctionId).catch(() => null) };
  } catch (e) {
    const error = bidErrorMessage(e);
    // خطای غیرِ قاعدهٔ بازی فقط در لاگ سرور، نه در پاسخ کاربر
    if (error === GENERIC_BID_ERROR) console.error("placeBid failed", e);
    return {
      error,
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
