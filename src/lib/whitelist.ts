import { prisma } from "./db";
import { getSetting } from "./phase";
import { isEmailAllowed } from "./auth";

/** کلید Setting روشن/خاموش‌بودن لیست سفید؛ پیش‌فرض روشن */
export const WHITELIST_SETTING = "whitelist_enabled";

export const ACCESS_STATUS_LABEL: Record<string, string> = {
  PENDING: "در انتظار بررسی",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isWhitelistEnabled() {
  return (await getSetting(WHITELIST_SETTING, "1")) !== "0";
}

export async function isWhitelisted(email: string) {
  const row = await prisma.allowedEmail.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } });
  return !!row;
}

/**
 * آیا این ایمیل اجازهٔ ساخت حساب دارد؟
 * لیست سفید روشن: فقط ایمیل‌های فهرست. خاموش: قاعدهٔ قدیمی دامنه (ALLOWED_EMAIL_DOMAINS)
 * — ایمیلی که ادمین صریحاً در فهرست گذاشته در هر حال مجاز است.
 */
export async function canRegister(email: string) {
  if (await isWhitelisted(email)) return true;
  if (await isWhitelistEnabled()) return false;
  return isEmailAllowed(normalizeEmail(email));
}

export type AccessState = "ALLOWED" | "PENDING" | "REJECTED" | "NONE";

/** وضعیت دسترسی ایمیلی که هنوز حساب ندارد؛ برای راهنمایی در صفحهٔ ورود و ثبت‌نام */
export async function accessState(email: string): Promise<AccessState> {
  if (await canRegister(email)) return "ALLOWED";
  const req = await prisma.accessRequest.findUnique({ where: { email: normalizeEmail(email) }, select: { status: true } });
  if (req?.status === "PENDING") return "PENDING";
  if (req?.status === "REJECTED") return "REJECTED";
  return "NONE";
}
