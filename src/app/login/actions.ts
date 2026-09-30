"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import {
  rateLimit,
  rateLimitPeek,
  rateLimitMessage,
  clientIp,
  LOGIN_IP_RULE,
  LOGIN_EMAIL_RULE,
  OTP_IP_RULE,
  OTP_VERIFY_PHONE_RULE,
} from "@/lib/rate-limit";
import { accessState, accessStateByPhone, type AccessState } from "@/lib/whitelist";
import { normalizePhone } from "@/lib/phone";
import { requestOtp, verifyOtp } from "@/lib/otp";
import { safeNext } from "./next";
import { toEnDigits } from "@/lib/persian";

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

export type LoginResult = { error: string; access?: Exclude<AccessState, "ALLOWED"> | "NO_ACCOUNT" };

export async function loginAction(input: { email: string; password: string; next?: string | null }): Promise<LoginResult | never> {
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
    // کسی که حساب ندارد باید بداند قدم بعدی‌اش چیست: ثبت‌نام، صبر برای تأیید، یا درخواست دسترسی
    const state = await accessState(email);
    if (state === "ALLOWED") return { error: "هنوز با این ایمیل حسابی نساخته‌ای؛ ایمیلت مجاز است، ثبت‌نام کن.", access: "NO_ACCOUNT" };
    if (state === "PENDING") return { error: "درخواست دسترسی‌ات ثبت شده و در انتظار تأیید برگزارکننده است.", access: "PENDING" };
    if (state === "REJECTED") return { error: "درخواست دسترسی‌ات رد شده است؛ اگر فکر می‌کنی اشتباهی رخ داده، دوباره درخواست بده یا با برگزارکننده تماس بگیر.", access: "REJECTED" };
    return { error: "این ایمیل در لیست سفید رویداد نیست. برای ورود، درخواست دسترسی بده تا برگزارکننده تأیید کند.", access: "NONE" };
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

// ---------- ورود با شمارهٔ موبایل و کد پیامکی ----------

export type OtpRequestResult =
  | { ok: true; phone: string; ttlSec: number; resendSec: number; devCode?: string }
  | { ok?: false; error: string; access?: Exclude<AccessState, "ALLOWED"> | "NO_ACCOUNT"; phone?: string; retryAfterSec?: number };

/** مرحلهٔ اول: شماره را بررسی و کد ورود را پیامک می‌کند */
export async function requestLoginOtpAction(rawPhone: string): Promise<OtpRequestResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "شمارهٔ موبایل معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷." };

  const ip = await clientIp();
  const ipLimit = rateLimit("otp:ip", ip, OTP_IP_RULE());
  if (!ipLimit.ok) return { error: rateLimitMessage(ipLimit.retryAfterSec) };

  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, blockedAt: true } });
  if (!user) {
    // مثل ورود با ایمیل: کسی که حساب ندارد باید بداند قدم بعدی‌اش چیست
    const state = await accessStateByPhone(phone);
    if (state === "ALLOWED")
      return { error: "این شماره مجاز است ولی هنوز به حسابی وصل نیست؛ ثبت‌نام کن و همین شماره را وارد کن.", access: "NO_ACCOUNT", phone };
    if (state === "PENDING") return { error: "درخواست دسترسی‌ات ثبت شده و در انتظار تأیید برگزارکننده است.", access: "PENDING", phone };
    if (state === "REJECTED")
      return { error: "درخواست دسترسی‌ات رد شده است؛ اگر فکر می‌کنی اشتباهی رخ داده، دوباره درخواست بده.", access: "REJECTED", phone };
    return {
      error: "این شماره به هیچ حسابی وصل نیست. اگر حساب داری با ایمیل وارد شو و شماره را در پروفایل ثبت کن؛ وگرنه درخواست دسترسی بده.",
      access: "NONE",
      phone,
    };
  }
  if (user.blockedAt) return { error: BLOCKED };

  const res = await requestOtp(phone, "LOGIN");
  if (!res.ok) return { error: res.error, retryAfterSec: res.retryAfterSec };
  return { ok: true, phone, ttlSec: res.ttlSec, resendSec: res.resendSec, devCode: res.devCode };
}

/** مرحلهٔ دوم: کد را بررسی و نشست می‌سازد */
export async function verifyLoginOtpAction(input: { phone: string; code: string; next?: string | null }): Promise<LoginResult | never> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { error: "شمارهٔ موبایل معتبر نیست." };

  const limit = rateLimitPeek("otp:verify", phone, OTP_VERIFY_PHONE_RULE());
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return { error: "این شماره به هیچ حسابی وصل نیست." };
  if (user.blockedAt) return { error: BLOCKED };

  const res = await verifyOtp(phone, "LOGIN", toEnDigitsSafe(input.code));
  if (!res.ok) {
    rateLimit("otp:verify", phone, OTP_VERIFY_PHONE_RULE());
    return { error: res.error };
  }

  await createSession(user.id, user.sessionVersion);
  redirect(safeNext(input.next) ?? "/");
}

function toEnDigitsSafe(code: string) {
  return toEnDigits(String(code ?? "")).replace(/\s/g, "");
}
