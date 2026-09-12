"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(120).email(),
  password: z.string().min(1).max(200),
});

/** پیام یکسان برای «ایمیل نبود» و «رمز غلط» تا فهرست ایمیل‌ها لو نرود */
const GENERIC = "ایمیل یا رمز عبور اشتباه است.";

/**
 * هش ساختگی برای هم‌زمان‌کردن مسیر «کاربر پیدا نشد» با مسیر «رمز غلط»؛
 * بدون آن، اختلاف زمان پاسخ، وجود یا نبود ایمیل را فاش می‌کند.
 */
const DUMMY_HASH = "$2b$10$/OBLsQLxVqFmbniuCWdlUeg2IcBqHWKNiL39oJV5Ko33qQXDAU55m";

export async function loginAction(input: { email: string; password: string }): Promise<{ error: string } | never> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "ایمیل یا رمز عبور را کامل وارد کن." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    await verifyPassword(parsed.data.password, DUMMY_HASH);
    return { error: GENERIC };
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return { error: GENERIC };
  }

  await createSession(user.id);
  // redirect یک NEXT_REDIRECT پرتاب می‌کند؛ باید بیرون از try/catch بماند
  redirect("/team");
}
