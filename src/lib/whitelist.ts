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

/**
 * ایمیل یا شمارهٔ موبایل (در صورت وجود) در لیست سفید است؟
 * هر ردیف فقط یک حساب می‌سازد: ردیفی که ایمیل یا شماره‌اش قبلاً حساب دارد مصرف شده است
 * (وگرنه یک نفر یک‌بار با شمارهٔ ردیف و ایمیلی دیگر، و یک‌بار با ایمیل ردیف ثبت‌نام می‌کرد).
 */
export async function isWhitelisted(email: string, phone?: string | null) {
  const or: { email?: string; phone?: string }[] = [{ email: normalizeEmail(email) }];
  if (phone) or.push({ phone });
  const rows = await prisma.allowedEmail.findMany({ where: { OR: or }, select: { email: true, phone: true } });
  for (const row of rows) {
    if (!(await isRowConsumed(row))) return true;
  }
  return false;
}

/** ردیفی که ایمیل یا شماره‌اش از قبل حساب دارد مصرف شده و حساب تازه‌ای نمی‌سازد */
async function isRowConsumed(row: { email: string; phone: string | null }) {
  const owners: { email?: string; phone?: string }[] = [{ email: row.email }];
  if (row.phone) owners.push({ phone: row.phone });
  return !!(await prisma.user.findFirst({ where: { OR: owners }, select: { id: true } }));
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

/**
 * همان وضعیت، برای شماره‌ای که به هیچ حسابی وصل نیست (ورود با پیامک).
 * ردیف لیست سفیدی که ایمیلش قبلاً حساب ساخته «مصرف‌شده» است (همان قاعدهٔ isWhitelisted)؛
 * گفتن ALLOWED برای آن کاربر را به ثبت‌نامی می‌فرستاد که canRegister ردش می‌کرد.
 */
export async function accessStateByPhone(phone: string): Promise<AccessState> {
  const listed = await prisma.allowedEmail.findUnique({ where: { phone }, select: { email: true, phone: true } });
  if (listed && !(await isRowConsumed(listed))) return "ALLOWED";
  const req = await prisma.accessRequest.findFirst({ where: { phone }, orderBy: { updatedAt: "desc" }, select: { status: true } });
  if (req?.status === "PENDING") return "PENDING";
  if (req?.status === "REJECTED") return "REJECTED";
  return "NONE";
}
