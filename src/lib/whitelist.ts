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

/** ایمیل یا شمارهٔ موبایل (در صورت وجود) در لیست سفید است؟ */
export async function isWhitelisted(email: string, phone?: string | null) {
  const or: { email?: string; phone?: string }[] = [{ email: normalizeEmail(email) }];
  if (phone) or.push({ phone });
  const row = await prisma.allowedEmail.findFirst({ where: { OR: or }, select: { id: true } });
  return !!row;
}

/**
 * آیا این ایمیل (یا شمارهٔ تأییدشده) اجازهٔ ساخت حساب دارد؟
 * لیست سفید روشن: فقط ایمیل/شماره‌های فهرست. خاموش: قاعدهٔ قدیمی دامنه (ALLOWED_EMAIL_DOMAINS)
 * — ایمیلی که ادمین صریحاً در فهرست گذاشته در هر حال مجاز است.
 */
export async function canRegister(email: string, phone?: string | null) {
  if (await isWhitelisted(email, phone)) return true;
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

/** همان وضعیت، برای شماره‌ای که به هیچ حسابی وصل نیست (ورود با پیامک) */
export async function accessStateByPhone(phone: string): Promise<AccessState> {
  const listed = await prisma.allowedEmail.findUnique({ where: { phone }, select: { id: true } });
  if (listed) return "ALLOWED";
  const req = await prisma.accessRequest.findFirst({ where: { phone }, orderBy: { updatedAt: "desc" }, select: { status: true } });
  if (req?.status === "PENDING") return "PENDING";
  if (req?.status === "REJECTED") return "REJECTED";
  return "NONE";
}
