import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER, SESSION_COOKIE, isProtectedPath, loginUrlFor } from "@/lib/session-cookie";

/**
 * Proxy (نام تازهٔ Middleware در Next 16): بررسی خوش‌بینانهٔ ورود.
 *
 * فقط «بودن» کوکی نشست بررسی می‌شود؛ اعتبار واقعی توکن (امضا، sessionVersion، مسدودی) همچنان
 * با requireUser روی سرور سنجیده می‌شود. کاربرِ بی‌کوکی روی صفحهٔ محافظت‌شده با ۳۰۷ به
 * /login?next=<مسیر> می‌رود تا پس از ورود به همان صفحه برگردد.
 *
 * درخواست‌های غیر GET (Server Action، بازگشت POST درگاه) هدایت نمی‌شوند: ۳۰۷ همان POST را به
 * /login تکرار می‌کرد. خود اکشن‌ها با requireUser محافظت شده‌اند.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isRead = request.method === "GET" || request.method === "HEAD";

  // پارامتر داخلی _rsc (ناوبری سمت کاربر) جزو مسیر بازگشت نیست
  const params = new URLSearchParams(search);
  params.delete("_rsc");
  const qs = params.toString();
  const path = qs ? `${pathname}?${qs}` : pathname;

  if (isRead && isProtectedPath(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    // نشانی هم‌میزبان است و Next آن را نسبی می‌کند؛ پشت Caddy هم به همان دامنهٔ کاربر برمی‌گردد
    return NextResponse.redirect(new URL(loginUrlFor(path), request.url), 307);
  }

  // مقدار ارسالی کاربر برای این هدر همیشه بازنویسی یا حذف می‌شود
  const headers = new Headers(request.headers);
  if (isRead) headers.set(REQUEST_PATH_HEADER, path);
  else headers.delete(REQUEST_PATH_HEADER);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    "/team/:path*",
    "/idea/:path*",
    "/invest/:path*",
    "/build/:path*",
    "/market/:path*",
    "/auction/:path*",
    "/adslots/:path*",
    "/coins/:path*",
    "/wallet/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/survey/:path*",
    "/results/:path*",
    "/admin/:path*",
  ],
};
