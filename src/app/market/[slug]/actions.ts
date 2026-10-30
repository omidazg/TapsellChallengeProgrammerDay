"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { moduleGate } from "@/lib/module-state";
import { purchaseProduct } from "@/lib/market";
import { enqueueAuction } from "@/lib/auction";
import { teamManageError } from "@/lib/team-access";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { invalidate } from "@/lib/ttl-cache";

export type PurchaseState = { error?: string; ok?: boolean; amount?: number };
export type HeartState = { error?: string; ok?: boolean };
export type EnqueueState = { error?: string; ok?: boolean; position?: number };

/**
 * خرید یک محصول به قیمت کامل (هر کلیک یک خرید مستقل).
 * منطق اصلی در purchaseProduct (src/lib/market.ts) است؛ این اکشن فقط احراز هویت و
 * اثرات جانبی صفحه (revalidate/کش) را اضافه می‌کند.
 */
export async function purchaseAction(productId: string, slug: string): Promise<PurchaseState> {
  const user = await requireUser();

  try {
    const result = await purchaseProduct(user.id, productId);
    if (!result.ok) return { error: result.error };

    revalidatePath(`/market`);
    revalidatePath(`/market/${slug}`);
    // خرید در بخش «حمایت با سکه» امتیاز حساب می‌شود.
    invalidate("scores:");
    invalidate("api:market:ticker");
    return { ok: true, amount: result.amount };
  } catch (e) {
    console.error("purchase failed", e);
    return { error: "خرید ناموفق بود؛ دوباره تلاش کن" };
  }
}

/** قلب‌دادن به محصول؛ فقط پس از حداقل یک خرید، یک‌بار برای هر کاربر */
export async function heartAction(productId: string, slug: string): Promise<HeartState> {
  const user = await requireUser();

  const gate = await moduleGate("market", user.teamId);
  if (gate) return { error: gate };

  const purchaseCount = await prisma.purchase.count({ where: { userId: user.id, productId } });
  if (purchaseCount === 0) return { error: "برای قلب‌دادن ابتدا باید از این محصول خریده باشی" };

  try {
    await prisma.heart.create({ data: { productId, userId: user.id } });
  } catch {
    return { error: "قبلاً به این محصول قلب داده‌ای" };
  }

  revalidatePath(`/market`);
  revalidatePath(`/market/${slug}`);
  invalidate("scores:");
  return { ok: true };
}

/**
 * فرستادن نسخهٔ ویژهٔ محصولِ تیمِ کاربر در یک محور به صف حراج زنده (هر عضو تیم).
 * منطق و همهٔ شرط‌ها در enqueueAuction (src/lib/auction.ts) است؛ slug فقط برای تازه‌سازی صفحه است.
 */
export async function enqueueAuctionAction(trackId: string, slug?: string): Promise<EnqueueState> {
  const user = await requireUser();
  const limit = rateLimit("auction:enqueue", user.id, { limit: 10, windowMs: 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  const accessError = await teamManageError(user);
  if (accessError) return { error: accessError };

  try {
    const result = await enqueueAuction(user.id, String(trackId ?? ""));
    if (!result.ok) return { error: result.error };
    if (slug) revalidatePath(`/market/${slug}`);
    revalidatePath("/auction");
    return { ok: true, position: result.position };
  } catch (e) {
    console.error("enqueue auction failed", e);
    return { error: "فرستادن به حراج ناموفق بود؛ دوباره تلاش کن" };
  }
}
