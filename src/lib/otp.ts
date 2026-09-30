import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { fa } from "./persian";
import { sendSms, otpEchoAllowed, smsEnabled } from "./sms";

export type OtpPurpose = "LOGIN" | "REGISTER" | "PROFILE";

/** اعتبار هر کد */
export const OTP_TTL_SEC = 120;
/** فاصلهٔ مجاز بین دو ارسال به یک شماره */
export const OTP_RESEND_SEC = 60;
/** سقف ارسال به یک شماره در یک ساعت */
const OTP_MAX_PER_HOUR = 5;
/** سقف تلاش اشتباه برای هر کد؛ بعد از آن کد باطل است */
const OTP_MAX_ATTEMPTS = 5;
const CODE_LEN = 6;

function hashCode(phone: string, purpose: OtpPurpose, code: string) {
  const secret = process.env.SESSION_SECRET ?? "dev-secret-change-me";
  return createHmac("sha256", secret).update(`${phone}:${purpose}:${code}`).digest("hex");
}

const SMS_TEXT: Record<OtpPurpose, (code: string) => string> = {
  LOGIN: (c) => `کد ورود میدان بنیان‌گذاران: ${c}\nاین کد را به کسی ندهید.`,
  REGISTER: (c) => `کد تأیید شماره در میدان بنیان‌گذاران: ${c}`,
  PROFILE: (c) => `کد تأیید شمارهٔ جدید در میدان بنیان‌گذاران: ${c}`,
};

export type OtpSendResult =
  | { ok: true; ttlSec: number; resendSec: number; devCode?: string }
  | { ok: false; error: string; retryAfterSec?: number };

/** کد تازه می‌سازد، کدهای قبلی همان منظور را باطل و پیامک را ارسال می‌کند */
export async function requestOtp(phone: string, purpose: OtpPurpose): Promise<OtpSendResult> {
  if (!smsEnabled()) return { ok: false, error: "ارسال پیامک در حال حاضر فعال نیست؛ با ایمیل و رمز وارد شو." };

  const now = Date.now();
  const recent = await prisma.otpCode.findMany({
    where: { phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const last = recent[0];
  if (last) {
    const wait = Math.ceil((last.createdAt.getTime() + OTP_RESEND_SEC * 1000 - now) / 1000);
    if (wait > 0) return { ok: false, error: `کد قبلی تازه فرستاده شده؛ ${fa(wait)} ثانیه دیگر دوباره تلاش کن.`, retryAfterSec: wait };
  }
  if (recent.length >= OTP_MAX_PER_HOUR) {
    return { ok: false, error: "تعداد درخواست کد برای این شماره زیاد بوده؛ کمی بعد دوباره تلاش کن." };
  }

  const code = String(randomInt(0, 10 ** CODE_LEN)).padStart(CODE_LEN, "0");
  await prisma.$transaction([
    prisma.otpCode.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
    prisma.otpCode.create({
      data: { phone, purpose, codeHash: hashCode(phone, purpose, code), expiresAt: new Date(now + OTP_TTL_SEC * 1000) },
    }),
  ]);

  try {
    await sendSms(phone, SMS_TEXT[purpose](code));
  } catch (err) {
    console.error("[otp] sms send failed", err);
    return { ok: false, error: "ارسال پیامک انجام نشد؛ کمی بعد دوباره تلاش کن." };
  }

  return { ok: true, ttlSec: OTP_TTL_SEC, resendSec: OTP_RESEND_SEC, ...(otpEchoAllowed(phone) ? { devCode: code } : {}) };
}

export type OtpVerifyResult = { ok: true } | { ok: false; error: string };

/** کد را بررسی و در صورت درستی مصرف می‌کند (هر کد فقط یک‌بار) */
export async function verifyOtp(phone: string, purpose: OtpPurpose, rawCode: string): Promise<OtpVerifyResult> {
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "کد شش‌رقمی را درست وارد کن." };

  const row = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) return { ok: false, error: "کد منقضی شده؛ کد تازه بگیر." };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, error: "تلاش‌های اشتباه زیاد بود؛ کد تازه بگیر." };

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(phone, purpose, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "کد اشتباه است." };
  }

  // مصرف اتمیک: دو درخواست هم‌زمان با یک کد فقط یکی موفق می‌شود
  const used = await prisma.otpCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (used.count === 0) return { ok: false, error: "این کد قبلاً استفاده شده؛ کد تازه بگیر." };
  return { ok: true };
}

/** اعتبار «گواهی شماره» پس از تأیید کد (ویزارد ثبت‌نام ممکن است چند دقیقه طول بکشد) */
const PROOF_TTL_SEC = 30 * 60;

/**
 * پس از تأیید موفق کد، یک گواهی امضاشدهٔ کوتاه‌عمر برمی‌گرداند تا مرحلهٔ بعدی (مثلاً ثبت نهایی)
 * بدون مصرف دوبارهٔ کد بداند این شماره واقعاً مال همین کاربر است.
 */
export function signPhoneProof(phone: string, purpose: OtpPurpose) {
  const exp = Math.floor(Date.now() / 1000) + PROOF_TTL_SEC;
  return `${exp}.${hashCode(phone, purpose, `proof:${exp}`)}`;
}

export function checkPhoneProof(token: string | null | undefined, phone: string, purpose: OtpPurpose) {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || !sig) return false;
  const expected = Buffer.from(hashCode(phone, purpose, `proof:${exp}`), "hex");
  const actual = Buffer.from(sig, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
