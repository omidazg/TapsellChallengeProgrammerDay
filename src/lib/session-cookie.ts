/**
 * ثابت‌های مشترک نشست بین lib/auth.ts و src/proxy.ts.
 * این فایل عمداً هیچ import سنگینی (prisma، bcrypt، next/headers) ندارد تا proxy سبک بماند.
 */

/** نام کوکی نشست */
export const SESSION_COOKIE = "arena_session";

/**
 * هدری که proxy مسیر درخواست (path + query) را در آن می‌گذارد تا requireUser بتواند
 * پس از ورود کاربر را به همان صفحه برگرداند. proxy مقدار ارسالی کاربر را بازنویسی می‌کند
 * و خواننده هم آن را فقط از صافی safeNext عبور می‌دهد.
 */
export const REQUEST_PATH_HEADER = "x-arena-path";

/** مسیرهایی که بدون ورود باز نمی‌شوند (هر صفحه‌شان requireUser/requireAdmin دارد) */
export const PROTECTED_PREFIXES = [
  "/team",
  "/idea",
  "/invest",
  "/build",
  "/market",
  "/auction",
  "/adslots",
  "/coins",
  "/wallet",
  "/notifications",
  "/profile",
  "/survey",
  "/results",
  "/admin",
] as const;

/**
 * زیرمسیرهای مسیرهای محافظت‌شده که بدون کوکی هم باید باز شوند:
 * بازگشت از درگاه پرداخت (ممکن است بین‌سایتی و بدون کوکی برسد)، درگاه آزمایشی،
 * و API وضعیت نظرسنجی که خودش ۴۰۱ JSON برمی‌گرداند.
 */
const PUBLIC_EXCEPTIONS = ["/coins/callback", "/coins/fake-gateway", "/survey/status"];

function underPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** آیا این مسیر بدون نشست باید به صفحهٔ ورود هدایت شود؟ */
export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_EXCEPTIONS.some((p) => underPrefix(pathname, p))) return false;
  return PROTECTED_PREFIXES.some((p) => underPrefix(pathname, p));
}

/** نشانی صفحهٔ ورود با مسیر بازگشت */
export function loginUrlFor(next: string | null): string {
  return next ? `/login?next=${encodeURIComponent(next)}` : "/login";
}
