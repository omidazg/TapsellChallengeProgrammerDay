"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getPhase, getSettingInt } from "@/lib/phase";
import { DEFAULTS } from "@/lib/constants";
import { userSpentOn, validatePurchase } from "@/lib/market";
import type { Prisma } from "@prisma/client";

export type PurchaseState = { error?: string; ok?: boolean; amount?: number };
export type HeartState = { error?: string; ok?: boolean };

/** خرید یک محصول (هر کلیک یک خرید مستقل، تا سقف کیف/هدف) */
export async function purchaseAction(productId: string, useBargain: boolean, slug: string): Promise<PurchaseState> {
  const user = await requireUser();

  const { phase } = await getPhase();
  if (phase !== "MARKET") return { error: "خرید فقط در فاز «روز بازار» ممکن است" };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.submittedAt) return { error: "این محصول در دسترس نیست" };

  const isOwnTeam = !!user.teamId && user.teamId === product.teamId;
  const canBargain = useBargain && user.power === "BARGAIN" && !user.powerUsed;
  const discount = canBargain ? Math.floor(product.price * 0.1) : 0;
  const amount = product.price - discount;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const freshUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const alreadyOnTarget = await userSpentOn(freshUser.id, productId);
      const maxPerTarget = await getSettingInt("max_per_target", DEFAULTS.maxPerTarget);

      const validation = validatePurchase({
        amount,
        alreadyOnTarget,
        walletLeft: freshUser.buyWallet,
        maxPerTarget,
        isOwnTeam,
      });
      if (!validation.ok) throw new Error(validation.error);

      const purchase = await tx.purchase.create({
        data: { productId, userId: freshUser.id, amount, discount },
      });
      await tx.user.update({
        where: { id: freshUser.id },
        data: {
          buyWallet: { decrement: amount },
          ...(canBargain ? { powerUsed: true } : {}),
        },
      });
      await tx.ledgerEntry.create({
        data: { userId: freshUser.id, wallet: "BUY", delta: -amount, reason: "PURCHASE", refId: purchase.id },
      });
      return purchase;
    });

    revalidatePath(`/market`);
    revalidatePath(`/market/${slug}`);
    return { ok: true, amount: result.amount };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "خرید ناموفق بود" };
  }
}

/** قلب‌دادن به محصول؛ فقط پس از حداقل یک خرید، یک‌بار برای هر کاربر */
export async function heartAction(productId: string, slug: string): Promise<HeartState> {
  const user = await requireUser();

  const purchaseCount = await prisma.purchase.count({ where: { userId: user.id, productId } });
  if (purchaseCount === 0) return { error: "برای قلب‌دادن ابتدا باید از این محصول خریده باشی" };

  try {
    await prisma.heart.create({ data: { productId, userId: user.id } });
  } catch {
    return { error: "قبلاً به این محصول قلب داده‌ای" };
  }

  revalidatePath(`/market`);
  revalidatePath(`/market/${slug}`);
  return { ok: true };
}
