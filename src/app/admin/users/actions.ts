"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export type UsersActionState = { error?: string; ok?: boolean };

const toggleSchema = z.object({ userId: z.string().min(1) });

export async function toggleAdminAction(prevState: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const me = await requireAdmin();
  const parsed = toggleSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };
  if (parsed.data.userId === me.id) return { error: "نمی‌توانی دسترسی خودت را تغییر دهی" };

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return { error: "کاربر پیدا نشد" };

  await prisma.user.update({ where: { id: user.id }, data: { isAdmin: !user.isAdmin } });
  revalidatePath("/admin/users");
  return { ok: true };
}

const adjustSchema = z.object({
  userId: z.string().min(1),
  wallet: z.enum(["SEED", "BUY"]),
  amount: z.coerce.number().int().refine((n) => n !== 0, "مقدار نباید صفر باشد"),
});

/** افزودن/کسر سکه با ثبت در دفتر کل با دلیل ADMIN */
export async function adjustWalletAction(prevState: UsersActionState, formData: FormData): Promise<UsersActionState> {
  await requireAdmin();
  const parsed = adjustSchema.safeParse({
    userId: formData.get("userId"),
    wallet: formData.get("wallet"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ورودی نامعتبر است" };

  const { userId, wallet, amount } = parsed.data;
  const field = wallet === "SEED" ? "seedWallet" : "buyWallet";

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { [field]: { increment: amount } } }),
    prisma.ledgerEntry.create({ data: { userId, wallet, delta: amount, reason: "ADMIN" } }),
  ]);

  revalidatePath("/admin/users");
  revalidatePath("/wallet");
  return { ok: true };
}
