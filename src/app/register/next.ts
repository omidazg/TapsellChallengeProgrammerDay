/** مسیر بازگشت امن پس از ثبت‌نام — فقط مسیرهای نسبیِ داخلی مجازند (جلوگیری از open redirect) */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
