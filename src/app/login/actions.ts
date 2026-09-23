"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { rateLimit, rateLimitPeek, rateLimitMessage, clientIp, LOGIN_IP_RULE, LOGIN_EMAIL_RULE } from "@/lib/rate-limit";
import { safeNext } from "./next";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(120).email(),
  password: z.string().min(1).max(200),
});

/** پیام یکسان برای «ایمیل نبود» و «رمز غلط» تا فهرست ایمیل‌ها لو نرود */
const GENERIC = "ایمیل یا رمز عبور اشتباه است.";
const BLOCKED = "این حساب مسدود شده است.";

/**
 * هش ساختگی برای هم‌زمان‌کردن مسیر «کاربر پیدا نشد» با مسیر «رمز غلط»؛
 * بدون آن، اختلاف زمان پاسخ، وجود یا نبود ایمیل را فاش می‌کند.
 */
const DUMMY_HASH = "$2b$10$/OBLsQLxVqFmbniuCWdlUeg2IcBqHWKNiL39oJV5Ko33qQXDAU55m";

export async function loginAction(input: { email: string; password: string; next?: string | null }): Promise<{ error: string } | never> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "ایمیل یا رمز عبور را کامل وارد کن." };
  }

  // فقط تلاش‌های ناموفق شمرده می‌شوند: در روز رویداد کل سالن پشت یک IP است و
  // شمردن ورودهای موفق همه را قفل می‌کند. محافظ اصلی، سقف هر ایمیل است.
  const ip = await clientIp();
  const email = parsed.data.email;
  const ipLimit = rateLimitPeek("login:ip", ip, LOGIN_IP_RULE());
  if (!ipLimit.ok) return { error: rateLimitMessage(ipLimit.retryAfterSec) };
  const emailLimit = rateLimitPeek("login:email", email, LOGIN_EMAIL_RULE());
  if (!emailLimit.ok) return { error: rateLimitMessage(emailLimit.retryAfterSec) };
  const countFailure = () => {
    rateLimit("login:ip", ip, LOGIN_IP_RULE());
    rateLimit("login:email", email, LOGIN_EMAIL_RULE());
  };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    await verifyPassword(parsed.data.password, DUMMY_HASH);
    countFailure();
    return { error: GENERIC };
  }
  if (user.blockedAt) {
    await verifyPassword(parsed.data.password, DUMMY_HASH);
    countFailure();
    return { error: BLOCKED };
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    countFailure();
    return { error: GENERIC };
  }

  await createSession(user.id, user.sessionVersion);
  // redirect یک NEXT_REDIRECT پرتاب می‌کند؛ باید بیرون از try/catch بماند
  redirect(safeNext(input.next) ?? "/");
}
