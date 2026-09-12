"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export type WalletActionState = { error?: string; ok?: boolean };

/**
 * فعال‌سازی قدرت سپر: فقط اثرش ثبت می‌شود (powerUsed=true)؛ امتیازدهی خودش جریمه را حذف می‌کند.
 * نام عمداً با `use` شروع نمی‌شود تا قانون rules-of-hooks تحریک نشود.
 */
export async function activateShieldAction(): Promise<WalletActionState> {
  const user = await requireUser();
  if (user.power !== "SHIELD") return { error: "قدرت تو سپر نیست" };
  if (user.powerUsed) return { error: "سپر قبلاً فعال شده است" };

  await prisma.user.update({ where: { id: user.id }, data: { powerUsed: true } });
  revalidatePath("/wallet");
  return { ok: true };
}
