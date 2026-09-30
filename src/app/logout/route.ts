import { destroySession } from "@/lib/auth";

/**
 * خروج از حساب. وضعیت ۳۰۳ لازم است: با ۳۰۷ مرورگر همان متد POST را به «/» تکرار
 * می‌کند و صفحه خطا می‌دهد.
 *
 * Location نسبی است: پشت پراکسی (Caddy) `request.url` نشانی داخلی سرور
 * (`localhost:3000`) را دارد و ریدایرکت مطلق کاربر را به آن نشانی ناموجود می‌فرستاد.
 * no-store هم نمی‌گذارد مرورگر با دکمهٔ «بازگشت» نسخهٔ واردشدهٔ صفحه را از کش نشان دهد.
 */
async function logout() {
  await destroySession();
  return new Response(null, {
    status: 303,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
}

export async function POST() {
  return logout();
}

export async function GET() {
  return logout();
}
