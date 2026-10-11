/**
 * پیام خطای پیشنهاد حراج برای کاربر.
 * placeBid (lib/auction.ts) قواعد بازی را با Error و پیام فارسی رد می‌کند؛ فقط همین پیام‌های
 * شناخته‌شده به کاربر می‌رسند. هر خطای دیگر (Prisma، شبکه، باگ) ممکن است جزئیات داخلی
 * (نام جدول، کوئری، مسیر فایل) داشته باشد، پس پیام عمومی برمی‌گردد و خطای خام فقط در لاگ سرور می‌ماند.
 */

const KNOWN_BID_ERRORS = new Set([
  "مبلغ پیشنهاد نامعتبر است",
  "حراج پیدا نشد",
  "این حراج در حال حاضر زنده نیست",
  "حراج تمام شده است",
  "کاربر پیدا نشد",
  "نمی‌توانی روی نسخهٔ ویژهٔ تیم خودت پیشنهاد بدهی",
  "همین حالا بالاترین پیشنهاد با همین مبلغ از توست",
  "سکهٔ قابل‌خرج کافی نداری",
]);

/** «پیشنهاد باید حداقل ۲۵ سکه باشد» — عدد با ارقام فارسی (fa) */
const MIN_BID_RE = /^پیشنهاد باید حداقل [۰-۹٬,]+ سکه باشد$/;

export const GENERIC_BID_ERROR = "ثبت پیشنهاد انجام نشد؛ چند لحظه بعد دوباره تلاش کن.";

export function bidErrorMessage(e: unknown): string {
  // فقط Error ساده؛ زیرکلاس‌ها (مثل PrismaClientKnownRequestError) هرگز پیام دامنه نیستند
  if (e instanceof Error && e.constructor === Error) {
    if (KNOWN_BID_ERRORS.has(e.message) || MIN_BID_RE.test(e.message)) return e.message;
  }
  return GENERIC_BID_ERROR;
}
