"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase } from "@/lib/phase";
import { purchaseProduct } from "@/lib/market";
import { invalidate } from "@/lib/ttl-cache";

export type PurchaseState = { error?: string; ok?: boolean; amount?: number };
export type HeartState = { error?: string; ok?: boolean };

/**
 * خرید یک محصول (هر کلیک یک خرید مستقل، تا سقف کیف/هدف).
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
    // خرید روی netSales/grossSales تیم و در نتیجه امتیاز اثر می‌گذارد.
    invalidate("scores:");
    invalidate("api:market:ticker");
    // amount = مبلغی که واقعاً از کیف خرید کم شد (قیمت − تخفیف چانه‌زنی، اگر بود)
    return { ok: true, amount: result.paid };
  } catch (e) {
    console.error("purchase failed", e);
    return { error: "خرید ناموفق بود؛ دوباره تلاش کن" };
  }
}

/** قلب‌دادن به محصول؛ فقط پس از حداقل یک خرید، یک‌بار برای هر کاربر */
export async function heartAction(productId: string, slug: string): Promise<HeartState> {
  const user = await requireUser();

  const { phase } = await getPhase();
  if (phase !== "MARKET") return { error: "قلب‌دادن فقط در فاز «روز بازار» ممکن است" };

  const purchaseCount = await prisma.purchase.count({ where: { userId: user.id, productId } });
  if (purchaseCount === 0) return { error: "برای قلب‌دادن ابتدا باید از این محصول خریده باشی" };

  try {
    await prisma.heart.create({ data: { productId, userId: user.id } });
  } catch {
    return { error: "قبلاً به این محصول قلب داده‌ای" };
  }

  revalidatePath(`/market`);
  revalidatePath(`/market/${slug}`);
  // قلب روی امتیاز «جامعه» و جایزهٔ محبوب‌ترین محصول اثر می‌گذارد.
  invalidate("scores:");
  return { ok: true };
}
