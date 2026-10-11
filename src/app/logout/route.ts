import { revokeCurrentSession } from "@/lib/auth";

/**
 * خروج از حساب — فقط با POST (فرم‌های AppShell و پروفایل).
 * GET پذیرفته نمی‌شود: یک <img src="/logout"> یا لینک در سایت دیگر نباید کاربر را بیرون کند.
 * کوکی نشست SameSite=lax است، پس POST بین‌سایتی اصلاً کوکی را با خود نمی‌آورد.
 *
 * علاوه بر پاک‌کردن کوکی، sessionVersion کاربر بالا می‌رود تا توکن دزدیده‌شده هم از کار بیفتد.
 *
 * وضعیت ۳۰۳ لازم است: با ۳۰۷ مرورگر همان متد POST را به «/» تکرار می‌کند و صفحه خطا می‌دهد.
 * Location نسبی است: پشت پراکسی (Caddy) `request.url` نشانی داخلی سرور
 * (`localhost:3000`) را دارد و ریدایرکت مطلق کاربر را به آن نشانی ناموجود می‌فرستاد.
 * no-store هم نمی‌گذارد مرورگر با دکمهٔ «بازگشت» نسخهٔ واردشدهٔ صفحه را از کش نشان دهد.
 */
export async function POST() {
  await revokeCurrentSession();
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
}

/** نشانی قدیمی /logout در نوار آدرس: بدون خروج به صفحهٔ اصلی برمی‌گردد */
export async function GET() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
}
