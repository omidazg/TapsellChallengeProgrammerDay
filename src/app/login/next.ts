/**
 * مسیر بازگشت امن پس از ورود — فقط مسیرهای نسبیِ داخلی مجازند (جلوگیری از open redirect).
 * مرورگر «\» را مثل «/» می‌خواند و نویسه‌های کنترلی (تب/خط‌جدید) را حذف می‌کند؛
 * پس «/\evil.com» یا «/\t/evil.com» عملاً «//evil.com» می‌شوند و باید رد شوند.
 */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || next.length > 512) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return null;
  return next;
}
