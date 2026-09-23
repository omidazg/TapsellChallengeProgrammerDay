"use server";

import { z } from "zod";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

export type UsersActionState = { error?: string; ok?: boolean };
export type ResetPasswordState = { error?: string; password?: string };

const toggleSchema = z.object({ userId: z.string().min(1) });

export async function toggleAdminAction(prevState: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const me = await requireAdmin();
  const parsed = toggleSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };
  if (parsed.data.userId === me.id) return { error: "نمی‌توانی دسترسی خودت را تغییر دهی" };

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return { error: "کاربر پیدا نشد" };

  await prisma.user.update({ where: { id: user.id }, data: { isAdmin: !user.isAdmin } });
  await audit(me.id, "user.toggle_admin", user.id, { isAdmin: !user.isAdmin });
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
  const me = await requireAdmin();
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
  await audit(me.id, "user.adjust_wallet", userId, { wallet, amount });

  revalidatePath("/admin/users");
  revalidatePath("/wallet");
  return { ok: true };
}

/** الفبای خوانا: بدون 0/O/l/1 تا با چشم اشتباه گرفته نشود */
const READABLE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function generateReadablePassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += READABLE_ALPHABET[randomInt(READABLE_ALPHABET.length)];
  return out;
}

const targetSchema = z.object({ userId: z.string().min(1) });

/** رمز تازه می‌سازد، هش می‌کند، نشست‌های قبلی را باطل می‌کند و رمز را یک‌بار برمی‌گرداند */
export async function resetPasswordAction(prevState: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const me = await requireAdmin();
  const parsed = targetSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return { error: "کاربر پیدا نشد" };

  const password = generateReadablePassword();
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  await audit(me.id, "user.reset_password", user.id, {});
  revalidatePath("/admin/users");
  return { password };
}

/** مسدودسازی/رفع مسدودیت؛ نمی‌تواند خود یا ادمین دیگر را هدف بگیرد */
export async function toggleBlockAction(prevState: UsersActionState, formData: FormData): Promise<UsersActionState> {
  const me = await requireAdmin();
  const parsed = targetSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "ورودی نامعتبر است" };
  if (parsed.data.userId === me.id) return { error: "نمی‌توانی خودت را مسدود کنی" };

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) return { error: "کاربر پیدا نشد" };
  if (user.isAdmin) return { error: "نمی‌توانی یک برگزارکننده را مسدود کنی" };

  const blocking = !user.blockedAt;
  await prisma.user.update({
    where: { id: user.id },
    data: { blockedAt: blocking ? new Date() : null, sessionVersion: { increment: 1 } },
  });
  await audit(me.id, blocking ? "user.block" : "user.unblock", user.id, {});
  revalidatePath("/admin/users");
  return { ok: true };
}
