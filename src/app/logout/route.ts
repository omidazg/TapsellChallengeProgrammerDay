import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

/**
 * خروج از حساب. وضعیت ۳۰۳ لازم است: با ۳۰۷ (پیش‌فرض NextResponse.redirect)
 * مرورگر همان متد POST را به «/» تکرار می‌کند و صفحه خطا می‌دهد.
 */
async function logout(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/", request.url), 303);
}

export async function POST(request: Request) {
  return logout(request);
}

export async function GET(request: Request) {
  return logout(request);
}
