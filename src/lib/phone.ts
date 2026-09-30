import { toEnDigits } from "./persian";

/** شماره‌های آزمایشی (کاربران seed): هرگز پیامک واقعی به آن‌ها فرستاده نمی‌شود */
export const TEST_PHONE_RE = /^099999999\d\d$/;

/**
 * موبایل ایران را به شکل استاندارد ۰۹xxxxxxxxx درمی‌آورد؛ null اگر معتبر نبود.
 * ارقام فارسی/عربی، فاصله، خط تیره و پیشوندهای +98 / 0098 / 98 پذیرفته می‌شوند.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = toEnDigits(String(raw)).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** نمایش نیمه‌پوشیده برای پیام‌ها: ۰۹۱۲•••۴۵۶۷ */
export function maskPhone(phone: string) {
  return `${phone.slice(0, 4)}•••${phone.slice(-4)}`;
}
